const { Events, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { propagateNameChange } = require('../utils/familyService');
const { successEmbed, errorEmbed } = require('../utils/helpers');

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        if (!interaction.isModalSubmit() || !interaction.guildId) return;

        const guildId = interaction.guildId;
        
        if (interaction.customId === 'modal_create_fam') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const nameInput = interaction.fields.getTextInputValue('fam_name').trim();
                const name = nameInput.toLowerCase();
                console.log(`[DEBUG] Tentative de création famille: "${name}" sur serveur: ${guildId}`);

                if (await db.getFamily(guildId, name)) {
                    return interaction.editReply({ content: `❌ Le nom "**${nameInput.toUpperCase()}**" est déjà utilisé sur ce serveur.` });
                }

                const uData = await db.getOrCreateUser(guildId, interaction.user.id);
                if (uData.familyName) {
                    return interaction.editReply({ content: `❌ Vous possédez déjà une lignée (**${uData.familyName.toUpperCase()}**).` });
                }

                await db.createFamily(guildId, name, interaction.user.id);
                await db.updateUser(guildId, interaction.user.id, { familyName: name });
                await interaction.editReply({ embeds: [successEmbed(`Famille **${nameInput.toUpperCase()}** fondée !`)] });
            } catch (err) {
                console.error("Erreur création famille via modal:", err);
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed("Une erreur est survenue lors de la création de la famille.")] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed("Une erreur est survenue lors de la création de la famille.")], flags: MessageFlags.Ephemeral });
                }
            }
        }

        if (interaction.customId.startsWith('modal_bio')) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const targetId = interaction.customId.split('_')[2] || interaction.user.id;
                await db.updateUser(guildId, targetId, { bio: interaction.fields.getTextInputValue('bio_text') });
                await interaction.editReply({ content: "✅ Bio mise à jour !" });
            } catch (err) {
                console.error("Erreur bio:", err);
                if (interaction.deferred) await interaction.editReply({ content: "❌ Impossible de mettre à jour la bio." });
            }
        }

        if (interaction.customId.startsWith('modal_nickname')) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const targetId = interaction.customId.split('_')[2] || interaction.user.id;
                await db.updateUser(guildId, targetId, { nickname: interaction.fields.getTextInputValue('nick_text') });
                await interaction.editReply({ content: "✅ Nom d'affichage mis à jour sur l'arbre !" });
            } catch (err) {
                console.error("Erreur nickname:", err);
                if (interaction.deferred) await interaction.editReply({ content: "❌ Erreur lors de la mise à jour du nom." });
            }
        }

        if (interaction.customId === 'admin_modal_rename') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
                const oldName = interaction.message.embeds[0].title.split('Famille ')[1].toLowerCase();
                
                if (await db.getFamily(guildId, newName)) {
                    return interaction.editReply({ content: "❌ Ce nom est déjà pris." });
                }
                
                const family = await db.getFamily(guildId, oldName);
                if (!family) return interaction.editReply({ content: "❌ Famille introuvable." });

                await db.createFamily(guildId, newName, family.head);
                await db.updateFamily(guildId, newName, { members: family.members, history: family.history });
                for (const mId of family.members) await db.updateUser(guildId, mId, { familyName: newName });
                await db.deleteFamily(guildId, oldName);
                await db.addFamilyLog(guildId, newName, `🏷️ Famille renommée de ${oldName.toUpperCase()} à ${newName.toUpperCase()} par un administrateur.`);
                await interaction.editReply({ content: `✅ Famille renommée en **${newName.toUpperCase()}** !` });
            } catch (err) {
                console.error("Erreur admin rename:", err);
                if (interaction.deferred) await interaction.editReply({ content: "❌ Erreur lors du renommage administratif." });
            }
        }

        if (interaction.customId.startsWith('modal_rename_branch')) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
                if (await db.getFamily(guildId, newName)) {
                    return interaction.editReply({ content: "❌ Nom déjà pris." });
                }
                
                const targetId = interaction.customId.split('_')[2] || interaction.user.id;
                const uData = await db.getOrCreateUser(guildId, targetId);
                const oldName = uData.familyName;
                const family = oldName ? await db.getFamily(guildId, oldName) : null;

                if (family?.head === targetId) {
                    await db.createFamily(guildId, newName, targetId);
                    await db.updateFamily(guildId, newName, { members: family.members });
                    for (const mId of family.members) await db.updateUser(guildId, mId, { familyName: newName });
                    await db.deleteFamily(guildId, oldName);
                    await db.addFamilyLog(guildId, newName, `🏷️ Dynastie renommée de ${oldName.toUpperCase()} à ${newName.toUpperCase()} par <@${interaction.user.id}>.`);
                    await interaction.editReply({ content: `✅ Dynastie renommée : **${newName.toUpperCase()}** !` });
                } else {
                    if (oldName && family) {
                        const remaining = family.members.filter(id => id !== targetId);
                        if (remaining.length === 0) await db.deleteFamily(guildId, oldName);
                        else await db.updateFamily(guildId, oldName, { members: remaining });
                    }
                    await db.createFamily(guildId, newName, targetId);
                    await db.updateUser(guildId, targetId, { familyName: newName });
                    await db.addFamilyLog(guildId, newName, `🏷️ Nouvelle branche fondée : ${newName.toUpperCase()} (issue de ${oldName.toUpperCase()}).`);
                    await propagateNameChange(guildId, targetId, oldName, newName);
                    await interaction.editReply({ content: `✅ Branche **${newName.toUpperCase()}** fondée !` });
                }
            } catch (err) {
                console.error("Erreur rename branch:", err);
                if (interaction.deferred) await interaction.editReply({ content: "❌ Une erreur est survenue (nom peut-être déjà utilisé simultanément)." });
            }
        }
    }
};
