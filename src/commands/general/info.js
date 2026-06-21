const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { formatMention, successEmbed, errorEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'info',
    aliases: [],
    description: 'Affiche ou modifie votre profil familial ou celui d\'un autre membre.',
    persistent: true,
    typing: true,
    async execute(message, args, isAdminCmd = false) {
        const guildId = message.guild.id;
        const authorId = message.author.id;

        let targetUser = message.mentions.users.first();
        if (!targetUser && args[0]) {
            targetUser = message.client.users.cache.get(args[0]) || await message.client.users.fetch(args[0]).catch(() => null);
        }
        if (!targetUser) targetUser = message.author;

        const userData = await db.getOrCreateUser(guildId, targetUser.id);
        const family = userData.familyName ? await db.getFamily(guildId, userData.familyName) : null;

        const buildEmbed = async () => {
            const fData = userData.father ? await db.getOrCreateUser(guildId, userData.father) : null;
            const mData = userData.mother ? await db.getOrCreateUser(guildId, userData.mother) : null;
            const fLabel = fData?.gender === 'féminin' ? '👩 Mère (1)' : '👨 Père';
            const mLabel = mData?.gender === 'masculin' ? '👨 Père (2)' : '👩 Mère';

            return new EmbedBuilder()
                .setTitle(`Profil Familial - ${targetUser.username}`)
                .setColor('#3498db')
                .addFields(
                    { name: '🏷️ Nom de Famille', value: userData.familyName ? userData.familyName.toUpperCase() : 'Aucun', inline: true },
                    { name: '📛 Nom Affiché', value: userData.nickname || '*Non défini (Pseudo par défaut)*', inline: true },
                    { name: '🎭 Rang', value: family?.head === targetUser.id ? "Chef" : (userData.familyName ? "Membre" : "Aucun"), inline: true },
                    { name: '👤 Genre', value: userData.gender || 'Non défini', inline: true },
                    { name: '📝 Bio', value: userData.bio || 'Aucune bio définie.', inline: false },
                    { name: '💕 Relation', value: userData.spouse ? `Marié(e) à ${formatMention(userData.spouse)}` : (userData.couple ? `En couple avec ${formatMention(userData.couple)}` : 'Célibataire'), inline: true },
                    { name: fLabel, value: userData.father ? formatMention(userData.father) : 'Inconnu', inline: true },
                    { name: mLabel, value: userData.mother ? formatMention(userData.mother) : 'Inconnue', inline: true }
                );
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`edit_p_${targetUser.id}`).setLabel('✏️ Modifier Profil').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cancel_info').setLabel('Fermer').setStyle(ButtonStyle.Secondary)
        );

        const canEdit = targetUser.id === authorId || isAdminCmd;
        const msg = await message.channel.send({ embeds: [await buildEmbed()], components: canEdit ? [row] : [] });

        const coll = msg.createMessageComponentCollector({ time: 60000 });
        
        coll.on('collect', async (i) => {
            if (i.user.id !== authorId) return i.reply({ content: "❌ Seul l'invocateur peut interagir.", flags: MessageFlags.Ephemeral });
            
            if (i.customId === 'cancel_info') {
                await i.deferUpdate();
                return msg.delete().catch(() => {});
            }
            if (i.customId.startsWith('back_info_')) {
                return i.update({ content: null, embeds: [await buildEmbed()], components: [row] });
            }
            if (i.customId.startsWith('edit_p_')) {
                const tid = i.customId.split('_')[2];
                const editRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_bio_${tid}`).setLabel('Bio').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
                    new ButtonBuilder().setCustomId(`btn_gender_${tid}`).setLabel('Genre').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
                    new ButtonBuilder().setCustomId(`btn_nickname_${tid}`).setLabel('Nom Arbre').setStyle(ButtonStyle.Primary).setEmoji('📛')
                );
                const editRow2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_name_${tid}`).setLabel('Renommer Branche').setStyle(ButtonStyle.Secondary).setEmoji('🏷️'),
                    new ButtonBuilder().setCustomId(`btn_spouse_${tid}`).setLabel('Nom Conjoint').setStyle(ButtonStyle.Secondary).setEmoji('💍')
                );
                const editRow3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`back_info_${tid}`).setLabel('Retour').setStyle(ButtonStyle.Danger)
                );
                return i.update({ content: `**Modification du profil de <@${tid}>**`, embeds: [], components: [editRow1, editRow2, editRow3] });
            }
            if (i.customId.startsWith('btn_bio_')) {
                const tid = i.customId.split('_')[2];
                const modal = new ModalBuilder().setCustomId(`modal_bio_${tid}`).setTitle('Modifier la Bio');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bio_text').setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(true)));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('btn_nickname_')) {
                const tid = i.customId.split('_')[2];
                const modal = new ModalBuilder().setCustomId(`modal_nickname_${tid}`).setTitle('Nom sur l\'arbre');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nick_text').setLabel("Surnom (max 12 car.)").setStyle(TextInputStyle.Short).setMaxLength(12).setRequired(true)));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('btn_gender_')) {
                const tid = i.customId.split('_')[2];
                const gRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sel_gen_${tid}`).setPlaceholder('Genre...')
                    .addOptions([{ label: 'Masculin', value: 'masculin' }, { label: 'Féminin', value: 'féminin' }, { label: 'Autre', value: 'autre' }]));
                return i.update({ content: "Choisissez votre genre :", components: [gRow] });
            }
            if (i.customId.startsWith('sel_gen_')) {
                const tid = i.customId.split('_')[2];
                await db.updateUser(guildId, tid, { gender: i.values[0] });
                return i.update({ content: "✅ Genre mis à jour.", components: [] }); 
            }
            if (i.customId.startsWith('btn_name_')) {
                const tid = i.customId.split('_')[2];
                const modal = new ModalBuilder().setCustomId(`modal_rename_branch_${tid}`).setTitle('Nom de Branche');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('btn_spouse_')) {
                const tid = i.customId.split('_')[2];
                const targetData = await db.getOrCreateUser(guildId, tid);
                if (!targetData.spouse) return i.reply({ content: "Pas de conjoint.", flags: MessageFlags.Ephemeral });
                const sData = await db.getOrCreateUser(guildId, targetData.spouse);
                if (!sData.familyName) return i.reply({ content: "Pas de nom de famille.", flags: MessageFlags.Ephemeral });
                
                await db.clearUserFamilyLinksDB(guildId, tid);
                await db.updateUser(guildId, tid, { familyName: sData.familyName });
                const targetFam = await db.getFamily(guildId, sData.familyName);
                if (targetFam && !targetFam.members.includes(tid)) {
                    targetFam.members.push(tid);
                    await db.updateFamily(guildId, sData.familyName, { members: targetFam.members });
                }
                return i.update({ content: "💍 Nom adopté !", components: [] });
            }
        });

        coll.on('end', () => { if (msg) msg.delete().catch(() => {}); });
    }
};
