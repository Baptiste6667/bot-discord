const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { executeLinkChange } = require('../../utils/familyService');
const { errorEmbed, successEmbed, ROLES_LIST } = require('../../utils/helpers');

module.exports = {
    name: 'adminfamily',
    aliases: [],
    description: 'Gestion administrative d\'une lignée (Admin uniquement).',
    persistent: false,
    typing: false,
    adminOnly: true,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        
        const familyName = args.join(' ');
        if (!familyName) {
            return message.channel.send({ embeds: [errorEmbed(`Usage: ,adminfamily <Nom>`)] });
        }

        const family = await db.getFamily(guildId, familyName);
        if (!family) {
            return message.channel.send({ embeds: [errorEmbed(`Famille "${familyName}" introuvable.`)] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🛠️ Admin : Famille ${familyName.toUpperCase()}`)
            .setColor("#e74c3c")
            .setDescription("Sélectionnez une action administrative.");

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_add').setLabel('Ajouter un membre').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('admin_modify').setLabel('Modifier un membre').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_remove').setLabel('Supprimer un membre').setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_transfer').setLabel('Transférer Chef').setStyle(ButtonStyle.Primary).setEmoji('👑'),
            new ButtonBuilder().setCustomId('admin_rename').setLabel('Renommer').setStyle(ButtonStyle.Secondary).setEmoji('🏷️'),
            new ButtonBuilder().setCustomId('admin_history').setLabel('Historique').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
            new ButtonBuilder().setCustomId('admin_clear').setLabel('Supprimer Famille').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('admin_cancel').setLabel('Fermer').setStyle(ButtonStyle.Secondary)
        );

        const msg = await message.channel.send({ embeds: [embed], components: [row1, row2] });
        const coll = msg.createMessageComponentCollector({ 
            filter: (i) => i.user.id === authorId && i.customId.startsWith('admin_'),
            time: 120000 
        });

        coll.on('collect', async (i) => {
            if (i.user.id !== authorId) return i.reply({ content: "❌ Seul l'administrateur ayant invoqué la commande peut interagir.", flags: MessageFlags.Ephemeral });

            if (i.customId === 'admin_cancel') return i.message.delete().catch(() => {});

            if (i.customId === 'admin_history') {
                const historyEmbed = new EmbedBuilder()
                    .setTitle(`📜 Histoire des ${family.familyName.toUpperCase()}`)
                    .setColor('#f1c40f')
                    .setDescription(family.history.map(h => `• [${new Date(h.date).toLocaleDateString('fr-FR')}] ${h.action}`).reverse().join('\n') || "Aucun événement enregistré.")
                    .setTimestamp();
                return i.reply({ embeds: [historyEmbed], flags: MessageFlags.Ephemeral });
            }

            if (i.customId === 'admin_rename') {
                const modal = new ModalBuilder().setCustomId('admin_modal_rename').setTitle('Renommer (Admin)');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                return i.showModal(modal);
            }

            if (i.customId === 'admin_clear') {
                await i.deferUpdate();
                for (const mId of family.members) {
                    await db.updateUser(guildId, mId, { familyName: null, spouse: null, children: [], mother: null, father: null });
                }
                await db.deleteFamily(guildId, familyName);
                await i.message.delete().catch(() => {});
                return i.channel.send({ embeds: [successEmbed(`Famille **${familyName.toUpperCase()}** supprimée.`)] });
            }

            const action = i.customId.replace('admin_', '');
            let targetSelectRow;
            if (action === 'add' || action === 'transfer') {
                targetSelectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('target').setPlaceholder('Choisir le membre à ajouter...'));
            } else {
                const filteredMembers = family.members.filter(mId => mId !== family.head);
                
                if (filteredMembers.length === 0) {
                    return i.reply({ content: "❌ Aucun autre membre à modifier ou retirer.", flags: MessageFlags.Ephemeral });
                }

                const memberOptions = await Promise.all(filteredMembers.map(async (mId) => {
                    const user = message.client.users.cache.get(mId) || await message.client.users.fetch(mId).catch(() => null);
                    return { label: user ? user.username : mId, value: mId };
                })); 
                targetSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('target').setPlaceholder(`Choisir le membre à ${action === 'remove' ? 'retirer' : 'modifier'}...`).addOptions(memberOptions));
            }
            await i.update({ content: `Action: **${action}**. Sélectionnez le membre.`, components: [targetSelectRow], embeds: [] });

            try {
                const ui = await msg.awaitMessageComponent({ 
                    filter: subI => subI.user.id === authorId && subI.customId === 'target', 
                    time: 60000 
                });
                await ui.deferUpdate();

                const targetId = ui.values[0];
                const targetData = await db.getOrCreateUser(guildId, targetId);

                if (action === 'add' && targetData.familyName === family.familyName) {
                    await ui.followUp({ content: "❌ Cet utilisateur est déjà dans cette famille.", flags: MessageFlags.Ephemeral });
                    return;
                }
                if ((action === 'remove' || action === 'modify') && targetData.familyName !== family.familyName) {
                    await ui.followUp({ content: "❌ Cet utilisateur n'est pas dans cette famille.", flags: MessageFlags.Ephemeral });
                    return;
                }

                if (action === 'remove') {
                    await db.clearUserFamilyLinksDB(guildId, targetId);
                    await msg.delete().catch(() => {});
                    return ui.channel.send({ embeds: [successEmbed(`Membre <@${targetId}> retiré de la famille.`)] });
                }
                
                if (action === 'transfer') {
                    await db.updateFamily(guildId, family.familyName, { head: targetId });
                    await db.addFamilyLog(guildId, family.familyName, `👑 Le commandement a été transféré à <@${targetId}> par un administrateur.`);
                    await msg.delete().catch(() => {});
                    return ui.channel.send({ embeds: [successEmbed(`Nouveau chef de famille : <@${targetId}>.`)] });
                }

                const rMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('role').setPlaceholder('Rôle...').addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))));
                const rBtnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cancel_role').setLabel('Annuler').setStyle(ButtonStyle.Danger));
                
                await ui.editReply({ content: `Attribuer un rôle à <@${targetId}> :`, components: [rMenu, rBtnRow] });

                try {
                    const ri = await msg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && ['role', 'cancel_role'].includes(subI.customId), 
                        time: 60000 
                    });
                    await ri.deferUpdate();
                    
                    if (ri.customId === 'cancel_role') return msg.delete().catch(() => {});
                    
                    await executeLinkChange(guildId, family.head, targetId, ri.values[0], 'add');
                    await db.updateUser(guildId, targetId, { familyName: family.familyName });
                    if (!family.members.includes(targetId)) {
                        family.members.push(targetId);
                        await db.updateFamily(guildId, family.familyName, { members: family.members });
                    }
                    await msg.delete().catch(() => {});
                    return ri.channel.send({ embeds: [successEmbed(`Rôle **${ri.values[0]}** mis à jour pour <@${targetId}>.`)] });
                } catch (e) {
                    console.error("Erreur sélection rôle admin:", e);
                    await msg.edit({ content: "Action annulée ou temps écoulé pour le choix du rôle.", components: [] }).catch(() => {});
                }
            } catch (e) {
                console.error("Erreur sélection membre admin:", e);
                if (msg) await msg.edit({ embeds: [errorEmbed("Action annulée ou temps écoulé.")], components: [] }).catch(() => {});
            }
        });

        coll.on('end', () => msg.delete().catch(() => {}));
    }
};
