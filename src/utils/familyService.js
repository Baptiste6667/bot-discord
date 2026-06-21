const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { formatMention, successEmbed, errorEmbed, getGif, getGenderedRole, GENDER_ROLES } = require('./helpers');

// Fetch extended family members
async function getExtendedFamily(guildId, userId) {
    const user = await db.getOrCreateUser(guildId, userId);
    const siblings = new Set();
    const grandparents = new Set();
    const unclesAunts = new Set();
    const cousins = new Set();

    const parents = [user.father, user.mother].filter(p => !!p);
    const parentDataArray = await db.getUsersByIds(guildId, parents);
    
    for (const parentData of (parentDataArray || [])) {
        for (const cId of (parentData?.children || [])) {
            if (cId !== userId) siblings.add(cId);
        }
        if (parentData?.father) grandparents.add(parentData.father);
        if (parentData?.mother) grandparents.add(parentData.mother);
    }

    const gpDataArray = await db.getUsersByIds(guildId, Array.from(grandparents));
    const uaIds = []; 
    for (const gpData of gpDataArray) {
        for (const childId of (gpData.children || [])) {
            if (!parents.includes(childId)) {
                unclesAunts.add(childId);
                uaIds.push(childId);
            }
        }
    }

    const uaDataArray = await db.getUsersByIds(guildId, uaIds);
    for (const uaData of uaDataArray) {
        for (const cousinId of (uaData.children || [])) {
            cousins.add(cousinId);
        }
    }

    // Scan custom links to complete extended family if structural links are missing
    if (user.customLinks) {
        for (const [targetId, role] of Object.entries(user.customLinks)) {
            const r = role.toLowerCase();
            if (r.includes('frère') || r.includes('soeur')) siblings.add(targetId);
            else if (r.includes('grand-père') || r.includes('grand-mère') || r.includes('grand-parent')) grandparents.add(targetId);
            else if (r.includes('oncle') || r.includes('tante')) unclesAunts.add(targetId);
            else if (r.includes('cousin')) cousins.add(targetId);
        }
    }

    return { siblings, grandparents, unclesAunts, cousins };
}

// Find the reciprocal role
async function getReverseRole(role, targetData = null) {
    const gender = targetData?.gender;
    const mapping = {
        'frère': gender === 'féminin' ? 'soeur' : 'frère',
        'soeur': gender === 'masculin' ? 'frère' : 'soeur',
        'oncle': 'neveu/nièce',
        'tante': 'neveu/nièce',
        'cousin': 'cousin(e)',
        'cousine': 'cousin(e)',
        'grand-père': 'petit-enfant',
        'grand-mère': 'petit-enfant',
        'beau-père': 'beau-enfant', 'belle-mère': 'beau-enfant',
        'beau-fils': 'beau-parent', 'belle-fille': 'beau-parent',
        'amoureux': gender === 'féminin' ? 'amoureuse' : 'amoureux',
        'amoureuse': gender === 'masculin' ? 'amoureux' : 'amoureuse',
        'mari': gender === 'masculin' ? 'mari' : 'femme',
        'femme': gender === 'féminin' ? 'femme' : 'mari',
        'père': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'mère': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'enfant': gender === 'féminin' ? 'mère' : (gender === 'masculin' ? 'père' : 'père')
    };
    return mapping[role] || role;
}

// Check if two users are related and return the relationship name
async function areRelated(guildId, id1, id2) {
    if (id1 === id2) return 'soi-même';
    const u1 = await db.getOrCreateUser(guildId, id1);
    const u2 = await db.getOrCreateUser(guildId, id2);
    
    if (u1.customLinks && u1.customLinks[id2]) return u1.customLinks[id2];
    if (u1.spouse === id2) return 'conjoint(e)';
    if (u1.father === id2) return 'père';
    if (u1.mother === id2) return 'mère';
    if (u1.children.includes(id2)) return 'enfant';
    if (u2.children.includes(id1)) return 'parent';

    const ext = await getExtendedFamily(guildId, id1);
    if (ext.siblings.has(id2)) return 'frère/soeur';
    if (ext.grandparents.has(id2)) return 'grand-parent';
    if (ext.unclesAunts.has(id2)) return 'oncle/tante';
    if (ext.cousins.has(id2)) return 'cousin(e)';

    return null;
}

// Propagate name change to unmarried/childless descendants
async function propagateNameChange(guildId, userId, oldName, newName) {
    const user = await db.getOrCreateUser(guildId, userId);
    if (!user) return;

    for (const childId of (user.children || [])) {
        const child = await db.getOrCreateUser(guildId, childId);
        if (child && child.familyName === oldName) {
            if (!child.spouse) {
                await db.updateUser(guildId, childId, { familyName: newName });
                
                const newFamily = await db.getFamily(guildId, newName);
                if (newFamily && !newFamily.members.includes(childId)) {
                    newFamily.members.push(childId);
                    await db.updateFamily(guildId, newName, { members: newFamily.members });
                }
                
                const oldFamily = await db.getFamily(guildId, oldName);
                if (oldFamily) {
                    const remaining = oldFamily.members.filter(id => id !== childId);
                    if (remaining.length === 0) await db.deleteFamily(guildId, oldName);
                    else await db.updateFamily(guildId, oldName, { members: remaining });
                }
                await propagateNameChange(guildId, childId, oldName, newName);
            }
        }
    }
}

// Execute changes on user links
async function executeLinkChange(guildId, id1, id2, role, action) {
    if (id1 === id2) return; // Self-loop security

    const d1 = await db.getOrCreateUser(guildId, id1);
    const d2 = await db.getOrCreateUser(guildId, id2);

    const removeChildFromParent = async (pId, cId) => {
        if (!pId) return;
        const p = await db.getOrCreateUser(guildId, pId);
        await db.updateUser(guildId, pId, { children: (p.children || []).filter(id => id !== cId) });
    };

    let d1Update = { 
        customLinks: { ...(d1.customLinks || {}) },
        children: (d1.children || []).filter(id => id !== id2),
        father: d1.father === id2 ? null : d1.father,
        mother: d1.mother === id2 ? null : d1.mother,
        spouse: d1.spouse === id2 ? null : d1.spouse,
        couple: d1.couple === id2 ? null : d1.couple
    };
    let d2Update = { 
        customLinks: { ...(d2.customLinks || {}) },
        children: (d2.children || []).filter(id => id !== id1),
        father: d2.father === id1 ? null : d2.father,
        mother: d2.mother === id1 ? null : d2.mother,
        spouse: d2.spouse === id1 ? null : d2.spouse,
        couple: d2.couple === id1 ? null : d2.couple
    };

    delete d1Update.customLinks[id2];
    delete d2Update.customLinks[id1];

    if (role) {
        const impliedGender = GENDER_ROLES[role.toLowerCase()];
        if (impliedGender) d2Update.gender = impliedGender;
    }
    const actualRole = role ? getGenderedRole(role, d2Update.gender || d2.gender) : null;

    // Structural cleanup to avoid duplicates on tree
    if (actualRole === 'père') {
        await removeChildFromParent(d1.father, id1);
        d1Update.father = null;
    } else if (actualRole === 'mère') {
        await removeChildFromParent(d1.mother, id1);
        d1Update.mother = null;
    } else if (actualRole === 'enfant') {
        const slot = (d1.gender === 'féminin') ? 'mother' : 'father';
        await removeChildFromParent(d2[slot], id2);
        d2Update[slot] = null;
    } else if (actualRole && ['mari', 'femme', 'conjoint'].includes(actualRole)) {
        if (d1.spouse) await db.updateUser(guildId, d1.spouse, { spouse: null });
        if (d2.spouse) await db.updateUser(guildId, d2.spouse, { spouse: null });
        d1Update.spouse = null; d2Update.spouse = null;
    }

    if (action === 'remove') {
        await db.updateUser(guildId, id1, d1Update);
        await db.updateUser(guildId, id2, d2Update);
        return;
    }

    switch (actualRole) {
        case 'conjoint': case 'mari': case 'femme':
            d1Update.spouse = id2; d2Update.spouse = id1;
            const combinedChildren = [...new Set([...d1Update.children, ...d2Update.children])];
            d1Update.children = combinedChildren;
            d2Update.children = combinedChildren;
            break;
        case 'couple':
            d1Update.couple = id2; d2Update.couple = id1;
            break;
        case 'père': case 'mère': case 'enfant':
            const isParentOfD1 = actualRole === 'père' || actualRole === 'mère';
            const pId = isParentOfD1 ? id2 : id1;
            const cId = isParentOfD1 ? id1 : id2;
            const pUpd = isParentOfD1 ? d2Update : d1Update;
            const cUpd = isParentOfD1 ? d1Update : d2Update;
            const cData = isParentOfD1 ? d1 : d2;

            if (!cUpd.father || cUpd.father === pId) cUpd.father = pId;
            else cUpd.mother = pId;
            if (!pUpd.children.includes(cId)) pUpd.children.push(cId);

            // Intermediate save to ensure grand-parent auto-linking can read updated parents
            await db.updateUser(guildId, id1, d1Update);
            await db.updateUser(guildId, id2, d2Update);

            // Auto-link to grand-parents
            const extGP = await getExtendedFamily(guildId, cId);
            if (extGP.grandparents.size > 0) {
                const otherPId = cUpd.father === pId ? cData.mother : cData.father;
                for (const gpId of extGP.grandparents) {
                    const gpD = await db.getOrCreateUser(guildId, gpId);
                    const gpRel = (cData.customLinks && cData.customLinks[gpId])?.toLowerCase() || '';

                    let alreadyLinkedToOther = false;
                    if (otherPId) {
                        const opD = await db.getOrCreateUser(guildId, otherPId);
                        if (opD.father === gpId || opD.mother === gpId) alreadyLinkedToOther = true;
                    }

                    if (!alreadyLinkedToOther) {
                        let linked = false;
                        if (gpRel.includes('père') && !pUpd.father) { pUpd.father = gpId; linked = true; }
                        else if (gpRel.includes('mère') && !pUpd.mother) { pUpd.mother = gpId; linked = true; }
                        
                        if (linked) {
                            delete cUpd.customLinks[gpId];
                            if (!(gpD.children || []).includes(pId)) {
                                await db.updateUser(guildId, gpId, { children: [...(gpD.children || []), pId] });
                            }
                        }
                    }
                }
            }
            break;
        case 'frère': case 'soeur':
            const ps = [d1.father, d1.mother].filter(p => !!p);
            if (ps.length > 0) {
                d2Update.father = d1.father; d2Update.mother = d1.mother;
                for (const pId of ps) {
                    const pD = await db.getOrCreateUser(guildId, pId);
                    if (!pD.children.includes(id2)) await db.updateUser(guildId, pId, { children: [...pD.children, id2] });
                }
            }
            d1Update.customLinks[id2] = actualRole;
            d2Update.customLinks[id1] = await getReverseRole(actualRole, d1);
            break;
        case 'grand-père': case 'grand-mère':
            const parents = [d1.father, d1.mother].filter(p => !!p);
            if (parents.length > 0) {
                const pId = parents[Math.floor(Math.random() * parents.length)];
                const field = (actualRole === 'grand-père') ? 'father' : 'mother';
                await db.updateUser(guildId, pId, { [field]: id2 });
                if (!(d2Update.children).includes(pId)) d2Update.children.push(pId);
            }
            d1Update.customLinks[id2] = actualRole;
            d2Update.customLinks[id1] = await getReverseRole(actualRole, d1);
            break;
        case 'oncle': case 'tante':
            const extUA = await getExtendedFamily(guildId, id1);
            if (extUA.grandparents.size > 0) {
                for (const gpId of extUA.grandparents) {
                    const gpD = await db.getOrCreateUser(guildId, gpId);
                    if (!(gpD.children || []).includes(id2)) await db.updateUser(guildId, gpId, { children: [...(gpD.children || []), id2] });
                    const gpRel = (d1.customLinks && d1.customLinks[gpId])?.toLowerCase() || '';
                    if (gpRel.includes('père') && !d2Update.father) d2Update.father = gpId;
                    else if (gpRel.includes('mère') && !d2Update.mother) d2Update.mother = gpId;
                }
            } else {
                const psUA = [d1.father, d1.mother].filter(p => !!p);
                if (psUA.length > 0) {
                    const pId = psUA[Math.floor(Math.random() * psUA.length)];
                    const pD = await db.getOrCreateUser(guildId, pId);
                    if (pD.father || pD.mother) {
                        d2Update.father = pD.father; d2Update.mother = pD.mother;
                        const gps = [pD.father, pD.mother].filter(g => !!g);
                        for (const gpId of gps) {
                            const gpD = await db.getOrCreateUser(guildId, gpId);
                            if (!gpD.children.includes(id2)) await db.updateUser(guildId, gpId, { children: [...gpD.children, id2] });
                        }
                    }
                }
            }
            d1Update.customLinks[id2] = actualRole;
            d2Update.customLinks[id1] = await getReverseRole(actualRole, d1);
            break;
        default:
            if (actualRole) {
                d1Update.customLinks[id2] = actualRole;
                d2Update.customLinks[id1] = await getReverseRole(actualRole, d1);
            }
    }

    await db.updateUser(guildId, id1, d1Update);
    await db.updateUser(guildId, id2, d2Update);
    
    if (['oncle', 'tante', 'grand-père', 'grand-mère'].includes(role)) {
        await checkAndProposeMarriage(guildId, id2, d1.familyName);
    }
}

async function checkAndProposeMarriage(guildId, userId, familyName) {
    const family = await db.getFamily(guildId, familyName);
    if (!family) return;
    const userData = await db.getOrCreateUser(guildId, userId);
    if (userData.spouse) return;

    for (const mId of family.members) {
        if (mId === userId) continue;
        const mData = await db.getOrCreateUser(guildId, mId);
        if (mData.spouse) continue;
        
        const rel = await areRelated(guildId, userId, mId);
        const targetRel = await areRelated(guildId, mId, userId);
        
        if ((rel === 'oncle' && targetRel === 'tante') || (rel === 'tante' && targetRel === 'oncle') || 
            (rel === 'grand-père' && targetRel === 'grand-mère') || (rel === 'grand-mère' && targetRel === 'grand-père')) {
            console.log(`Match romantique potentiel entre ${userId} et ${mId}`);
        }
    }
}

async function startFamilyVote(guildId, interaction, author, target, role, action) {
    const authorData = await db.getOrCreateUser(guildId, author.id);
    const family = await db.getFamily(guildId, authorData.familyName);

    if (action === 'remove' && family && family.head === author.id && family.members.length <= 2) {
        await db.clearUserFamilyLinksDB(guildId, target.id);
        const msgContent = `✅ **Décision du Chef :** En tant que chef d'une lignée de 2 membres, ${author} a décidé de retirer ${target} sans vote.`;
        if (interaction.replied || interaction.deferred) return interaction.editReply({ content: msgContent, embeds: [], components: [] });
        else return interaction.update({ content: msgContent, embeds: [], components: [] });
    }

    const voteEmbed = new EmbedBuilder()
        .setTitle("🗳️ Vote de la Communauté")
        .setColor("#f1c40f")
        .setDescription(`**${author.username}** demande :\n**Action :** ${action === 'remove' ? 'Exclure' : 'Modifier'}\n**Cible :** ${target}\n**Nouveau Rôle :** ${role}\n\nL'action sera appliquée si le **OUI** l'emporte (60s).`)
        .setFooter({ text: "La majorité décide du sort de la famille." });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_yes').setLabel('OUI (0)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('v_no').setLabel('NON (0)').setStyle(ButtonStyle.Danger)
    );

    let voteMsg;
    const payload = { embeds: [voteEmbed], components: [row], content: null };
    
    if (interaction.replied || interaction.deferred) voteMsg = await interaction.editReply(payload);
    else voteMsg = await interaction.update(payload);

    let votesYes = new Set(), votesNo = new Set();
    const collector = voteMsg.createMessageComponentCollector({ 
        filter: (i) => !i.user.bot,
        componentType: ComponentType.Button, 
        time: 60000 
    });

    collector.on('collect', async (i) => {
        if (i.customId === 'v_yes') { votesNo.delete(i.user.id); votesYes.add(i.user.id); }
        else { votesYes.delete(i.user.id); votesNo.add(i.user.id); }
        
        const upRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_yes').setLabel(`OUI (${votesYes.size})`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('v_no').setLabel(`NON (${votesNo.size})`).setStyle(ButtonStyle.Danger)
        );
        await i.update({ components: [upRow] });
    });

    collector.on('end', async () => {
        if (votesYes.size > votesNo.size) {
            if (action === 'remove') {
                await db.clearUserFamilyLinksDB(guildId, target.id);
                await interaction.deleteReply();
                await interaction.channel.send(`✅ **Vote validé !** Lien rompu entre ${author} et ${target}.`);
            } else {
                await sendInvitation(guildId, interaction, author, target, role, action, true);
            }
        } else {
            await interaction.deleteReply();
            await interaction.channel.send(`❌ **Vote rejeté.** L'action pour ${target} a été annulée.`);
        }
    });
}

async function startMajorityMergeVote(guildId, interaction, author, target, targetFamily, role) {
    const membersToVote = targetFamily.members.filter(id => id !== target.id);
    const requiredVotes = Math.floor(membersToVote.length / 2) + 1;
    
    const voteEmbed = new EmbedBuilder()
        .setTitle("🗳️ Vote d'Alliance (Majorité Requise)")
        .setColor("#3498db")
        .setDescription(`**${target.username}** souhaite fusionner votre lignée avec celle de **${author.username}**.\n\n**Condition :** La majorité (**${requiredVotes}** votes) doit accepter.\n**Rôle final :** ${role}\n\n*Si le NON l'emporte, la fusion sera annulée.*`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('un_yes').setLabel('Accepter (0)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('un_no').setLabel('Refuser (0)').setStyle(ButtonStyle.Danger)
    );

    const voteMsg = await interaction.channel.send({ content: membersToVote.map(id => formatMention(id)).join(' '), embeds: [voteEmbed], components: [row] });
    
    const votesYes = new Set();
    const votesNo = new Set();
    const collector = voteMsg.createMessageComponentCollector({ 
        filter: (i) => membersToVote.includes(i.user.id),
        time: 120000 
    });

    collector.on('collect', async (i) => {
        if (i.customId === 'un_no') {
            votesYes.delete(i.user.id);
            votesNo.add(i.user.id);
        } else {
            votesNo.delete(i.user.id);
            votesYes.add(i.user.id);
        }
        
        const upRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('un_yes').setLabel(`Accepter (${votesYes.size}/${membersToVote.length})`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('un_no').setLabel(`Refuser (${votesNo.size})`).setStyle(ButtonStyle.Danger)
        );
        await i.update({ components: [upRow] });

        if (votesYes.size >= requiredVotes) {
            collector.stop('success');
        } else if (votesNo.size > membersToVote.length - requiredVotes) {
            collector.stop('refused');
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'success') {
            const authorData = await db.getOrCreateUser(guildId, author.id);
            const targetData = await db.getOrCreateUser(guildId, target.id);
            await db.mergeFamilies(guildId, authorData.familyName, targetFamily.familyName, author.id, target.id, role);
            await executeLinkChange(guildId, author.id, target.id, role, 'add');
            await voteMsg.edit({ content: `✅ **Alliance scellée !** Les deux familles ont fusionné suite au vote majoritaire.`, embeds: [], components: [] });
        } else if (reason !== 'refused') {
            await voteMsg.edit({ content: "⌛ **Temps écoulé.** La majorité n'a pas été atteinte, la fusion est annulée.", embeds: [], components: [] });
        } else {
            await voteMsg.edit({ content: `❌ **Fusion rejetée.** La majorité s'est opposée à l'alliance.`, embeds: [], components: [] });
        }
    });
}

async function sendInvitation(guildId, interaction, author, target, role, action, fromVote = false) {
    const authorData = await db.getOrCreateUser(guildId, author.id);
    const targetData = await db.getOrCreateUser(guildId, target.id);
    const targetFamily = targetData.familyName ? await db.getFamily(guildId, targetData.familyName) : null;
    const isAlone = !targetFamily || targetFamily.members.length <= 1;

    let inviteEmbed = new EmbedBuilder()
        .setTitle("📩 Invitation Familiale")
        .setColor("#FFD700")
        .setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n${fromVote ? "*(Approuvé par vote)*" : ""}\n\nAcceptez-vous de rejoindre cette famille ?`)
        .setFooter({ text: "Réponse attendue sous 5 minutes." });

    let row;
    if (!isAlone && authorData.familyName && targetData.familyName !== authorData.familyName && role !== 'conjoint') {
        inviteEmbed.setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n\nVous faites partie de la lignée **${targetData.familyName.toUpperCase()}**. Souhaitez-vous venir seul ou fusionner toute votre lignée ?`);
        row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('i_ok').setLabel('Rejoindre Seul').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('i_merge').setLabel('Fusionner Lignée').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    } else {
        const buttons = [
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter').setStyle(ButtonStyle.Success)
        ];
        buttons.push(new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger));
        row = new ActionRowBuilder().addComponents(buttons);
    }

    const msg = (interaction.replied || interaction.deferred) 
        ? await interaction.editReply({ content: `${target}`, embeds: [inviteEmbed], components: [row] })
        : await interaction.reply({ content: `${target}`, embeds: [inviteEmbed], components: [row], fetchReply: true });

    const collector = (msg || await interaction.fetchReply()).createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    
    collector.on('collect', async (i) => {
        if (i.user.id !== target.id) return i.reply({ content: "Ce n'est pas pour vous.", flags: MessageFlags.Ephemeral });

        if (i.customId === 'i_ok' || i.customId === 'i_branch') {
            if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName) {
                await db.clearUserFamilyLinksDB(guildId, target.id);
            }
            await executeLinkChange(guildId, author.id, target.id, role, action);
            if (authorData.familyName) {
                let targetFamName = authorData.familyName;
                if (i.customId === 'i_branch') {
                    targetFamName = `${authorData.familyName}-${target.username.substring(0, 4)}`.toLowerCase();
                    if (!await db.getFamily(guildId, targetFamName)) {
                        await db.createFamily(guildId, targetFamName, target.id);
                        await db.addFamilyLog(guildId, targetFamName, `🌿 Nouvelle branche fondée par <@${target.id}> au sein de la lignée ${authorData.familyName.toUpperCase()}.`);
                    }
                }

                const family = await db.getFamily(guildId, authorData.familyName);
                if (family && !family.members.includes(target.id)) {
                    family.members.push(target.id);
                    await db.updateFamily(guildId, authorData.familyName, { members: family.members });
                }
                await db.updateUser(guildId, target.id, { familyName: targetFamName });
            }
            await i.message.delete().catch(() => {});
            await i.channel.send(`🎊 Félicitations ! ${target} est maintenant le/la **${role}** de ${author}${i.customId === 'i_branch' ? " et a fondé sa propre branche" : ""} !`);
        } else if (i.customId === 'i_merge') {
            await startMajorityMergeVote(guildId, i, author, target, targetFamily, role);
            await executeLinkChange(guildId, author.id, target.id, role, action);
            await i.message.delete().catch(() => {});
            await i.channel.send(`🤝 Les familles ont fusionné ! ${target} est maintenant le/la **${role}** de ${author} !`);
        } else {
            await i.message.delete().catch(() => {});
            await i.channel.send(`😔 ${target} a refusé l'invitation de ${author}.`);
        }
        collector.stop();
    });
}

module.exports = {
    getExtendedFamily,
    getReverseRole,
    areRelated,
    propagateNameChange,
    executeLinkChange,
    checkAndProposeMarriage,
    startFamilyVote,
    startMajorityMergeVote,
    sendInvitation
};
