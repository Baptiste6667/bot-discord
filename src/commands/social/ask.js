const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { executeLinkChange } = require('../../utils/familyService');
const { formatMention, getGif } = require('../../utils/helpers');

module.exports = {
    name: 'ask',
    aliases: [],
    description: 'Propose à un membre de se mettre en couple avec vous.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const author = message.author;
        const target = message.mentions.users.first();

        if (!target) return message.reply('Avec qui souhaites-tu te mettre en couple ?');
        if (target.id === authorId) return message.reply('C\'est beau l\'amour propre, mais choisis quelqu\'un d\'autre !');

        const authorData = await db.getOrCreateUser(guildId, authorId);
        if (authorData.couple || authorData.spouse) return message.reply('Tu es déjà engagé(e) !');

        const tData = await db.getOrCreateUser(guildId, target.id);
        if (tData.couple || tData.spouse) return message.reply(`${target.username} est déjà en couple ou marié(e).`);

        const askEmbed = new EmbedBuilder()
            .setTitle("💕 Nouvelle Relation ?")
            .setColor("#FF69B4")
            .setDescription(`${formatMention(target.id)}, **${author.username}** te propose de vous mettre en couple !`)
            .setImage(getGif('handhold'));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ask_ok').setLabel('Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ask_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ content: `${formatMention(target.id)}`, embeds: [askEmbed], components: [row] });
        const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === target.id, time: 60000 });

        collector.on('collect', async (i) => {
            await i.update({ components: [] });
            if (i.customId === 'ask_ok') {
                await executeLinkChange(guildId, authorId, target.id, 'couple', 'add');
                const success = new EmbedBuilder()
                    .setTitle("🎊 C'est officiel !")
                    .setColor("#FF69B4")
                    .setDescription(`Félicitations ! **${author.username}** et **${target.username}** sont désormais en couple !`)
                    .setImage(getGif('ask_accept'));
                await i.followUp({ embeds: [success] });
            } else {
                await i.followUp({ content: `😔 ${target.username} a refusé de se mettre en couple avec ${author.username}.`, embeds: [] });
            }
            collector.stop();
        });
    }
};
