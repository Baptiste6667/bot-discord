require('./keep_alive.js');
const db = require('./db.js'); // Import the database module

// Removed fs and path as they are no longer needed for familyData.json
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    AttachmentBuilder, 
    Events, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    StringSelectMenuBuilder, 
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');

const axios = require('axios');

require('dotenv').config();

const PREFIX = process.env.PREFIX || ',';

const ROLES_LIST = [
    'père', 'mère', 'enfant', 'frère', 'soeur', 
    'oncle', 'tante', 'cousin', 'cousine',
    'grand-père', 'grand-mère'
];

// Clears all family links for a given user
async function clearUserFamilyLinks(userId) {
    await db.clearUserFamilyLinksDB(userId);
}

function formatMention(id) {
    return `<@${id}>`;
}

// --- UnbelievaBoat API Helper ---
// Configuration de l'instance Axios pour communiquer directement avec l'API v1
const ubApi = axios.create({
    baseURL: 'https://unbelievaboat.com/api/v1',
    headers: { 
        'Authorization': process.env.UNBELIEVABOAT_TOKEN,
        'Accept': 'application/json'
    }
});

async function getUBUser(guildId, userId) {
    if (!process.env.UNBELIEVABOAT_TOKEN) return null;
    try {
        const res = await ubApi.get(`/guilds/${guildId}/users/${userId}`);
        return res.data;
    } catch (e) { 
        console.error(`Erreur API UnbelievaBoat pour l'utilisateur ${userId}:`, e.response?.status || e.message);
        return null; 
    }
}

async function updateUBBalance(guildId, userId, cashDelta) {
    if (!process.env.UNBELIEVABOAT_TOKEN) return false;
    try {
        await ubApi.patch(`/guilds/${guildId}/users/${userId}`, { cash: cashDelta });
        return true;
    } catch (e) { 
        return false; 
    }
}

// --- Text-based Tree Generator (Fallback) ---
async function generateFamilyText(client, userId, prefix = "", isLast = true, visited = new Set()) {
    if (visited.has(userId)) return "";
    visited.add(userId);

    const userData = await db.getOrCreateUser(userId);
    const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
    const name = user ? user.username : userId;
    
    let spouseInfo = "";
    if (userData.spouse) {
        const spouseUser = client.users.cache.get(userData.spouse) || await client.users.fetch(userData.spouse).catch(() => null);
        spouseInfo = ` ❤️ ${spouseUser ? spouseUser.username : userData.spouse}`;
    }
    let result = prefix + (isLast ? "└── " : "├── ") + name + spouseInfo + "\n";
    
    const children = userData.children || [];
    for (let i = 0; i < children.length; i++) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        result += await generateFamilyText(client, children[i], newPrefix, i === children.length - 1, visited);
    }
    
    return result;
}

// --- Visual Tree Generator (Disabled) ---
async function generateFamilyImage(client, userId) {
    return null; // Visual image generation is disabled as per user request.
}

// This function now needs to be async as it fetches data from DB
async function getExtendedFamily(userId) { // Optimized to reduce DB calls
    const user = await db.getOrCreateUser(userId);
    const siblings = new Set();
    const grandparents = new Set();
    const unclesAunts = new Set();
    const cousins = new Set();

    let allUsersInScope = {}; // Map to store all fetched user data
    allUsersInScope[userId] = user;

    // Collect all direct relations first
    const directRelatedIds = new Set();
    if (user.father) directRelatedIds.add(user.father);
    if (user.mother) directRelatedIds.add(user.mother);
    if (user.children) user.children.forEach(id => directRelatedIds.add(id));

    // If user has a family, fetch all family members to build relationships in memory
    if (user.familyName) {
        const familyMembers = await db.getFamilyMembers(user.familyName);
        familyMembers.forEach(id => directRelatedIds.add(id)); // Add all family members to fetch list
    }

    // Fetch all unique direct related users and family members in parallel
    const fetchedDirectRelated = await Promise.all(Array.from(directRelatedIds).map(id => db.getOrCreateUser(id)));
    fetchedDirectRelated.forEach(u => {
        if (u) allUsersInScope[u._id] = u;
    });

    const currentUserData = allUsersInScope[userId];
    if (!currentUserData) return { siblings, grandparents, unclesAunts, cousins };

    const getParents = (u) => [u.father, u.mother].filter(Boolean);
    const getChildren = (u) => u.children || [];

    // Find siblings
    const userParents = getParents(currentUserData);
    for (const parentId of userParents) {
        const parentData = allUsersInScope[parentId];
        if (parentData) {
            for (const childId of getChildren(parentData)) {
                if (childId !== userId) siblings.add(childId);
            }
        }
    }

    // Find grandparents
    for (const parentId of userParents) {
        const parentData = allUsersInScope[parentId];
        if (parentData) {
            getParents(parentData).forEach(gpId => grandparents.add(gpId));
        }
    }

    // Collect all grandparent IDs to fetch their data if not already in scope
    const newIdsToFetch = new Set();
    grandparents.forEach(id => {
        if (!allUsersInScope[id]) newIdsToFetch.add(id);
    });

    // Fetch newly identified grandparents
    const fetchedGrandparents = await Promise.all(Array.from(newIdsToFetch).map(id => db.getOrCreateUser(id)));
    fetchedGrandparents.forEach(u => {
        if (u) allUsersInScope[u._id] = u;
    });

    // Find uncles/aunts and cousins
    for (const gpId of Array.from(grandparents)) {
        const gpData = allUsersInScope[gpId];
        if (gpData) {
            for (const childOfGpId of getChildren(gpData)) {
                if (!userParents.includes(childOfGpId)) { // If not a direct parent of the user
                    unclesAunts.add(childOfGpId);
                }
            }
        }
    }

    // Collect all uncle/aunt IDs to fetch their data if not already in scope
    newIdsToFetch.clear();
    unclesAunts.forEach(id => {
        if (!allUsersInScope[id]) newIdsToFetch.add(id);
    });

    // Fetch newly identified uncles/aunts
    const fetchedUnclesAunts = await Promise.all(Array.from(newIdsToFetch).map(id => db.getOrCreateUser(id)));
    fetchedUnclesAunts.forEach(u => {
        if (u) allUsersInScope[u._id] = u;
    });

    // Process uncles/aunts to find cousins
    for (const uaId of Array.from(unclesAunts)) {
        const uaData = allUsersInScope[uaId];
        if (uaData) {
            getChildren(uaData).forEach(cousinId => cousins.add(cousinId));
        }
    }
    return { siblings, grandparents, unclesAunts, cousins };
}

// Fonction pour trouver le rôle réciproque (ex: si je suis ton frère, tu es mon frère/soeur)
async function getReverseRole(role, targetData = null) { // Made async as targetData might be fetched
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
        'père': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'mère': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'enfant': gender === 'féminin' ? 'mère' : (gender === 'masculin' ? 'père' : 'père')
    };
    return mapping[role] || role;
}

// Gère la propagation du nom de famille aux descendants non mariés et sans enfants
async function propagateNameChange(userId, oldName, newName) { // Optimized to batch updates
    const user = await db.getOrCreateUser(userId);
    if (!user) return;

    for (const childId of user.children) {
        const child = await db.getOrCreateUser(childId);
        if (child && child.familyName === oldName) {
            // Logique : On ne change le nom que si l'enfant n'est pas marié et n'a pas d'enfants
            if (!child.spouse && child.children.length === 0) {
                await db.updateUser(childId, { familyName: newName });
                // Mise à jour du registre de famille
                const newFamily = await db.getFamily(newName);
                if (newFamily && !newFamily.members.includes(childId)) {
                    newFamily.members.push(childId);
                    await db.updateFamily(newName, { members: newFamily.members });
                }
                // Remove from old family members if it was there
                const oldFamily = await db.getFamily(oldName);
                if (oldFamily) {
                    oldFamily.members = oldFamily.members.filter(id => id !== childId);
                    await db.updateFamily(oldName, { members: oldFamily.members });
                }
                await propagateNameChange(childId, oldName, newName);
            }
        }
    }
}


async function areRelated(id1, id2) { // Made async
    if (id1 === id2) return 'soi-même';
    const u1 = await db.getOrCreateUser(id1);
    
    if (u1.customLinks && u1.customLinks[id2]) return u1.customLinks[id2];
    if (u1.spouse === id2) return 'conjoint(e)';
    if (u1.father === id2) return 'père';
    if (u1.mother === id2) return 'mère';
    if (u1.children.includes(id2)) return 'enfant';

    const ext = await getExtendedFamily(id1); // Call async version
    if (ext.siblings.has(id2)) return 'frère/soeur';
    if (ext.grandparents.has(id2)) return 'grand-parent';
    if (ext.unclesAunts.has(id2)) return 'oncle/tante';
    if (ext.cousins.has(id2)) return 'cousin(e)';

    return null;
}

// Function to get all members of a family
async function getFamilyMembers(familyName) { // Made async
    const normalizedFamilyName = familyName.toLowerCase();
    const family = await db.getFamily(normalizedFamilyName);
    if (family) {
        return family.members;
    }
    return [];
}

// Function to get the head of a family
async function getFamilyHead(familyName) { // Made async
    const normalizedFamilyName = familyName.toLowerCase();
    const family = await db.getFamily(normalizedFamilyName);
    return family ? family.head : null;
}

// New function to merge two families
async function mergeFamilies(inviterFamilyName, invitedFamilyName, inviterId, invitedId, role) { // Optimized to batch updates
    const inviterFamily = await db.getFamily(inviterFamilyName);
    const invitedFamily = await db.getFamily(invitedFamilyName);

    if (!inviterFamily || !invitedFamily) {
        console.error("Attempted to merge non-existent families.");
        return;
    }
    
    const userUpdates = []; // Collect all user update promises

    // Add all members of the invited family to the inviter's family
    for (const memberId of invitedFamily.members) {
        if (!inviterFamily.members.includes(memberId)) {
            inviterFamily.members.push(memberId);
        }
        // Update each member's familyName
        userUpdates.push(db.updateUser(memberId, { familyName: inviterFamilyName }));
    }
    await db.updateFamily(inviterFamilyName, { members: inviterFamily.members });

    // Pont relationnel logique
    const inviter = await db.getOrCreateUser(inviterId);
    const invited = await db.getOrCreateUser(invitedId);
    
    // Fetch parents/grandparents if needed for relational logic
    const relatedIdsForRelationalLogic = new Set();
    if (inviter.father) relatedIdsForRelationalLogic.add(inviter.father);
    if (inviter.mother) relatedIdsForRelationalLogic.add(inviter.mother);
    if (invited.father) relatedIdsForRelationalLogic.add(invited.father);
    if (invited.mother) relatedIdsForRelationalLogic.add(invited.mother);

    const fetchedRelatedUsers = {};
    await Promise.all(Array.from(relatedIdsForRelationalLogic).map(async id => {
        fetchedRelatedUsers[id] = await db.getOrCreateUser(id);
    }));

    if (role === 'oncle' || role === 'tante') {
        // La cible devient le frère/soeur d'un des parents de l'inviteur
        const parentId = inviter.father || inviter.mother;
        if (parentId) {
            const pData = fetchedRelatedUsers[parentId] || await db.getOrCreateUser(parentId);
            if (pData && (pData.father || pData.mother)) {
                // On donne à l'invité les mêmes parents que le parent de l'inviteur (les grands-parents)
                userUpdates.push(db.updateUser(invitedId, { father: pData.father, mother: pData.mother }));
                const gps = [pData.father, pData.mother].filter(g => g !== null);
                for (const gpId of gps) {
                    const gpData = fetchedRelatedUsers[gpId] || await db.getOrCreateUser(gpId);
                    if (gpData && !gpData.children.includes(invitedId)) {
                        const updatedChildren = [...gpData.children, invitedId];
                        userUpdates.push(db.updateUser(gpId, { children: updatedChildren }));
                    }
                }
            }
        }
    } else if (role === 'frère' || role === 'soeur') {
        // La cible partage les mêmes parents que l'inviteur
        if (inviter.father || inviter.mother) {
            userUpdates.push(db.updateUser(invitedId, { father: inviter.father, mother: inviter.mother }));
            const ps = [inviter.father, inviter.mother].filter(p => p !== null);
            for (const pId of ps) {
                const pData = fetchedRelatedUsers[pId] || await db.getOrCreateUser(pId);
                if (pData && !pData.children.includes(invitedId)) {
                    const updatedChildren = [...pData.children, invitedId];
                    userUpdates.push(db.updateUser(pId, { children: updatedChildren }));
                }
            }
        }
    } else if (role === 'grand-père' || role === 'grand-mère') {
        // La cible devient le parent d'un des parents de l'inviteur
        const parentId = inviter.father || inviter.mother;
        if (parentId) {
            const pData = fetchedRelatedUsers[parentId] || await db.getOrCreateUser(parentId);
            if (pData) {
                const field = role === 'grand-père' ? 'father' : 'mother';
                userUpdates.push(db.updateUser(parentId, { [field]: invitedId }));
            }
            if (invited && !invited.children.includes(parentId)) {
                const updatedChildren = [...invited.children, parentId];
                userUpdates.push(db.updateUser(invitedId, { children: updatedChildren }));
            }
        }
    }

    // Execute all collected user updates
    await Promise.all(userUpdates);

    // Remove the invited family
    await db.deleteFamily(invitedFamilyName);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
// --- Logique de modification des liens --- (Now async)
async function executeLinkChange(id1, id2, role, action) { // Optimized to fetch users concurrently
    const d1 = await db.getOrCreateUser(id1);
    const d2 = await db.getOrCreateUser(id2);

    // Start with current relationship state and clear only what is between id1 <-> id2
    // (prevents stale edges in the family tree)
    let d1Update = {};
    let d2Update = {};

    // Always initialize children arrays so we can safely push later
    d1Update.children = Array.isArray(d1.children) ? d1.children.slice() : [];
    d2Update.children = Array.isArray(d2.children) ? d2.children.slice() : [];

    // Remove spouse link only if it is directly the spouse pair we are modifying
    if (d1.spouse === id2) d1Update.spouse = null;
    if (d2.spouse === id1) d2Update.spouse = null;

    // Parent/child links between these two users
    if (d1.father === id2) d1Update.father = null;
    if (d1.mother === id2) d1Update.mother = null;
    if (d2.father === id1) d2Update.father = null;
    if (d2.mother === id1) d2Update.mother = null;

    d1Update.children = d1Update.children.filter(cid => cid !== id2);
    d2Update.children = d2Update.children.filter(cid => cid !== id1);

    // Remove customLinks between these two
    if (d1.customLinks && d1.customLinks[id2]) {
        d1Update.customLinks = { ...d1.customLinks };
        delete d1Update.customLinks[id2];
    }
    if (d2.customLinks && d2.customLinks[id1]) {
        d2Update.customLinks = { ...d2.customLinks };
        delete d2Update.customLinks[id1];
    }

    const updatePromises = [];

    if (action === 'remove') {
        updatePromises.push(db.updateUser(id1, d1Update));
        updatePromises.push(db.updateUser(id2, d2Update));
        return Promise.all(updatePromises);
    }

    // IMPORTANT: avoid cutting someone who is married to a third party.
    // For MODIFY we only clear spouse when spouse==the target being modified (handled above).

    if (role === 'conjoint') {
        d1Update.spouse = id2;
        d2Update.spouse = id1;
    } else if (role === 'père' || role === 'mère') {
        const field = role === 'père' ? 'father' : 'mother';
        d1Update[field] = id2;
        if (!d2Update.children.includes(id1)) d2Update.children.push(id1);
    } else if (role === 'enfant') {
        if (!d1Update.children.includes(id2)) d1Update.children.push(id2);
        const genderField = d1.gender === 'féminin' ? 'mother' : 'father';
        d2Update[genderField] = id1;
    } else {
        // generic role (siblings, aunt/uncle, etc.) stored as customLinks
        const nextD1Links = { ...(d1Update.customLinks || d1.customLinks || {}) };
        const nextD2Links = { ...(d2Update.customLinks || d2.customLinks || {}) };
        nextD1Links[id2] = role;
        nextD2Links[id1] = await getReverseRole(role, d1); // d1 is already fetched
        d1Update.customLinks = nextD1Links;
        d2Update.customLinks = nextD2Links;
    }

    // Execute all updates concurrently
    await db.updateUser(id1, d1Update);
    await db.updateUser(id2, d2Update);

    // Logic: propose marriage if oncle/tante/grand-parents were created
    if (['oncle', 'tante', 'grand-père', 'grand-mère'].includes(role)) {
        await checkAndProposeMarriage(id2, d1.familyName);
    }
}

async function checkAndProposeMarriage(userId, familyName) {
    const family = await db.getFamily(familyName);
    if (!family) return;
    const userData = await db.getOrCreateUser(userId);
    if (userData.spouse) return;

    for (const mId of family.members) {
        if (mId === userId) continue;
        const mData = await db.getOrCreateUser(mId);
        if (mData.spouse) continue;

        const rel = await areRelated(userId, mId);
        const targetRel = await areRelated(mId, userId);
        
        if ((rel === 'oncle' && targetRel === 'tante') || (rel === 'tante' && targetRel === 'oncle') || 
            (rel === 'grand-père' && targetRel === 'grand-mère') || (rel === 'grand-mère' && targetRel === 'grand-père')) {
            // On pourrait déclencher une invitation ici, mais pour rester simple on informe juste
            console.log(`Match romantique potentiel entre ${userId} et ${mId}`);
        }
    }
}

async function startFamilyVote(interaction, author, target, role, action) {
    const voteEmbed = new EmbedBuilder()
        .setTitle("🗳️ Vote de la Communauté")
        .setColor("#F1C40F")
        .setDescription(`**${author.username}** demande :\n**Action :** ${action === 'remove' ? 'Exclure' : 'Modifier'}\n**Cible :** ${target}\n**Nouveau Rôle :** ${role}\n\nL'action sera appliquée si le **OUI** l'emporte (60s).`)
        .setFooter({ text: "La majorité décide du sort de la famille." });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_yes').setLabel('OUI (0)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('v_no').setLabel('NON (0)').setStyle(ButtonStyle.Danger)
    );

    let voteMsg;
    if (interaction.replied || interaction.deferred) {
        voteMsg = await interaction.editReply({ embeds: [voteEmbed], components: [row] });
    } else {
        voteMsg = await interaction.update({ embeds: [voteEmbed], components: [row], content: null });
    }
    let votesYes = new Set(), votesNo = new Set();

    const collector = voteMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'v_yes') { votesNo.delete(i.user.id); votesYes.add(i.user.id); }
        else { votesYes.delete(i.user.id); votesNo.add(i.user.id); } // Corrected logic for votesNo
        const totalVotes = votesYes.size + votesNo.size;
        
        const upRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_yes').setLabel(`OUI (${votesYes.size})`).setStyle(ButtonStyle.Success).setDisabled(false),
            new ButtonBuilder().setCustomId('v_no').setLabel(`NON (${votesNo.size})`).setStyle(ButtonStyle.Danger).setDisabled(false)
        );
        await i.update({ components: [upRow] });
    });

    collector.on('end', async () => {
        if (votesYes.size > votesNo.size) {
            if (action === 'remove') {
                // For a full removal from the family, clear all user family links
                await clearUserFamilyLinks(target.id);
                // Also remove the target from the family's member list if they were part of one
                const targetFamily = await db.getFamily(targetData.familyName);
                if (targetFamily) {
                    const updatedMembers = targetFamily.members.filter(id => id !== target.id);
                    await db.updateFamily(targetFamily._id, { members: updatedMembers });
                }
                await interaction.deleteReply();
                await interaction.channel.send(`✅ **Vote validé !** Lien rompu entre ${author} et ${target}.`);
            } else {
                await sendInvitation(interaction, author, target, role, action, true);
            }
        } else {
            await interaction.deleteReply();
            await interaction.channel.send(`❌ **Vote rejeté.** L'action pour ${target} a été annulée.`);
        }
    });
}

async function sendInvitation(interaction, author, target, role, action, fromVote = false) {
    const authorData = await db.getOrCreateUser(author.id);
    const targetData = await db.getOrCreateUser(target.id);

    let inviteEmbed = new EmbedBuilder()
        .setTitle("📩 Invitation Familiale")
        .setColor("#FFD700") // Gold color
        .setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n${fromVote ? "*(Approuvé par vote)*" : ""}\n\nAcceptez-vous de rejoindre cette famille ?`)
        .setFooter({ text: "Acceptez-vous de rejoindre cette famille ?" });

    let row;
    if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName && role !== 'conjoint') {
        inviteEmbed.setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n\nVous avez déjà une famille (**${targetData.familyName.toUpperCase()}**). Voulez-vous fusionner vos lignées ou quitter la vôtre ?`);
        row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter & Quitter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_merge').setLabel('Fusionner').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    } else {
        // If role is 'conjoint' or no family conflict, only offer accept/refuse. No merge option.
        row = new ActionRowBuilder().addComponents( 
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    }

    const method = interaction.replied ? 'editReply' : 'reply';
    const msg = await interaction[method]({ content: `${target}`, embeds: [inviteEmbed], components: [row] });

    const collector = (msg || await interaction.fetchReply()).createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    
    collector.on('collect', async (i) => {
        if (i.user.id !== target.id) return i.reply({ content: "Ce n'est pas pour vous.", flags: MessageFlags.Ephemeral });

        if (i.customId === 'i_ok') {
            const updatePromises = [];
            const isBothFamilyMarriage = role === 'conjoint' && authorData.familyName && targetData.familyName && authorData.familyName !== targetData.familyName;

            if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName && !isBothFamilyMarriage) {
                updatePromises.push(clearUserFamilyLinks(target.id));
            }
            updatePromises.push(executeLinkChange(author.id, target.id, role, action));
            if (authorData.familyName && !isBothFamilyMarriage) {
                const family = await db.getFamily(authorData.familyName);
                if (family && !family.members.includes(target.id)) {
                    family.members.push(target.id);
                    updatePromises.push(db.updateFamily(authorData.familyName, { members: family.members }));
                }
                updatePromises.push(db.updateUser(target.id, { familyName: authorData.familyName }));
            }
            await Promise.all(updatePromises);
            await i.message.delete();
            await i.channel.send(`🎊 Félicitations ! ${target} est maintenant le/la **${role}** de ${author} !`);
        } else if (i.customId === 'i_merge') {
            const mergePromises = [];
            mergePromises.push(mergeFamilies(authorData.familyName, targetData.familyName, author.id, target.id, role));
            mergePromises.push(executeLinkChange(author.id, target.id, role, action));
            await Promise.all(mergePromises);
            await i.message.delete();
            await i.channel.send(`🤝 Les familles ont fusionné ! ${target} est maintenant le/la **${role}** de ${author} !`);
        } else {
            await i.message.delete();
            await i.channel.send(`😔 ${target} a refusé l'invitation de ${author}.`);
        }
        collector.stop();
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && (msg || await interaction.fetchReply())) {
            await (msg || await interaction.fetchReply()).edit({ components: [] }).catch(() => {}); // Disable buttons if timed out
            await interaction.channel.send(`⌛ L'invitation de ${author} à ${target} a expiré.`);
        }
        collector.stop();
    });
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Prefix: ${PREFIX}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const authorId = message.author.id;
    const authorData = await db.getOrCreateUser(authorId);

    const target = message.mentions.users.first(); // Target user for commands
    if (['adminfamily', 'family', 'account', 'info'].includes(command)) {
        await message.channel.sendTyping();
    }

    let response = null;

    switch (command) {
        case 'adminfamily': {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Admin uniquement.");
            const familyName = args.join(' ');
            if (!familyName) return message.reply(`Usage: ${PREFIX}adminfamily <Nom de la famille>`);
            
            const family = await db.getFamily(familyName);
            if (!family) return message.reply(`❌ Famille "${familyName}" introuvable.`);

            const embed = new EmbedBuilder()
                .setTitle(`🛠️ Admin : Famille ${familyName.toUpperCase()}`)
                .setColor("#e74c3c")
                .setDescription("Sélectionnez une action administrative.");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_add').setLabel('➕ Ajouter').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('adm_modify').setLabel('📝 Modifier').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('adm_remove').setLabel('❌ Retirer').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adm_clear').setLabel('🗑️ Reset').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adm_cancel').setLabel('Fermer').setStyle(ButtonStyle.Secondary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_lineage').setLabel('🌳 Lignée').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('adm_full').setLabel('📜 Lignée Complète').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('adm_hist').setLabel('📜 Historique').setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.reply({ embeds: [embed], components: [row, row2] }); // Initial reply
            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId && i.customId.startsWith('adm_'), time: 120000 });

            coll.on('collect', async (i) => {
                if (i.customId === 'adm_cancel') return i.message.delete();
                if (i.customId === 'adm_clear') {
                    for (const mId of family.members) {
                        await db.updateUser(mId, { familyName: null, spouse: null, children: [], mother: null, father: null, customLinks: {} });
                    }
                    await db.deleteFamily(familyName); // Delete the family after clearing members
                    await i.message.delete();
                    return i.channel.send(`✅ Famille **${familyName.toUpperCase()}** supprimée.`);
                }

                const action = i.customId.replace('adm_', '');

                if (action === 'lineage') {
                    const buffer = await generateFamilyImage(client, family.head);
                    if (!buffer) {
                        const textTree = await generateFamilyText(client, family.head);
                        return i.reply({ content: `🌳 **Arbre de la famille :**\n\`\`\`\n${textTree}\n\`\`\``, ephemeral: true });
                    }
                    return i.reply({ files: [new AttachmentBuilder(buffer, { name: 'family.png' })], ephemeral: true });
                }
                if (action === 'full') { // Display all members of the family
                    const membersStr = (await Promise.all(family.members.map(async mId => {
                        const u = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
                        return u ? `• ${u.username}` : `• ${mId}`;
                    }))).join('\n');
                    return i.reply({ content: `📜 **Membres (${familyName.toUpperCase()}) :**\n${membersStr}`, ephemeral: true });
                }
                if (action === 'hist') return i.reply({ content: "📜 L'historique sera disponible bientôt.", ephemeral: true });

                let targetSelectRow;
                if (action === 'add') { // For adding, use UserSelectMenu to pick any user
                    targetSelectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('target').setPlaceholder('Choisir le membre à ajouter...'));
                } else { // For modify/remove, use StringSelectMenu with existing family members
                    const options = await Promise.all(family.members.map(async (mId) => {
                        const user = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
                        return { label: user ? user.username : mId, value: mId };
                    }));
                    targetSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('target').setPlaceholder(`Choisir le membre à ${action === 'remove' ? 'retirer' : 'modifier'}...`).addOptions(options));
                }
                await i.update({ content: `Action: **${action}**. Sélectionnez le membre.`, components: [targetSelectRow] });

                try {
                    const ui = await i.message.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && subI.customId === 'target', 
                        time: 60000 
                    }); // Wait for user selection
                    await ui.deferUpdate(); // Acquittement immédiat pour éviter le timeout de 3s

                    const targetId = ui.values[0];
                    const targetData = await db.getOrCreateUser(targetId);

                    if (action === 'add' && targetData.familyName === family._id) {
                        await ui.followUp({ content: "❌ Cet utilisateur est déjà dans cette famille.", ephemeral: true });
                        return msg.delete();
                    }
                    if ((action === 'remove' || action === 'modify') && targetData.familyName !== family._id) {
                        await ui.followUp({ content: "❌ Cet utilisateur n'est pas dans cette famille.", ephemeral: true });
                        return msg.delete();
                    }

                    if (action === 'remove') {
                        // For a full removal from the family, clear all user family links
                        await clearUserFamilyLinks(targetId);
                        // Also remove the target from the family's member list
                        const currentFamily = await db.getFamily(familyName); // Re-fetch to ensure it's up-to-date
                        if (currentFamily) {
                            const updatedMembers = currentFamily.members.filter(id => id !== targetId);
                            await db.updateFamily(currentFamily._id, { members: updatedMembers });
                        }
                        await msg.delete();
                        return ui.channel.send(`✅ Membre <@${targetId}> retiré de la famille.`);
                    }

                    const rMenu = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('role').setPlaceholder('Rôle...')
                            .addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))),
                        new ButtonBuilder().setCustomId('cancel_role').setLabel('Annuler').setStyle(ButtonStyle.Danger)
                    );

                    // On utilise editReply car l'interaction a été "deferred"
                    await ui.editReply({ content: `Attribuer un rôle à <@${targetId}> :`, components: [rMenu] });

                    try {
                        const ri = await i.message.awaitMessageComponent({ 
                            filter: subI => subI.user.id === authorId && ['role', 'cancel_role'].includes(subI.customId), 
                            time: 60000 
                        }); // Wait for role selection
                        await ri.deferUpdate(); // Acquittement immédiat
                        
                        if (ri.customId === 'cancel_role') return i.message.delete();
                        
                        await executeLinkChange(family.head, targetId, ri.values[0], 'add');
                        await db.updateUser(targetId, { familyName: family._id });
                        if (!family.members.includes(targetId)) {
                            family.members.push(targetId);
                            await db.updateFamily(family._id, { members: family.members });
                        }
                        await msg.delete();
                        return ri.channel.send(`✅ Rôle **${ri.values[0]}** mis à jour pour <@${targetId}>.`);
                    } catch (e) {
                        console.error("Erreur sélection rôle admin:", e);
                        await msg.edit({ content: "Action annulée ou temps écoulé pour le choix du rôle.", components: [] }).catch(() => {});
                    }
                } catch (e) {
                    console.error("Erreur sélection membre admin:", e); // Log errors from awaitMessageComponent
                    await msg.edit({ content: "Action annulée ou temps écoulé pour la sélection du membre.", components: [] }).catch(() => {});
                }
            });
            coll.on('end', () => msg.edit({ components: [] }).catch(() => {}));
            return;
        }

        case 'family': {
            if (args.length > 0) {
                await message.channel.sendTyping();
                const inputName = args.join(' ').toLowerCase();
                const targetUser = message.mentions.users.first();
                let targetId = targetUser ? targetUser.id : null;
                
                let family = await db.getFamily(inputName);
                
                if (targetId && !family) {
                    const targetData = await db.getOrCreateUser(targetId);
                    if (targetData.familyName) family = await db.getFamily(targetData.familyName);
                }

                if (!targetId && family) targetId = family.head;
                else if (!targetId) return message.reply("❌ Famille introuvable.");
                
                const [buffer, ext] = await Promise.all([
                    generateFamilyImage(client, targetId),
                    getExtendedFamily(targetId)
                ]);

                const displayTitle = family ? family._id.toUpperCase() : "Inconnue";
                
                const embed = new EmbedBuilder()
                    .setTitle(`Généalogie de la Famille ${displayTitle}`) // Display family name or "Inconnue"
                    .setColor('#5865F2')
                
                let files = [];
                if (buffer) {
                    embed.setImage('attachment://family.png');
                    files = [new AttachmentBuilder(buffer, { name: 'family.png' })];
                } else {
                    const textTree = await generateFamilyText(client, targetId);
                    embed.setDescription(`🌳 **Arbre (Mode Texte - Simplifié) :**\n\`\`\`\n${textTree}\n\`\`\``);
                }
                
                embed.addFields( // Add fields for family details
                        { name: '👑 Chef de Lignée', value: family?.head ? formatMention(family.head) : 'Inconnu', inline: true },
                        { name: '👥 Membres', value: family?.members ? family.members.length.toString() : '1', inline: true },
                        { name: '👫 Fratrie', value: Array.from(ext.siblings).map(formatMention).join(', ') || 'Aucun', inline: false },
                        { name: '👴 Grands-parents', value: Array.from(ext.grandparents).map(formatMention).join(', ') || 'Aucun', inline: false },
                        { name: '👨‍👩‍👧‍👦 Oncles & Tantes', value: Array.from(ext.unclesAunts).map(formatMention).join(', ') || 'Aucun', inline: false },
                        { name: '🧒 Cousins', value: Array.from(ext.cousins).map(formatMention).join(', ') || 'Aucun', inline: false }
                    )
                    .setFooter({ text: `Consulté par ${message.author.username}` })
                    .setTimestamp();

                return message.reply({ embeds: [embed], files: files });
            }

            const embed = new EmbedBuilder().setTitle("🏠 Gestion de Famille").setColor("#5865F2"); // Main family dashboard
            const rows = [];

            if (!authorData.familyName) {
                embed.setDescription("Vous ne possédez pas de famille. Souhaitez-vous fonder votre propre lignée ?");
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_fam').setLabel('Créer une famille').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_main').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
                ));
            } else {
                const family = await db.getFamily(authorData.familyName);
                const isHead = family.head === authorId;
                embed.setDescription(`Dynastie : **${authorData.familyName.toUpperCase()}**\nRang : ${isHead ? "Chef" : "Membre"}`);
                
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fam_add').setLabel('➕ Ajouter').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('fam_modify').setLabel('📝 Modifier').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('fam_remove').setLabel('❌ Retirer').setStyle(ButtonStyle.Danger)
                ));
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fam_lineage').setLabel('🌳 Lignée').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('fam_full').setLabel('📜 Lignée Complète').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('fam_hist').setLabel('📜 Historique').setStyle(ButtonStyle.Secondary)
                ));
                const row3 = new ActionRowBuilder();
                if (isHead) row3.addComponents(new ButtonBuilder().setCustomId('fam_transfer').setLabel('👑 Transférer').setStyle(ButtonStyle.Primary));
                row3.addComponents(new ButtonBuilder().setCustomId('fam_leave').setLabel('👋 Quitter').setStyle(ButtonStyle.Danger));
                if (isHead) {
                    row3.addComponents(new ButtonBuilder().setCustomId('fam_delete').setLabel('🗑️ Dissoudre').setStyle(ButtonStyle.Danger));
                }
                row3.addComponents(new ButtonBuilder().setCustomId('fam_cancel').setLabel('Fermer').setStyle(ButtonStyle.Secondary)); // Cancel button
                rows.push(row3);
            }

            const msg = await message.reply({ embeds: [embed], components: rows });
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId && (i.customId.startsWith('fam_') || i.customId === 'create_fam' || i.customId === 'cancel_main'), time: 120000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'cancel_main' || i.customId === 'fam_cancel') return i.message.delete();

                if (i.customId === 'create_fam') {
                    const modal = new ModalBuilder().setCustomId('modal_create_fam').setTitle('Nouvelle Famille');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fam_name').setLabel("Nom de famille").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal);
                }

                const action = i.customId.startsWith('fam_') ? i.customId.replace('fam_', '') : null;
                if (!action) return;

                if (action === 'lineage') { // Display user's family tree
                    const buffer = await generateFamilyImage(client, authorId);
                    if (!buffer) {
                        const textTree = await generateFamilyText(client, authorId);
                        return i.reply({ content: `🌳 **Votre Arbre (Simplifié) :**\n\`\`\`\n${textTree}\n\`\`\``, ephemeral: true });
                    }
                    return i.reply({ files: [new AttachmentBuilder(buffer, { name: 'family.png' })], ephemeral: true });
                }
                if (action === 'full') { // Display all members of user's family
                    const family = await db.getFamily(authorData.familyName);
                    const membersStr = (await Promise.all(family.members.map(async mId => {
                        const u = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
                        return u ? `• ${u.username}` : `• ${mId}`;
                    }))).join('\n');
                    return i.reply({ content: `📜 **Membres de la famille ${authorData.familyName.toUpperCase()} :**\n${membersStr}`, ephemeral: true });
                }
                if (action === 'hist') return i.reply({ content: "📜 Historique à venir.", ephemeral: true }); // Placeholder for history
                if (action === 'transfer') {
                    const family = await db.getFamily(authorData.familyName);
                    const options = await Promise.all(family.members.filter(mId => mId !== authorId).map(async mId => {
                        const u = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
                        return { label: u ? u.username : mId, value: mId };
                    }));
                    if (options.length === 0) return i.reply({ content: "❌ Aucun autre membre disponible.", ephemeral: true });
                    const transferRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('transfer_target').setPlaceholder('Nouveau Chef...').addOptions(options)); // Select menu for new head
                    return i.update({ content: "👑 Choisissez le nouveau chef de la dynastie :", components: [transferRow] });
                }

                if (action === 'delete') {
                    const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_del').setLabel('Confirmer').setStyle(ButtonStyle.Danger)); // Confirmation for deletion
                    return i.update({ content: "⚠️ Dissoudre la famille ?", components: [confirm] });
                }

                if (action === 'leave') {
                    await clearUserFamilyLinks(authorId);
                    await i.message.delete();
                    return i.channel.send(`👋 ${message.author} a quitté sa famille.`);
                }

                let targetSelectRow; // Select menu for target user
                if (action === 'add') {
                    targetSelectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('u').setPlaceholder('Choisir le futur membre...'));
                } else {
                    const family = await db.getFamily(authorData.familyName);
                    const options = await Promise.all(family.members.map(async (mId) => {
                        const user = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
                        return { label: user ? user.username : mId, value: mId }; // Options for existing family members
                    }));
                    targetSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('u').setPlaceholder('Choisir le membre de la famille...').addOptions(options));
                }
                await i.update({ content: `Action : **${action}**.`, components: [targetSelectRow] });

                try {
                    const ui = await i.message.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && ['u', 'transfer_target'].includes(subI.customId), 
                        time: 60000 
                    }); // Wait for user selection or transfer target

                    if (ui.customId === 'transfer_target') {
                        await db.updateFamily(authorData.familyName, { head: ui.values[0] });
                        await msg.delete();
                        return ui.channel.send(`👑 **${formatMention(ui.values[0])}** est le nouveau chef de la famille **${authorData.familyName.toUpperCase()}** !`);
                    }

                    await ui.deferUpdate();

                    const targetId = ui.values[0];
                    const targetData = await db.getOrCreateUser(targetId);
                    const targetUser = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);

                    if (!targetUser) {
                        await ui.followUp({ content: "❌ Impossible de trouver cet utilisateur.", ephemeral: true });
                        return msg.delete();
                    }

                    if (action === 'add' && targetData.familyName === authorData.familyName) {
                        await ui.followUp({ content: "❌ Cet utilisateur est déjà dans votre famille.", ephemeral: true });
                        return msg.delete();
                    }
                    if ((action === 'remove' || action === 'modify') && targetData.familyName !== authorData.familyName) {
                        await ui.followUp({ content: "❌ Cet utilisateur n'est pas dans votre famille.", ephemeral: true });
                        return msg.delete();
                    }

                    if (action === 'remove') return startFamilyVote(ui, message.author, targetUser, 'Aucun', 'remove');

                    // NOTE: when user changes a relation (modify), we must remove old relations
                    // through executeLinkChange(), otherwise old nodes remain in the tree.

                    const rMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('r').setPlaceholder('Rôle...').addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))));
                    await ui.editReply({ content: `Rôle pour <@${targetUser.id}> :`, components: [rMenu] });

                    const ri = await i.message.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId && subI.customId === 'r', 
                        componentType: ComponentType.StringSelect, 
                        time: 60000 
                    }); // Wait for role selection
                    await ri.deferUpdate();

                    if (action === 'add') await sendInvitation(ri, message.author, targetUser, ri.values[0], 'add');
                    else await startFamilyVote(ri, message.author, targetUser, ri.values[0], 'modify');
                } catch (e) {
                    console.error("Erreur family (membre/rôle):", e);
                    await msg.edit({ content: "Action annulée ou temps écoulé.", components: [] }).catch(() => {});
                }
            });
            collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
            return;
        }

        case 'familytop':
        case 'account': {
            await message.channel.sendTyping();
            // Optimized showWealth and showTop functions
            const fetchAllUBWealth = async (guildId, userMap) => {
                const allUniqueUserIds = new Set();
                for (const uId in userMap) {
                    const uData = userMap[uId];
                    allUniqueUserIds.add(uId);
                    if (uData.spouse) allUniqueUserIds.add(uData.spouse);
                    if (uData.children) uData.children.forEach(childId => allUniqueUserIds.add(childId));
                }

                const userWealthMap = new Map();
                const ubFetchPromises = Array.from(allUniqueUserIds).map(async (id) => {
                    const ubUser = await getUBUser(guildId, id);
                    userWealthMap.set(id, ubUser ? ubUser.cash : 0);
                });
                await Promise.all(ubFetchPromises);
                return userWealthMap;
            };

            const allUsersData = await db.getAllUsers(); // Fetch all users once
            const userWealthMap = await fetchAllUBWealth(message.guild.id, allUsersData);

            const showWealth = (uId, uData) => {
                let total = userWealthMap.get(uId) || 0;
                if (uData.spouse) total += userWealthMap.get(uData.spouse) || 0;
                if (uData.children) uData.children.forEach(id => total += userWealthMap.get(id) || 0);
                return new EmbedBuilder().setTitle('🏦 Banque Familiale').setColor('#F1C40F').addFields({ name: 'Fortune Totale', value: `💰 **${total.toLocaleString()}** cr.`, inline: false });
            };

            const showTop = () => {
                const familyWealths = [];
                const processedGroups = new Set(); // To avoid double counting for couples/families

                for (const uId in allUsersData) {
                    const uData = allUsersData[uId];
                    const groupKey = uData.spouse ? [uId, uData.spouse].sort().join('-') : uId;
                    if (processedGroups.has(groupKey)) continue;
                    processedGroups.add(groupKey);

                    let totalWealth = 0;
                    const membersInGroup = new Set();
                    membersInGroup.add(uId);
                    if (uData.spouse) membersInGroup.add(uData.spouse);
                    if (uData.children) uData.children.forEach(childId => membersInGroup.add(childId));

                    for (const memberId of membersInGroup) {
                        totalWealth += userWealthMap.get(memberId) || 0;
                    }
                    familyWealths.push({ headId: uId, total: totalWealth });
                }
                familyWealths.sort((a, b) => b.total - a.total);
                const embed = new EmbedBuilder().setTitle('🏆 Top des Familles').setColor('#ffd700');
                familyWealths.slice(0, 10).forEach((f, i) => embed.addFields({ name: `${i + 1}. ${formatMention(f.headId)}`, value: `💰 ${f.total.toLocaleString()} cr.`, inline: false }));
                return embed;
            };

            const initialEmbed = (command === 'familytop') ? showTop() : showWealth(authorId, authorData);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_wealth').setLabel('Ma Fortune').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_top').setLabel('🏆 Classement').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancel_bank').setLabel('❌').setStyle(ButtonStyle.Secondary)
            );
            const msg = await message.reply({ embeds: [initialEmbed], components: [row] });
            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 60000 }); // Increased timeout
            coll.on('collect', async (i) => {
                if (i.customId === 'cancel_bank') return i.message.delete();
                await i.deferUpdate();
                const newEmbed = (i.customId === 'v_top') ? showTop() : showWealth(authorId, authorData);
                await i.editReply({ embeds: [newEmbed] });
            });
            coll.on('end', async (collected, reason) => { if (reason === 'time') await msg.delete().catch(() => {}); });
            return;
        }

        case 'help': {
            const h = new EmbedBuilder() // Help command embed
                .setColor('#5865F2')
                .setTitle('📚 Guide Complet de la Dynastie')
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(`Gérez vos lignées et votre fortune via nos dashboards interactifs !\nPréfixe : \`${PREFIX}\``)
                .addFields(
                    { name: '🏠 Famille', value: `\`${PREFIX}family\` : Dashboard personnel.\n\`${PREFIX}family <Nom>\` : Voir l'arbre.` },
                    { name: 'ℹ️ Profil', value: `\`${PREFIX}info [@User]\` : Fiche d'identité et personnalisation.` },
                    { name: '💰 Fortune', value: `\`${PREFIX}account\` : Richesse du foyer et classement.` },
                    { name: '💍 Social', value: `\`${PREFIX}marry <@User>\` : Demander quelqu'un en mariage.\n\`${PREFIX}divorce\` : Divorcer.\n\`${PREFIX}hug <@User>\` : Câliner.\n\`${PREFIX}kiss <@User>\` : Embrasser.\n\`${PREFIX}pat <@User>\` : Tapoter.\n\`${PREFIX}slap <@User>\` : Gifler.\n\`${PREFIX}poke <@User>\` : Titiller.` },
                    { name: '�️ Admin', value: `\`${PREFIX}adminfamily <Nom>\` : Gestion de dynastie.` }
                );
            return message.reply({ embeds: [h] });
        }

        case 'marry': {
            if (!target) return message.reply('Qui veux-tu épouser ?');
            if (target.id === authorId) return message.reply('Tu ne peux pas t\'épouser toi-même !');

            const authorData = await db.getOrCreateUser(authorId);
            const targetData = await db.getOrCreateUser(target.id);

            if (authorData.spouse) return message.reply(`Tu es déjà marié(e) à ${formatMention(authorData.spouse)}.`);
            if (targetData.spouse) return message.reply(`${formatMention(target.id)} est déjà marié(e).`);

            const marryEmbed = new EmbedBuilder()
                .setTitle("💖 Demande en Mariage")
                .setColor("#FF69B4")
                .setDescription(`${formatMention(target.id)}, ${formatMention(authorId)} te demande en mariage !`) // Marriage proposal embed
                .setFooter({ text: "Tu as 60 secondes pour répondre." });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('m_accept').setLabel('Accepter').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('m_decline').setLabel('Refuser').setStyle(ButtonStyle.Danger)
            );

            const msg = await message.reply({ content: `${formatMention(target.id)}`, embeds: [marryEmbed], components: [row] }); // Send proposal

            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === target.id,
                componentType: ComponentType.Button,
                time: 60000 // 60 seconds
            });

            collector.on('collect', async (i) => {
                await i.deferUpdate(); // Acknowledge the interaction immediately

                if (i.customId === 'm_accept') {
                    const currentAuthorData = await db.getOrCreateUser(authorId);
                    const currentTargetData = await db.getOrCreateUser(target.id);

                    if (currentAuthorData.spouse || currentTargetData.spouse) {
                        await i.followUp({ content: "L'un de vous est déjà marié(e) ! La demande est annulée.", flags: MessageFlags.Ephemeral });
                        return msg.delete();
                    }

                    const userUpdates = []; // Collect user updates
                    const familyUpdates = []; // Collect family updates

                    const authorHasFamily = !!currentAuthorData.familyName;
                    const targetHasFamily = !!currentTargetData.familyName;

                    let finalFamilyName = null;

                    if (!authorHasFamily && !targetHasFamily) {
                        // Scenario 1: Both have no family - create a new one for them
                        const newFamilyName = `${message.author.username.substring(0, 5)}-${target.username.substring(0, 5)}-famille`.toLowerCase();
                        familyUpdates.push(db.createFamily(newFamilyName, authorId)); // Create family
                        userUpdates.push(db.updateUser(authorId, { familyName: newFamilyName }));
                        userUpdates.push(db.updateUser(target.id, { familyName: newFamilyName }));
                        finalFamilyName = newFamilyName;
                        await Promise.all(familyUpdates); // Ensure family is created before updating its members
                        const family = await db.getFamily(newFamilyName); // Fetch the newly created family
                        if (family && !family.members.includes(target.id)) {
                            family.members.push(target.id);
                            familyUpdates.push(db.updateFamily(newFamilyName, { members: family.members }));
                        }
                        await i.followUp({ content: `🎉 Félicitations ! ${formatMention(authorId)} et ${formatMention(target.id)} sont maintenant mariés et ont fondé la famille **${newFamilyName.toUpperCase()}** !`, ephemeral: false });
                    } else if (authorHasFamily && !targetHasFamily) {
                        // Scenario 2: Author has family, target does not - target joins author's family
                        userUpdates.push(db.updateUser(target.id, { familyName: currentAuthorData.familyName }));
                        const authorFamily = await db.getFamily(currentAuthorData.familyName);
                        if (authorFamily && !authorFamily.members.includes(target.id)) {
                            authorFamily.members.push(target.id);
                            familyUpdates.push(db.updateFamily(authorFamily._id, { members: authorFamily.members }));
                        }
                        finalFamilyName = currentAuthorData.familyName;
                        await i.followUp({ content: `🎉 Félicitations ! ${formatMention(authorId)} et ${formatMention(target.id)} sont maintenant mariés ! ${formatMention(target.id)} a rejoint la famille **${currentAuthorData.familyName.toUpperCase()}** !`, ephemeral: false });
                    } else if (!authorHasFamily && targetHasFamily) {
                        // Scenario 3: Target has family, author does not - author joins target's family
                        userUpdates.push(db.updateUser(authorId, { familyName: currentTargetData.familyName }));
                        const targetFamily = await db.getFamily(currentTargetData.familyName);
                        if (targetFamily && !targetFamily.members.includes(authorId)) {
                            targetFamily.members.push(authorId);
                            familyUpdates.push(db.updateFamily(targetFamily._id, { members: targetFamily.members }));
                        }
                        finalFamilyName = currentTargetData.familyName;
                        await i.followUp({ content: `🎉 Félicitations ! ${formatMention(authorId)} et ${formatMention(target.id)} sont maintenant mariés ! ${formatMention(authorId)} a rejoint la famille **${currentTargetData.familyName.toUpperCase()}** !`, ephemeral: false });
                    } else if (authorHasFamily && targetHasFamily && currentAuthorData.familyName !== currentTargetData.familyName) {
                        // Scenario 4: Both have different families - they stay in their respective families
                        await i.followUp({ content: `🎉 Félicitations ! ${formatMention(authorId)} et ${formatMention(target.id)} sont maintenant mariés tout en gardant leurs lignées respectives !`, ephemeral: false });
                    } else if (authorHasFamily && targetHasFamily && currentAuthorData.familyName === currentTargetData.familyName) {
                        // Scenario 5: Both are in the same family but not married to each other
                        finalFamilyName = currentAuthorData.familyName;
                        await i.followUp({ content: `🎉 Félicitations ! ${formatMention(authorId)} et ${formatMention(target.id)} sont maintenant mariés au sein de la famille **${finalFamilyName.toUpperCase()}** !`, ephemeral: false });
                    }
                    
                    await Promise.all([...userUpdates, ...familyUpdates]); // Execute all collected updates
                    // Establish the spouse link
                    await executeLinkChange(authorId, target.id, 'conjoint', 'add');

                    // Ensure both spouses appear in each other's family tree context via parent/child links.
                    // Rule: if one of the married persons is already a child (has father/mother), keep those links.
                    // Also ensure spouse relations are not overwritten by future parent changes.

                    await msg.delete(); // Delete the proposal message
                } else if (i.customId === 'm_decline') {
                    await i.followUp({ content: `😔 ${formatMention(target.id)} a refusé la demande en mariage de ${formatMention(authorId)}.`, ephemeral: false });
                    await msg.delete(); // Delete the proposal message
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await msg.delete().catch(() => {}); // Delete if timed out, ignore if already deleted
                    await message.channel.send(`⌛ La demande en mariage de ${formatMention(authorId)} à ${formatMention(target.id)} a expiré.`);
                }
            });
            return;
        }

        case 'stop': {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
            await message.reply("Arrêt du bot...");
            process.exit(0);
        }

        case 'info': {
            const targetUser = target || message.author;
            const userData = await db.getOrCreateUser(targetUser.id);
            const family = userData.familyName ? await db.getFamily(userData.familyName) : null; // Fetch family if user has one

            const buildEmbed = () => new EmbedBuilder()
                .setTitle(`Profil Familial - ${targetUser.username}`)
                .setColor('#3498db')
                .addFields(
                    { name: '🏷️ Nom de Famille', value: userData.familyName ? userData.familyName.toUpperCase() : 'Aucun', inline: true },
                    { name: '🎭 Rang', value: family?.head === targetUser.id ? "Chef" : (userData.familyName ? "Membre" : "Aucun"), inline: true },
                    { name: '👤 Genre', value: userData.gender || 'Non défini', inline: true },
                    { name: '📝 Bio', value: userData.bio || 'Aucune bio définie.', inline: false },
                    { name: '💍 Conjoint', value: userData.spouse ? formatMention(userData.spouse) : 'Célibataire', inline: true },
                    { name: '👨 Père', value: userData.father ? formatMention(userData.father) : 'Inconnu', inline: true },
                    { name: '👩 Mère', value: userData.mother ? formatMention(userData.mother) : 'Inconnue', inline: true }
                );

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('edit_p').setLabel('⚙️ Personnaliser').setStyle(ButtonStyle.Secondary)); // Edit profile button
            const msg = await message.reply({ embeds: [buildEmbed()], components: targetUser.id === authorId ? [row] : [] });
            if (targetUser.id !== authorId) return;

            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });
            coll.on('collect', async (i) => {
                if (i.customId === 'edit_p') {
                    const menu = new StringSelectMenuBuilder().setCustomId('p_field').setPlaceholder('Modifier...')
                        .addOptions([
                            { label: 'Ma Bio', value: 'bio' },
                            { label: 'Mon Genre', value: 'gender' },
                            { label: 'Nom de Lignée', value: 'name' },
                            { label: 'Nom du Conjoint', value: 'spouse' }
                        ]); // Select menu for profile fields
                    return i.update({ content: "Que modifier ?", components: [new ActionRowBuilder().addComponents(menu)] });
                }
                if (i.values?.[0] === 'bio') {
                    const modal = new ModalBuilder().setCustomId('modal_bio').setTitle('Ma Bio');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bio_text').setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return i.showModal(modal);
                }
                if (i.values?.[0] === 'gender') {
                    const gRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_gen').setPlaceholder('Genre...')
                        .addOptions([{ label: 'Masculin', value: 'masculin' }, { label: 'Féminin', value: 'féminin' }, { label: 'Autre', value: 'autre' }]));
                    return i.update({ content: "Votre genre ?", components: [gRow] }); // Select menu for gender
                }
                if (i.customId === 'sel_gen') {
                    await db.updateUser(authorId, { gender: i.values[0] });
                    return i.update({ content: "✅ Genre mis à jour.", components: [] });
                }
                if (i.values?.[0] === 'name') {
                    const modal = new ModalBuilder().setCustomId('modal_rename_branch').setTitle('Nom de Branche');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal); // Modal for renaming family/branch
                }
                if (i.values?.[0] === 'spouse') {
                    if (!authorData.spouse) return i.reply({ content: "Pas de conjoint.", flags: MessageFlags.Ephemeral });
                    const sData = await db.getOrCreateUser(authorData.spouse);
                    if (!sData.familyName) return i.reply({ content: "Pas de nom de famille.", flags: MessageFlags.Ephemeral });
                    await db.updateUser(authorId, { familyName: sData.familyName });
                    return i.update({ content: "💍 Nom adopté !", components: [] });
                }
            });
            return;
        }

        case 'divorce': {
            if (!authorData.spouse) return message.reply('Tu n\'es pas marié(e).');
            await executeLinkChange(authorId, authorData.spouse, null, 'remove'); // Remove spouse link
            return message.reply(`💔 Tu as divorcé de ${formatMention(authorData.spouse)}.`);
        }

        case 'hug': {
            if (!target) return message.reply('Qui veux-tu câliner ?');
            const rel = await areRelated(authorId, target.id);
            let desc = `${formatMention(authorId)} fait un gros câlin à ${formatMention(target.id)} !`;
            if (rel && rel !== 'soi-même') desc += ` ❤️ Les câlins entre **${rel}s** sont les meilleurs !`;
            if (rel === 'soi-même') desc = `Tu te fais un câlin à toi-même ? C'est mignon mais un peu solitaire !`;

            const embed = new EmbedBuilder()
                .setColor('#FFC0CB') // Pink color
                .setDescription(desc)
                .setImage('https://media.giphy.com/media/u9B3S2ArX9X5S/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'kiss': {
            if (!target) return message.reply('Qui veux-tu embrasser ?');
            if (authorData.spouse !== target.id) {
                return message.reply(`Désolé, mais tu ne peux embrasser que ton/ta conjoint(e) ! 💍`);
            }
            const embed = new EmbedBuilder()
                .setColor('#FF0000') // Red color
                .setDescription(`💋 ${formatMention(authorId)} embrasse amoureusement ${formatMention(target.id)} !`)
                .setImage('https://media.giphy.com/media/G3va31WfEKhS8/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'pat': {
            if (!target) return message.reply('Qui veux-tu tapoter ?');
            const rel = await areRelated(authorId, target.id); // Await async areRelated
            let desc = `${formatMention(authorId)} tapote la tête de ${formatMention(target.id)}.`;
            if (['enfant', 'parent', 'frère/soeur'].includes(rel)) {
                desc = `😊 ${formatMention(authorId)} tapote affectueusement la tête de son **${rel}**, ${formatMention(target.id)}.`;
            }
            const embed = new EmbedBuilder() // Light blue color
                .setColor('#87CEEB')
                .setDescription(desc)
                .setImage('https://media.giphy.com/media/ARSp9T7wwxNcs/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'slap': {
            if (!target) return message.reply('Qui veux-tu gifler ?');
            const rel = await areRelated(authorId, target.id); // Await async areRelated
            let desc = `💥 ${formatMention(authorId)} donne une gifle à ${formatMention(target.id)} !`;
            if (rel && rel !== 'soi-même') desc += ` Oh non, une dispute de famille entre **${rel}s** !`;

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription(desc)
                .setImage('https://media.giphy.com/media/uG3lKscP9lE1W/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'poke': {
            if (!target) return message.reply('Qui veux-tu titiller ?');
            const rel = await areRelated(authorId, target.id); // Await async areRelated
            let desc = `${formatMention(authorId)} donne un petit coup de doigt à ${formatMention(target.id)}.`;
            if (rel && rel !== 'soi-même') desc = `👉 ${formatMention(authorId)} embête son **${rel}**, ${formatMention(target.id)} !`;
            
            const embed = new EmbedBuilder()
                .setColor('#98FB98')
                .setDescription(desc)
                .setImage('https://media.giphy.com/media/1X7Ag3SAsZ2Gk/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'modal_create_fam') {
        const name = interaction.fields.getTextInputValue('fam_name').toLowerCase();
        if (await db.getFamily(name)) return interaction.reply({ content: "❌ Nom déjà pris.", flags: MessageFlags.Ephemeral });
        await db.createFamily(name, interaction.user.id);
        await db.updateUser(interaction.user.id, { familyName: name });
        await interaction.reply({ content: `🎉 Famille **${name.toUpperCase()}** fondée !` });
    }

    if (interaction.customId === 'modal_bio') {
        await db.updateUser(interaction.user.id, { bio: interaction.fields.getTextInputValue('bio_text') });
        await interaction.reply({ content: "✅ Bio mise à jour !", flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'modal_rename_branch') {
        const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
        if (await db.getFamily(newName)) return interaction.reply({ content: "❌ Nom déjà pris.", flags: MessageFlags.Ephemeral });
        const uData = await db.getOrCreateUser(interaction.user.id);
        const oldName = uData.familyName;
        const family = oldName ? await db.getFamily(oldName) : null;
        const updatePromises = [];

        if (family?.head === interaction.user.id) {
            updatePromises.push(db.createFamily(newName, interaction.user.id));
            updatePromises.push(db.updateFamily(newName, { members: family.members }));
            for (const mId of family.members) updatePromises.push(db.updateUser(mId, { familyName: newName }));
            updatePromises.push(db.deleteFamily(oldName));
            await Promise.all(updatePromises);
            await interaction.reply({ content: `✅ Dynastie renommée : **${newName.toUpperCase()}** !` });
        } else {
            if (oldName && family) updatePromises.push(db.updateFamily(oldName, { members: family.members.filter(id => id !== interaction.user.id) }));
            updatePromises.push(db.createFamily(newName, interaction.user.id));
            updatePromises.push(db.updateUser(interaction.user.id, { familyName: newName }));
            await Promise.all(updatePromises);
            await propagateNameChange(interaction.user.id, oldName, newName);
            await interaction.reply({ content: `✅ Branche **${newName.toUpperCase()}** fondée !` });
        }
    }
});

async function start() {
    // On attend la connexion à la base de données avant de lancer le client
    await db.connectDB();

    if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN.trim() === "") {
        console.error("❌ ERREUR : Le DISCORD_TOKEN est manquant ou vide dans le fichier .env.");
        console.error("Vérifiez que le fichier .env est au même endroit que bot.js.");
        process.exit(1);
    }

    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        if (err.code === 'TokenInvalid') {
            console.error("❌ ERREUR : Le token Discord est invalide ou a été réinitialisé.");
            console.error("Allez sur https://discord.com/developers/applications pour générer un nouveau token.");
        } else {
            console.error("❌ Impossible de se connecter à Discord :", err);
        }
    }
}

start();