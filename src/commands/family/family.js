const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { sendFamilyDisplay } = require('../../utils/canvas');
const { startFamilyVote, startMajorityMergeVote, sendInvitation, executeLinkChange, areRelated } = require('../../utils/familyService');
const { errorEmbed, successEmbed, ROLES_LIST } = require('../../utils/helpers');

module.exports = {
    name: 'family',
    aliases: [],
    description: 'Affiche le dashboard de gestion de votre famille ou l\'arbre d\'une lignée.',
    persistent: false,
    typing: true,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const author = message.author;
        const authorData = await db.getOrCreateUser(guildId, authorId);

        const isGlobalArg = args.some(a => ['global', 'lignée', 'toute'].includes(a.toLowerCase()));
        const searchArgs = args.filter(a => !['global', 'lignée', 'toute'].includes(a.toLowerCase()));

        if (searchArgs.length > 0) {
            let targetId = message.mentions.users.first()?.id;
            if (!targetId && searchArgs[0]?.match(/^\d{17,19}$/)) targetId = searchArgs[0];

            let family = null;
            if (targetId) {
                const targetData = await db.getOrCreateUser(guildId, targetId);
                if (targetData.familyName) family = await db.getFamily(guildId, targetData.familyName);
            }

            if (!family) {
                family = await db.getFamily(guildId, searchArgs.join(' '));
                if (family && !targetId) targetId = family.head;
            }

            if (!family || !targetId) {
                return message.reply({ embeds: [errorEmbed("Famille introuvable (utilisez un nom, une mention ou un ID).")] });
            }
            
            await sendFamilyDisplay(message, guildId, targetId, isGlobalArg);
            return;
        }

        // Show Family Dashboard
        let embed = new EmbedBuilder().setColor("#5865F2");
        let rows = [];

        embed.setTitle("🏠 Gestion de Famille");

        if (!authorData.familyName) {
            embed.setDescription("Vous ne possédez pas de famille. Souhaitez-vous fonder votre propre lignée ?");
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_fam').setLabel('Fonder une lignée').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancel_main').setLabel('Fermer').setStyle(ButtonStyle.Secondary)
            ));
        } else {
            const family = await db.getFamily(guildId, authorData.familyName);
            if (!family) {
                await db.updateUser(guildId, authorId, { familyName: null });
                embed.setDescription("Votre ancienne lignée n'existe plus. Souhaitez-vous en fonder une nouvelle ?");
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_fam').setLabel('Fonder une lignée').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_main').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
                ));
            } else {
                const isHead = family.head === authorId;
                embed.setDescription(`Dynastie : **${authorData.familyName.toUpperCase()}**\nRang : ${isHead ? "Chef" : "Membre"}`);

                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('view_branch').setLabel('Ma Branche').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('view_global').setLabel('Lignée Complète').setStyle(ButtonStyle.Success)
                ));

                const manageRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fam_add').setLabel('Ajouter un membre').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('fam_modify').setLabel('Modifier un rôle').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('fam_remove').setLabel('Enlever un membre').setStyle(ButtonStyle.Danger)
                );
                
                const manageRow2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fam_leave').setLabel('Quitter la famille').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('fam_rename').setLabel('Renommer Lignée').setStyle(ButtonStyle.Secondary).setEmoji('🏷️'),
                    new ButtonBuilder().setCustomId('fam_history').setLabel('Historique').setStyle(ButtonStyle.Secondary).setEmoji('📜')
                );
                
                if (isHead) manageRow2.addComponents(new ButtonBuilder().setCustomId('fam_delete').setLabel('Dissoudre la famille').setStyle(ButtonStyle.Danger));

                rows.push(manageRow1, manageRow2);
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cancel_main').setLabel('Fermer le menu').setStyle(ButtonStyle.Secondary)));
            }
        }

        const msg = await message.channel.send({ embeds: [embed], components: rows });
        const collector = msg.createMessageComponentCollector({ 
            filter: (i) => i.user.id === authorId && (i.customId.startsWith('fam_') || i.customId.startsWith('view_') || ['create_fam', 'confirm_del', 'cancel_main', 'leave_alone', 'leave_branch'].includes(i.customId)),
            time: 120000 
        });
        
        collector.on('collect', async (i) => {
            if (i.user.id !== authorId) return i.reply({ content: "❌ Seul l'auteur de la commande peut interagir avec ce menu.", flags: MessageFlags.Ephemeral });

            if (i.customId === 'cancel_main') return msg.delete().catch(() => {});

            if (i.customId === 'view_branch' || i.customId === 'view_global') {
                await i.deferUpdate();
                await msg.delete().catch(() => {});
                await sendFamilyDisplay(i, guildId, authorId, i.customId === 'view_global');
                return;
            }
            
            if (i.customId === 'create_fam') {
                const modal = new ModalBuilder().setCustomId('modal_create_fam').setTitle('Nouvelle Famille');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fam_name').setLabel("Nom de famille").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: Les Dupont")));
                return i.showModal(modal);
            }

            if (i.customId === 'confirm_del') {
                const family = await db.getFamily(guildId, authorData.familyName);
                if (family) {
                    for (const mId of family.members) {
                        await db.updateUser(guildId, mId, { familyName: null, spouse: null, children: [], mother: null, father: null, customLinks: {} });
                    }
                    await db.deleteFamily(guildId, family.familyName);
                    await i.update({ components: [] });
                    return i.channel.send({ embeds: [successEmbed(`La famille **${family.familyName.toUpperCase()}** a été dissoute.`)] });
                }
                return;
            }

            if (i.customId.startsWith('fam_')) {
                const action = i.customId.replace('fam_', '');

                if (action === 'cancel') {
                    return msg.delete().catch(() => {});
                }

                if (action === 'history') {
                    const family = await db.getFamily(guildId, authorData.familyName);
                    const historyEmbed = new EmbedBuilder()
                        .setTitle(`📜 Histoire des ${family.familyName.toUpperCase()}`)
                        .setColor('#f1c40f')
                        .setDescription(family.history.map(h => `• [${new Date(h.date).toLocaleDateString('fr-FR')}] ${h.action}`).reverse().join('\n') || "Aucun événement enregistré.")
                        .setTimestamp();
                    return i.reply({ embeds: [historyEmbed], flags: MessageFlags.Ephemeral });
                }

                if (action === 'rename') {
                    const modal = new ModalBuilder().setCustomId('modal_rename_branch').setTitle('Renommer la Lignée');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal);
                }

                if (action === 'delete') {
                    const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_del').setLabel('Confirmer la dissolution').setStyle(ButtonStyle.Danger));
                    return i.update({ content: "⚠️ Dissoudre la famille ?", components: [confirm] });
                }
                
                if (action === 'leave') {
                    const isBranch = authorData.familyName && authorData.familyName.includes('-');
                    if (isBranch) {
                        const leaveRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('leave_alone').setLabel('Quitter Seul').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('leave_branch').setLabel('Quitter avec ma Branche').setStyle(ButtonStyle.Danger)
                        );
                        return i.update({ content: "Voulez-vous quitter la lignée seul ou emmener toute votre branche avec vous ?", components: [leaveRow] });
                    } else {
                        await i.deferUpdate();
                        await db.clearUserFamilyLinksDB(guildId, authorId);
                        return i.editReply({ content: `👋 ${message.author} a quitté sa famille.`, components: [], embeds: [] });
                    }
                }

                if (i.customId === 'leave_alone') {
                    await db.clearUserFamilyLinksDB(guildId, authorId);
                    return i.update({ content: "✅ Vous avez quitté la famille.", components: [] });
                }

                if (i.customId === 'leave_branch') {
                    const branch = await db.getFamily(guildId, authorData.familyName);
                    if (branch.members.length > 1) {
                        return startMajorityMergeVote(guildId, i, author, author, branch, "Départ de Branche");
                    }
                    await db.clearUserFamilyLinksDB(guildId, authorId);
                    return i.update({ content: "✅ Branche dissoute.", components: [] });
                }

                let targetSelectRow;
                if (action === 'add') {
                    targetSelectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('u').setPlaceholder('Choisir le futur membre...'));
                } else {
                    const family = await db.getFamily(guildId, authorData.familyName);
                    const filteredMembers = family.members.filter(mId => mId !== authorId);

                    if (filteredMembers.length === 0) {
                        return i.reply({ content: "❌ Votre famille ne contient aucun autre membre à gérer.", flags: MessageFlags.Ephemeral });
                    }

                    const memberOpts = await Promise.all(filteredMembers.map(async (mId) => {
                        const user = message.client.users.cache.get(mId) || await message.client.users.fetch(mId).catch(() => null);
                        return { label: user ? user.username : mId, value: mId };
                    }));
                    targetSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('u').setPlaceholder('Choisir le membre de la famille...').addOptions(memberOpts));
                }
                await i.update({ content: `Action : **${action}**.`, components: [targetSelectRow], embeds: [] });

                try {
                    const ui = await i.message.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && subI.customId === 'u', 
                        time: 60000 
                    });
                    await ui.deferUpdate();

                    const targetId = ui.values[0];
                    const targetData = await db.getOrCreateUser(guildId, targetId);
                    const targetUser = message.client.users.cache.get(targetId) || await message.client.users.fetch(targetId).catch(() => null);

                    if (!targetUser) {
                        await ui.followUp({ content: "❌ Impossible de trouver cet utilisateur.", flags: MessageFlags.Ephemeral });
                        return msg.delete();
                    }

                    if (action === 'add' && (targetData.familyName === authorData.familyName || targetId === authorId)) {
                        await ui.followUp({ content: "❌ Cet utilisateur fait déjà partie de votre famille ou c'est vous-même.", flags: MessageFlags.Ephemeral });
                        return msg.delete();
                    }
                    if ((action === 'remove' || action === 'modify') && targetData.familyName !== authorData.familyName) {
                        await ui.followUp({ content: "❌ Cet utilisateur n'est pas dans votre famille.", flags: MessageFlags.Ephemeral });
                        return msg.delete();
                    }

                    if (action === 'remove') return startFamilyVote(guildId, ui, message.author, targetUser, 'Aucun', 'remove');

                    const rMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('r').setPlaceholder('Choisir le rôle...').addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))));
                    const rCancel = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('c_r').setLabel('Annuler').setStyle(ButtonStyle.Danger));
                    await ui.editReply({ content: `Rôle pour <@${targetUser.id}> :`, components: [rMenu, rCancel] });

                    const ri = await i.message.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && ['r', 'c_r'].includes(subI.customId), 
                        time: 60000 
                    });
                    
                    const selectedRole = ri.values?.[0];
                    
                    if (selectedRole === 'enfant') {
                        const family = await db.getFamily(guildId, authorData.familyName);
                        const potentialParents = await Promise.all(family.members.map(async id => {
                            const u = message.client.users.cache.get(id) || await message.client.users.fetch(id).catch(() => null); 
                            return { label: u?.username || id, value: id };
                        }));
                        
                        const pMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('p_select').setPlaceholder('Qui est le parent ?').addOptions(potentialParents.slice(0, 25)));
                        await ri.update({ content: `Sélectionnez le parent de **${targetUser.username}** au sein de la famille :`, components: [pMenu] });
                        
                        const pi = await i.message.awaitMessageComponent({ filter: subI => subI.user.id === authorId && subI.customId === 'p_select', time: 60000 });
                        const parentId = pi.values[0];
                        
                        const checkRel = await areRelated(guildId, parentId, targetId);
                        if (checkRel === 'conjoint(e)' || checkRel === 'mari' || checkRel === 'femme') {
                            return pi.reply({ content: "❌ Impossible d'adopter votre conjoint(e) comme enfant !", flags: MessageFlags.Ephemeral });
                        }

                        if (parentId === targetId) return pi.reply({ content: "❌ Un membre ne peut pas être son propre parent !", flags: MessageFlags.Ephemeral });

                        const parentData = await db.getOrCreateUser(guildId, parentId);

                        if (parentData.spouse) {
                            const spouseUser = await message.client.users.fetch(parentData.spouse);
                            const adoptRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('adopt_both').setLabel(`Les deux (${spouseUser.username})`).setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('adopt_single').setLabel('Seulement lui/elle').setStyle(ButtonStyle.Secondary)
                            );
                            await pi.update({ content: `**Couple détecté** : Souhaitez-vous lier l'enfant aux deux parents ?`, components: [adoptRow] });
                            const ai = await i.message.awaitMessageComponent({ filter: subI => subI.user.id === authorId, time: 30000 });
                            if (ai.customId === 'adopt_both') {
                                await executeLinkChange(guildId, parentData.spouse, targetId, 'enfant', 'add');
                            }
                            await ai.deferUpdate();
                        }
                        
                        if (action === 'add') {
                            await sendInvitation(guildId, pi, { id: parentId, username: (await message.client.users.fetch(parentId)).username }, targetUser, 'enfant', 'add');
                        } else {
                            await executeLinkChange(guildId, parentId, targetId, 'enfant', 'add');
                            await pi.update({ content: "✅ Lien de parenté mis à jour.", components: [] });
                        }
                        return;
                    }

                    if (['père', 'mère'].includes(selectedRole)) {
                         const family = await db.getFamily(guildId, authorData.familyName);
                         const potentialChildren = await Promise.all(family.members.map(async id => {
                            const u = message.client.users.cache.get(id) || await message.client.users.fetch(id).catch(() => null);
                            return { label: u?.username || id, value: id };
                        }));

                        const pMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('c_select').setPlaceholder('De qui est-il le parent ?').addOptions(potentialChildren.slice(0, 25)));
                        await ri.update({ content: `Vous ajoutez un(e) **${selectedRole}**. Sélectionnez son enfant dans la famille :`, components: [pMenu] });
                        
                        const pi = await i.message.awaitMessageComponent({ filter: subI => subI.user.id === authorId && subI.customId === 'c_select', time: 60000 });
                        const parentId = pi.values[0];

                        if (parentId === targetId) return pi.reply({ content: "❌ Un membre ne peut pas être son propre enfant !", flags: MessageFlags.Ephemeral });
                        
                        if (action === 'add') {
                            await sendInvitation(guildId, pi, { id: parentId, username: (await message.client.users.fetch(parentId)).username }, targetUser, selectedRole, 'add');
                        } else {
                            await executeLinkChange(guildId, parentId, targetId, selectedRole, 'add');
                            await pi.update({ content: "✅ Lien de parenté mis à jour.", components: [] });
                        }
                        return;
                    }

                    await ri.deferUpdate();

                    if (ri.customId === 'c_r') return msg.delete().catch(() => {});

                    if (action === 'add') {
                        await sendInvitation(guildId, ri, message.author, targetUser, ri.values[0], 'add');
                    } else {
                        await startFamilyVote(guildId, ri, message.author, targetUser, ri.values[0], 'modify');
                    }
                } catch (e) {
                    console.error("Erreur family (membre/rôle):", e);
                    if (msg) await msg.edit({ embeds: [errorEmbed("Action annulée ou temps écoulé.")], components: [] }).catch(() => {});
                }
            }
        });

        collector.on('end', (collected, reason) => { 
            if (msg) msg.delete().catch(() => {}); 
        });
    }
};
