const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { executeLinkChange, areRelated } = require('../../utils/familyService');
const { formatMention, getGif } = require('../../utils/helpers');

module.exports = {
    name: 'marry',
    aliases: [],
    description: 'Demande un membre en mariage et fonde ou unit vos dynasties.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const author = message.author;
        const target = message.mentions.users.first();

        if (!target) return message.reply('Qui veux-tu épouser ?');
        if (target.id === authorId) return message.reply('Tu ne peux pas t\'épouser toi-même !');

        const authorData = await db.getOrCreateUser(guildId, authorId);
        const targetData = await db.getOrCreateUser(guildId, target.id);

        if (authorData.spouse) return message.reply(`Tu es déjà marié(e) à ${formatMention(authorData.spouse)}.`);
        if (targetData.spouse) return message.reply(`${formatMention(target.id)} est déjà marié(e).`);

        const rel = await areRelated(guildId, authorId, target.id);
        if (['père', 'mère', 'enfant', 'parent', 'frère/soeur'].includes(rel)) {
            return message.reply(`❌ Opération interdite ! Tu ne peux pas épouser un membre de ta famille proche (**${rel}**).`);
        }

        const marryEmbed = new EmbedBuilder()
            .setTitle("💖 Demande en Mariage")
            .setColor("#FF69B4")
            .setDescription(`${formatMention(target.id)}, ${formatMention(authorId)} te demande en mariage !`)
            .setFooter({ text: "Tu as 60 secondes pour répondre." });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('m_accept').setLabel('Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('m_decline').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ content: `${formatMention(target.id)}`, embeds: [marryEmbed], components: [row] });
        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === target.id,
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async (i) => {
            await i.update({ components: [] });

            if (i.customId === 'm_accept') {
                const currentAuthorData = await db.getOrCreateUser(guildId, authorId);
                const currentTargetData = await db.getOrCreateUser(guildId, target.id);

                if (currentAuthorData.spouse || currentTargetData.spouse) {
                    await i.followUp({ content: "L'un de vous est déjà marié(e) ! La demande est annulée.", flags: MessageFlags.Ephemeral });
                    return msg.delete().catch(() => {});
                }

                const choiceEmbed = new EmbedBuilder()
                    .setTitle("💍 Choix de Lignée")
                    .setColor("#FF69B4")
                    .setDescription(`Mariage accepté ! Quel nom de famille souhaitez-vous porter ?`);

                const nameA = currentAuthorData.familyName || author.username;
                const nameB = currentTargetData.familyName || target.username;
                const mixed = `${nameA.substring(0, 4)}${nameB.substring(0, 4)}`.toLowerCase();

                const choiceRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('name_a').setLabel(`Nom de ${author.username}`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('name_b').setLabel(`Nom de ${target.username}`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('name_mix').setLabel(`Mixte (${mixed})`).setStyle(ButtonStyle.Secondary)
                );

                const choiceMsg = await i.followUp({ embeds: [choiceEmbed], components: [choiceRow] });
                const choiceColl = choiceMsg.createMessageComponentCollector({ filter: ui => [authorId, target.id].includes(ui.user.id), time: 30000 });

                choiceColl.on('collect', async (ui) => {
                    await ui.deferUpdate();
                    let selectedName = ui.customId === 'name_a' ? nameA : (ui.customId === 'name_b' ? nameB : mixed);
                    if (!selectedName.toLowerCase().endsWith('-famille')) selectedName += '-famille';

                    if (currentAuthorData.familyName && currentAuthorData.familyName !== selectedName) {
                         await db.mergeFamilies(guildId, selectedName, currentAuthorData.familyName, authorId, target.id, 'conjoint');
                    }
                    if (currentTargetData.familyName && currentTargetData.familyName !== selectedName) {
                         await db.mergeFamilies(guildId, selectedName, currentTargetData.familyName, authorId, target.id, 'conjoint');
                    }
                    
                    if (!await db.getFamily(guildId, selectedName)) {
                        await db.createFamily(guildId, selectedName, authorId);
                    }
                    
                    const finalFam = await db.getFamily(guildId, selectedName);
                    if (!finalFam.members.includes(authorId)) finalFam.members.push(authorId);
                    if (!finalFam.members.includes(target.id)) finalFam.members.push(target.id);
                    await db.updateFamily(guildId, selectedName, { members: finalFam.members });
                    await db.updateUser(guildId, authorId, { familyName: selectedName });
                    await db.updateUser(guildId, target.id, { familyName: selectedName });

                    await executeLinkChange(guildId, authorId, target.id, 'conjoint', 'add');
                    await db.addFamilyLog(guildId, selectedName, `💍 Mariage célébré entre <@${authorId}> et <@${target.id}> sous le nom ${selectedName.toUpperCase()}`);

                    const finalEmbed = new EmbedBuilder().setTitle('🎊 Mariage Célébré !').setColor('#FF69B4').setImage(getGif('marry_accept'))
                        .setDescription(`🎉 Félicitations aux mariés ! Ils portent désormais le nom de la lignée **${selectedName.toUpperCase()}**.`);
                    
                    await choiceMsg.edit({ embeds: [finalEmbed], components: [] });
                    await msg.delete().catch(() => {});
                    choiceColl.stop();
                });
            } else if (i.customId === 'm_decline') {
                const declineEmbed = new EmbedBuilder()
                    .setTitle('💔 Un Coeur Brisé...')
                    .setColor('#95a5a6')
                    .setDescription(`L'amour n'est pas au rendez-vous aujourd'hui... ${formatMention(target.id)} a poliment décliné la proposition de ${formatMention(authorId)}.`)
                    .setImage(getGif('marry_decline'))
                    .setFooter({ text: 'Peut-être une prochaine fois ?' });

                await i.followUp({ embeds: [declineEmbed] });
                await msg.delete().catch(() => {});
            }
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await msg.delete().catch(() => {});
                await message.channel.send(`⌛ La demande en mariage de ${formatMention(authorId)} à ${formatMention(target.id)} a expiré.`);
            }
        });
    }
};
