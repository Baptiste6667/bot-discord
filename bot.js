require('./keep_alive.js');
const fs = require('fs');
const path = require('path');
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
    UserSelectMenuBuilder 
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

require('dotenv').config();

const DATA_FILE = path.join(__dirname, 'familyData.json');
const PREFIX = process.env.PREFIX || ',';

const ROLES_LIST = [
    'parent', 'enfant', 'conjoint', 'frère', 'soeur', 
    'oncle', 'tante', 'cousin', 'cousine', 
    'grand-père', 'grand-mère', 'amoureux'
];

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, families: {} }, null, 2));
    }

    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
        if (!data.users) data.users = {};
        if (!data.families) data.families = {};
        return data;
    } catch (error) {
        console.error('Failed to load data file, resetting it.', error);
        const data = { users: {}, families: {} };
        saveData(data);
        return data;
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            spouse: null,
            children: [],
            parents: [],
            customLinks: {},
            familyName: null, // New field for family name
            bio: "",
            gender: null // masculin, féminin, autre
        };
    }
    return data.users[userId];
}

// Clears all family links for a given user
function clearUserFamilyLinks(data, userId) {
    const userData = ensureUser(data, userId);
    // If the user was part of a family, remove them from that family's members list
    if (userData.familyName && data.families[userData.familyName]) {
        data.families[userData.familyName].members = data.families[userData.familyName].members.filter(id => id !== userId);
        // If the user was the head of the family, and the family is now empty, delete the family
        if (data.families[userData.familyName].head === userId && data.families[userData.familyName].members.length === 0) {
            delete data.families[userData.familyName];
        } else if (data.families[userData.familyName].head === userId && data.families[userData.familyName].members.length > 0) {
            const family = data.families[userData.familyName];
            // Logique de délégation : on cherche les membres au niveau générationnel le plus haut (sans parents dans la famille)
            const potentialHeads = family.members.filter(mId => {
                const mData = data.users[mId];
                return !mData.parents.some(pId => family.members.includes(pId));
            });

            if (potentialHeads.length > 0) {
                // S'il y a plusieurs membres au même niveau (ex: Grand-Père et Grand-Mère), le hasard s'y joue
                family.head = potentialHeads[Math.floor(Math.random() * potentialHeads.length)];
            } else {
                // Fallback si la hiérarchie est circulaire ou incomplète
                family.head = family.members[Math.floor(Math.random() * family.members.length)];
            }
        }
    }
    userData.spouse = null;
    userData.children = [];
    userData.parents = [];
    userData.customLinks = {};
    userData.familyName = null; // Also clear family name
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

// --- Visual Tree Generator ---
async function generateFamilyImage(client, data, userId) {
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext('2d');
    const userData = ensureUser(data, userId);
    
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(0, 0, 800, 450);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.font = 'bold 14px sans-serif';

    const drawNode = async (id, x, y, color = '#7289da') => {
        let user;
        try { user = await client.users.fetch(id); } catch (e) { }
        const name = user ? user.username : id;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x - 85, y - 25, 170, 50, 12);
        ctx.fill();

        if (user) {
            try {
                const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 64 }));
                ctx.save();
                ctx.beginPath();
                ctx.arc(x - 55, y, 20, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, x - 75, y - 20, 40, 40);
                ctx.restore();
                
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(name.substring(0, 12), x - 28, y + 5);
            } catch (err) {
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(name.substring(0, 15), x, y + 5);
            }
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(name.substring(0, 15), x, y + 5);
        }
    };

    const centerX = 400, centerY = 225;

    if (userData.spouse) {
        ctx.beginPath(); ctx.moveTo(centerX + 85, centerY); ctx.lineTo(centerX + 115, centerY); ctx.stroke();
        await drawNode(userData.spouse, centerX + 200, centerY);
    }
    for (let i = 0; i < userData.parents.length; i++) {
        const xPos = centerX - 100 + (i * 200);
        ctx.beginPath(); ctx.moveTo(centerX, centerY - 25); ctx.lineTo(xPos, 100 + 25); ctx.stroke();
        await drawNode(userData.parents[i], xPos, 100);
    }
    const children = userData.children.slice(0, 3);
    for (let i = 0; i < children.length; i++) {
        const xPos = 200 + (i * 200);
        ctx.beginPath(); ctx.moveTo(centerX, centerY + 25); ctx.lineTo(xPos, 350 - 25); ctx.stroke();
        await drawNode(children[i], xPos, 350);
    }
    await drawNode(userId, centerX, centerY, '#faa61a');

    return canvas.toBuffer();
}

// function buildFamilySection removed as we use visual tree now

function getExtendedFamily(data, userId) {
    const user = ensureUser(data, userId);
    const siblings = new Set();
    const grandparents = new Set();
    const unclesAunts = new Set();
    const cousins = new Set();

    // Siblings & Grandparents logic
    user.parents.forEach(pId => {
        const parentData = ensureUser(data, pId);
        parentData.children.forEach(cId => {
            if (cId !== userId) siblings.add(cId);
        });
        parentData.parents.forEach(gpId => {
            grandparents.add(gpId);
        });
    });

    // Uncles/Aunts logic (siblings of parents)
    user.parents.forEach(pId => {
        const parentData = ensureUser(data, pId);
        parentData.parents.forEach(gpId => {
            const gpData = ensureUser(data, gpId);
            gpData.children.forEach(siblingOfParentId => {
                if (siblingOfParentId !== pId) {
                    unclesAunts.add(siblingOfParentId);
                    // Cousins (children of uncles/aunts)
                    const uaData = ensureUser(data, siblingOfParentId);
                    uaData.children.forEach(cousinId => cousins.add(cousinId));
                }
            });
        });
    });

    return { siblings, grandparents, unclesAunts, cousins };
}

// Fonction pour trouver le rôle réciproque (ex: si je suis ton frère, tu es mon frère/soeur)
function getReverseRole(role, targetData = null) {
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
        'parent': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'enfant': gender === 'féminin' ? 'mère' : (gender === 'masculin' ? 'père' : 'parent')
    };
    return mapping[role] || role;
}

// Gère la propagation du nom de famille aux descendants non mariés et sans enfants
function propagateNameChange(data, userId, oldName, newName) {
    const user = data.users[userId];
    if (!user) return;

    user.children.forEach(childId => {
        const child = data.users[childId];
        if (child && child.familyName === oldName) {
            // Logique : On ne change le nom que si l'enfant n'est pas marié et n'a pas d'enfants
            if (!child.spouse && child.children.length === 0) {
                child.familyName = newName;
                // Mise à jour du registre de famille
                if (data.families[newName] && !data.families[newName].members.includes(childId)) {
                    data.families[newName].members.push(childId);
                }
                // Remove from old family members if it was there
                if (oldName && data.families[oldName]) {
                    data.families[oldName].members = data.families[oldName].members.filter(id => id !== childId);
                }
                propagateNameChange(data, childId, oldName, newName);
            }
        }
    });
}

function areRelated(data, id1, id2) {
    if (id1 === id2) return 'soi-même';
    const u1 = ensureUser(data, id1);
    
    if (u1.customLinks && u1.customLinks[id2]) return u1.customLinks[id2];
    if (u1.spouse === id2) return 'conjoint(e)';
    if (u1.parents.includes(id2)) return 'parent';
    if (u1.children.includes(id2)) return 'enfant';

    const ext = getExtendedFamily(data, id1);
    if (ext.siblings.has(id2)) return 'frère/soeur';
    if (ext.grandparents.has(id2)) return 'grand-parent';
    if (ext.unclesAunts.has(id2)) return 'oncle/tante';
    if (ext.cousins.has(id2)) return 'cousin(e)';

    return null;
}

// Function to get all members of a family
function getFamilyMembers(data, familyName) {
    const normalizedFamilyName = familyName.toLowerCase();
    if (data.families[normalizedFamilyName]) {
        return data.families[normalizedFamilyName].members;
    }
    return [];
}

// Function to get the head of a family
function getFamilyHead(data, familyName) {
    const normalizedFamilyName = familyName.toLowerCase();
    return data.families[normalizedFamilyName] ? data.families[normalizedFamilyName].head : null;
}

// New function to merge two families
function mergeFamilies(data, inviterFamilyName, invitedFamilyName, inviterId, invitedId, role) {
    const inviterFamily = data.families[inviterFamilyName];
    const invitedFamily = data.families[invitedFamilyName];

    if (!inviterFamily || !invitedFamily) {
        console.error("Attempted to merge non-existent families.");
        return;
    }

    // Add all members of the invited family to the inviter's family
    invitedFamily.members.forEach(memberId => {
        if (!inviterFamily.members.includes(memberId)) {
            inviterFamily.members.push(memberId);
        }
        // Update each member's familyName
        const memberData = ensureUser(data, memberId);
        memberData.familyName = inviterFamilyName;
    });

    // Pont relationnel logique
    const inviter = ensureUser(data, inviterId);
    const invited = ensureUser(data, invitedId);

    if (role === 'oncle' || role === 'tante') {
        // La cible devient le frère/soeur d'un des parents de l'inviteur
        if (inviter.parents.length > 0) {
            const parentId = inviter.parents[0];
            const pData = data.users[parentId];
            if (pData && pData.parents.length > 0) {
                // On donne à l'invité les mêmes parents que le parent de l'inviteur (les grands-parents)
                invited.parents = [...pData.parents];
                pData.parents.forEach(gpId => {
                    const gpData = data.users[gpId];
                    if (gpData && !gpData.children.includes(invitedId)) gpData.children.push(invitedId);
                });
            }
        }
    } else if (role === 'frère' || role === 'soeur') {
        // La cible partage les mêmes parents que l'inviteur
        if (inviter.parents.length > 0) {
            invited.parents = [...inviter.parents];
            inviter.parents.forEach(pId => {
                const pData = data.users[pId];
                if (pData && !pData.children.includes(invitedId)) pData.children.push(invitedId);
            });
        }
    } else if (role === 'grand-père' || role === 'grand-mère') {
        // La cible devient le parent d'un des parents de l'inviteur
        if (inviter.parents.length > 0) {
            const parentId = inviter.parents[0];
            const pData = data.users[parentId];
            if (pData && !pData.parents.includes(invitedId)) pData.parents.push(invitedId);
            if (invited && !invited.children.includes(parentId)) invited.children.push(parentId);
        }
    }

    // Remove the invited family
    delete data.families[invitedFamilyName];
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
// --- Logique de modification des liens ---
function executeLinkChange(data, id1, id2, role, action) {
    const d1 = ensureUser(data, id1);
    const d2 = ensureUser(data, id2);

    // Nettoyage systématique des anciens liens entre ces deux personnes
    if (d1.spouse === id2) { d1.spouse = null; d2.spouse = null; }
    d1.children = d1.children.filter(id => id !== id2);
    d2.parents = d2.parents.filter(id => id !== id1);
    d1.parents = d1.parents.filter(id => id !== id2);
    d2.children = d2.children.filter(id => id !== id1);

    // Ensure customLinks exist before trying to delete
    if (d1.customLinks && d1.customLinks[id2]) {
        delete d1.customLinks[id2];
    }
    if (d2.customLinks && d2.customLinks[id1]) {
        delete d2.customLinks[id1];
    }

    if (action === 'remove') return;

    if (role === 'conjoint') {
        d1.spouse = id2; d2.spouse = id1;
    } else if (role === 'parent') {
        if (!d1.parents.includes(id2)) d1.parents.push(id2);
        if (!d2.children.includes(id1)) d2.children.push(id1);
    } else if (role === 'enfant') {
        if (!d1.children.includes(id2)) d1.children.push(id2);
        if (!d2.parents.includes(id1)) d2.parents.push(id1);
    } else {
        d1.customLinks[id2] = role;
        d2.customLinks[id1] = getReverseRole(role, d1);
    }
}

async function startFamilyVote(interaction, author, target, role, action, data) {
    const voteEmbed = new EmbedBuilder()
        .setTitle("🗳️ Vote de la Communauté")
        .setColor("#f1c40f")
        .setDescription(`**${author.username}** demande :\n**Action :** ${action === 'remove' ? 'Exclure' : 'Modifier'}\n**Cible :** ${target}\n**Nouveau Rôle :** ${role}\n\nL'action sera appliquée si le **OUI** l'emporte (60s).`)
        .setFooter({ text: "La majorité décide du sort de la famille." });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_yes').setLabel('OUI (0)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('v_no').setLabel('NON (0)').setStyle(ButtonStyle.Danger)
    );

    const voteMsg = await interaction.update({ embeds: [voteEmbed], components: [row], content: null });
    let votesYes = new Set(), votesNo = new Set();

    const collector = voteMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

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
                executeLinkChange(data, author.id, target.id, role, 'remove');
                saveData(data);
                await interaction.editReply({ content: `✅ **Vote validé !** Lien rompu avec ${target}.`, embeds: [], components: [] });
            } else {
                await sendInvitation(interaction, author, target, role, action, data, true);
            }
        } else {
            await interaction.editReply({ content: `❌ **Vote rejeté.** L'action a été annulée.`, embeds: [], components: [] });
        }
    });
}

async function sendInvitation(interaction, author, target, role, action, data, fromVote = false) {
    const authorData = ensureUser(data, author.id);
    const targetData = ensureUser(data, target.id);

    let inviteEmbed = new EmbedBuilder()
        .setTitle("📩 Invitation Familiale")
        .setColor("#FFD700")
        .setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n${fromVote ? "*(Approuvé par vote)*" : ""}`)
        .setFooter({ text: "Acceptez-vous de rejoindre cette famille ?" });

    let row;
    if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName) {
        inviteEmbed.setDescription(`${target}, **${author.username}** souhaite vous lier en tant que **${role}**.\n\nVous avez déjà une famille (**${targetData.familyName.toUpperCase()}**). Voulez-vous fusionner vos lignées ou quitter la vôtre ?`);
        row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter & Quitter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_merge').setLabel('Fusionner').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    } else {
        row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    }

    const method = interaction.replied ? 'editReply' : 'reply';
    const msg = await interaction[method]({ content: `${target}`, embeds: [inviteEmbed], components: [row] });

    const collector = (msg || await interaction.fetchReply()).createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== target.id) return i.reply({ content: "Ce n'est pas pour vous.", ephemeral: true });

        if (i.customId === 'i_ok') {
            if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName) {
                clearUserFamilyLinks(data, target.id);
            }
            executeLinkChange(data, author.id, target.id, role, action);
            if (authorData.familyName) {
                targetData.familyName = authorData.familyName;
                if (!data.families[authorData.familyName].members.includes(target.id)) {
                    data.families[authorData.familyName].members.push(target.id);
                }
            }
            saveData(data);
            await i.update({ content: `🎊 Félicitations ! ${target} est maintenant le/la **${role}** de ${author} !`, embeds: [], components: [] });
        } else if (i.customId === 'i_merge') {
            mergeFamilies(data, authorData.familyName, targetData.familyName, author.id, target.id, role);
            executeLinkChange(data, author.id, target.id, role, action);
            saveData(data);
            await i.update({ content: `🤝 Les familles ont fusionné ! ${target} est maintenant le/la **${role}** de ${author} !`, embeds: [], components: [] });
        } else {
            await i.update({ content: `😔 ${target} a refusé.`, embeds: [], components: [] });
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
    const data = loadData();
    const authorId = message.author.id;
    const authorData = ensureUser(data, authorId);

    const target = message.mentions.users.first();
    let response = null;

    switch (command) {
        case 'adminfamily':
        case 'family': {
            const isAdminCmd = command === 'adminfamily';
            if (isAdminCmd && !message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply("❌ Admin uniquement.");

            if (args.length > 0 && !isAdminCmd) { // Check for family name argument for !family <FamilyName>
                await message.channel.sendTyping();
                const inputName = args.join(' ').toLowerCase();
                
                let targetId = target ? target.id : null;
                let title = `Arbre de ${target ? target.username : inputName}`;

                // Si ce n'est pas une mention, on cherche par nom de famille
                if (!targetId && data.families[inputName]) {
                    targetId = data.families[inputName].head;
                    title = `Arbre de la famille ${inputName.toUpperCase()}`;
                } else if (!targetId) {
                    return message.reply(`❌ La famille ou l'utilisateur "${inputName}" est introuvable.`);
                }

                try {
                    const buffer = await generateFamilyImage(client, data, targetId);
                    const attachment = new AttachmentBuilder(buffer, { name: 'family-tree.png' });
                    const ext = getExtendedFamily(data, targetId);
                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setImage('attachment://family-tree.png')
                        .addFields(
                            { name: 'Fratrie', value: Array.from(ext.siblings).map(formatMention).join(', ') || 'Aucun', inline: true },
                            { name: 'Cousins', value: Array.from(ext.cousins).map(formatMention).join(', ') || 'Aucun', inline: true }
                        );
                    return message.reply({ embeds: [embed], files: [attachment] });
                } catch (err) {
                    return message.reply("❌ Erreur lors de la génération de l'arbre.");
                }
            }

            const dashboard = new EmbedBuilder()
                .setTitle(isAdminCmd ? "🛠️ Administration Family" : "🏠 Dashboard Familial")
                .setColor(isAdminCmd ? "#e74c3c" : "#5865F2")
                .setDescription(isAdminCmd ? "Modifiez n'importe quel lien entre deux membres." : "Gérez vos relations via le menu ci-dessous.");

            const actionMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('a').setPlaceholder('Action...')
                    .addOptions([
                        { label: 'Ajouter un membre', value: 'add', description: 'Invitation directe' },
                        { label: 'Modifier la place', value: 'modify', description: 'Nécessite un vote' },
                        { label: 'Enlever un membre', value: 'remove', description: 'Nécessite un vote' }
                    ].concat(isAdminCmd ? [{ label: 'Réinitialiser', value: 'clear', description: 'Effacer tout l\'arbre' }] : []))
            );

            const msg = await message.reply({ embeds: [dashboard], components: [actionMenu] });
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 60000 });

            collector.on('collect', async (i) => {
                const action = i.values[0];
                const userSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('u1').setPlaceholder(isAdminCmd ? 'Membre 1...' : 'Cible...'));
                await i.update({ content: `Action: **${action}**. Sélectionnez le membre :`, components: [userSelect], embeds: [] });

                const u1Coll = msg.createMessageComponentCollector({ componentType: ComponentType.UserSelect, time: 60000 });
                u1Coll.on('collect', async (ui) => {
                    const s1Id = ui.values[0];
                    const s1User = await client.users.fetch(s1Id);
                    if (action === 'clear') {
                        data.users[s1Id] = { spouse: null, children: [], parents: [], customLinks: {} };
                        saveData(data); return ui.update({ content: `✅ Arbre de ${s1User} effacé.`, components: [] });
                    }

                    let s2Id = authorId;
                    if (isAdminCmd) {
                        const u2Select = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('u2').setPlaceholder('Membre 2...'));
                        await ui.update({ content: `Lien pour ${s1User}. Qui est la 2ème personne ?`, components: [u2Select] });
                        const ui2 = await msg.awaitMessageComponent({ componentType: ComponentType.UserSelect, time: 30000 });
                        s2Id = ui2.values[0];
                        await ui2.update({ content: `Lien entre <@${s1Id}> et <@${s2Id}>. Quel rôle ?`, components: [] });
                    }

                    const roleMenu = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('r').setPlaceholder('Rôle...')
                            .addOptions(ROLES_LIST.map(r => ({ label: r, value: r })))
                    );
                    // Use ui.editReply if it's an interaction, or msg.edit if it's the original message
                    await ui.editReply({ content: `Sélectionnez le rôle :`, components: [roleMenu] });

                    const rColl = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
                    rColl.on('collect', async (ri) => {
                        const role = ri.values[0];
                        if (isAdminCmd) {
                            executeLinkChange(data, s2Id, s1Id, role, action);
                            saveData(data);
                            return ri.update({ content: `✅ Lien **${role}** établi entre <@${s2Id}> et <@${s1Id}>.`, components: [] });
                        } else {
                            if (action === 'add') await sendInvitation(ri, message.author, s1User, role, action, data);
                            else await startFamilyVote(ri, message.author, s1User, role, action, data);
                        }
                    });
                });
            });
            return;
        }

        case 'divorce': {
            if (!authorData.spouse) return message.reply('Tu n\'es pas marié(e).');
            const spouseId = authorData.spouse;
            executeLinkChange(data, authorId, spouseId, null, 'remove');
            saveData(data);
            return message.reply(`💔 Tu as divorcé de ${formatMention(spouseId)}.`);
        }

        case 'family-create': {
            const familyName = args.join(' ').toLowerCase();
            if (!familyName) {
                return message.reply('Veuillez spécifier un nom pour votre famille. Exemple: `!family-create Les Dupont`');
            }
            if (familyName.length < 3 || familyName.length > 20) {
                return message.reply('Le nom de famille doit contenir entre 3 et 20 caractères.');
            }
            if (data.families[familyName]) {
                return message.reply(`❌ La famille "${familyName}" existe déjà.`);
            }
            if (authorData.familyName) {
                return message.reply(`❌ Vous faites déjà partie de la famille "${authorData.familyName}". Quittez-la d'abord pour en créer une nouvelle.`);
            }

            data.families[familyName] = {
                head: authorId,
                members: [authorId]
            };
            authorData.familyName = familyName;
            saveData(data);
            return message.reply(`🎉 Félicitations ! La famille "${familyName.charAt(0).toUpperCase() + familyName.slice(1)}" a été créée et vous en êtes le chef !`);
        }

        case 'family-delete': {
            const familyName = args.join(' ').toLowerCase();
            if (!familyName) {
                return message.reply('Veuillez spécifier le nom de la famille à supprimer. Exemple: `!family-delete Les Dupont`');
            }
            if (!data.families[familyName]) {
                return message.reply(`❌ La famille "${familyName}" n'existe pas.`);
            }

            const isHead = data.families[familyName].head === authorId;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isHead && !isAdmin) {
                return message.reply('❌ Seul le chef de famille ou un administrateur peut supprimer une famille.');
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirmation de Suppression de Famille')
                .setColor('#e74c3c')
                .setDescription(`Êtes-vous sûr de vouloir supprimer la famille **${familyName.charAt(0).toUpperCase() + familyName.slice(1)}** ?\n\n**ATTENTION :** Cette action est irréversible et supprimera tous les liens familiaux pour ses membres.`);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('delete_family_yes').setLabel('Oui, supprimer').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('delete_family_no').setLabel('Non, annuler').setStyle(ButtonStyle.Secondary)
            );

            const confirmationMsg = await message.reply({ embeds: [confirmEmbed], components: [confirmRow] });

            const collector = confirmationMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== authorId) {
                    return i.reply({ content: "Seul l'initiateur de la commande peut confirmer.", ephemeral: true });
                }

                if (i.customId === 'delete_family_yes') {
                    const membersToClear = [...data.families[familyName].members]; // Copy array before modification
                    for (const memberId of membersToClear) {
                        clearUserFamilyLinks(data, memberId);
                    }
                    delete data.families[familyName];
                    saveData(data);
                    await i.update({
                        content: `✅ La famille **${familyName.charAt(0).toUpperCase() + familyName.slice(1)}** a été supprimée. Tous les liens familiaux de ses membres ont été réinitialisés.`,
                        embeds: [],
                        components: []
                    });
                } else {
                    await i.update({
                        content: `Opération annulée. La famille **${familyName.charAt(0).toUpperCase() + familyName.slice(1)}** n'a pas été supprimée.`,
                        embeds: [],
                        components: []
                    });
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await confirmationMsg.edit({
                        content: 'Confirmation expirée. La suppression de la famille a été annulée.',
                        embeds: [],
                        components: []
                    });
                }
            });
            return;
        }

        case 'account': {
            await message.channel.sendTyping();

            if (!process.env.UNBELIEVABOAT_TOKEN) {
                return message.reply("⚠️ Le token UnbelievaBoat n'est pas configuré dans le fichier .env.");
            }

            // Collecte des membres de la famille (Auteur, Époux, et Enfants) pour la réflexion bancaire
            const members = [authorId];
            if (authorData.spouse) members.push(authorData.spouse);
            authorData.children.forEach(id => members.push(id));

            const results = await Promise.all(members.map(id => getUBUser(message.guild.id, id)));
            const total = results.reduce((acc, res) => acc + (res ? res.cash : 0), 0);

            const embed = new EmbedBuilder()
                .setTitle('🏦 Banque Familiale (Réflexion)')
                .setColor('#f1c40f')
                .setDescription(`Ce solde est le reflet de la richesse cumulée de votre famille (Époux & Enfants) sur UnbelievaBoat.`)
                .addFields(
                    { name: 'Richesse Totale de la Famille', value: `💰 **${total.toLocaleString()}** crédits`, inline: false }
                )
                .setFooter({ text: 'Les soldes sont synchronisés en temps réel avec UnbelievaBoat' });
            
            // Détails individuels
            const authorCash = results[0] ? results[0].cash : 0;
            embed.addFields({ name: 'Votre portefeuille', value: `${authorCash.toLocaleString()} 💰`, inline: true });

            if (authorData.spouse) {
                const spouseCash = results[1] ? results[1].cash : 0;
                embed.addFields({ name: 'Portefeuille conjoint', value: `${spouseCash} crédits`, inline: true });
            }

            if (authorData.children.length > 0) {
                const childrenCash = results.slice(authorData.spouse ? 2 : 1).reduce((acc, res) => acc + (res ? res.cash : 0), 0);
                embed.addFields({ name: 'Enfants (cumulé)', value: `${childrenCash} crédits`, inline: true });
            }

            await message.reply({ embeds: [embed] });
            return;
        }

        case 'familytop': {
            await message.channel.sendTyping();
            const familyWealths = [];
            const processedFamilyUnits = new Set();

            for (const userId of Object.keys(data.users)) {
                const userData = ensureUser(data, userId);
                let canonicalId = userData.spouse ? [userId, userData.spouse].sort()[0] : userId;
                if (processedFamilyUnits.has(canonicalId)) continue;
                processedFamilyUnits.add(canonicalId);

                const membersToFetch = new Set([userId]);
                if (userData.spouse) membersToFetch.add(userData.spouse);
                userData.children.forEach(childId => membersToFetch.add(childId));

                const results = await Promise.all(Array.from(membersToFetch).map(id => getUBUser(message.guild.id, id)));
                const totalFamilyCash = results.reduce((acc, res) => acc + (res ? res.cash : 0), 0);
                familyWealths.push({ headId: userId, totalWealth: totalFamilyCash });
            }

            familyWealths.sort((a, b) => b.totalWealth - a.totalWealth);
            const topEmbed = new EmbedBuilder()
                .setTitle('🏆 Top des Familles les plus Riches')
                .setColor('#ffd700')
                .setDescription('Classement des familles par richesse cumulée (UnbelievaBoat).')
                .setFooter({ text: 'Richesse synchronisée' });

            familyWealths.slice(0, 10).forEach((family, index) => {
                topEmbed.addFields({ name: `${index + 1}. ${formatMention(family.headId)}`, value: `💰 ${family.totalWealth.toLocaleString()} crédits`, inline: false });
            });
            return message.reply({ embeds: [topEmbed] });
        }

        case 'help': {
            const h = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📚 Guide Complet de la Dynastie')
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(`Gérez vos lignées, votre réputation et votre fortune !\nLe préfixe actuel est : \`${PREFIX}\` (Les arguments entre \`< >\` sont obligatoires, \`[ ]\` sont optionnels).`)
                .addFields(
                    { name: '🏠 Dynastie & Arbre', value: `\`${PREFIX}family\` : Ouvre le panneau interactif (Ajouter/Modifier/Exclure).\n\`${PREFIX}family <Nom_ou_@User>\` : Affiche l'image de l'arbre généalogique.\n\`${PREFIX}family-create <Nom>\` : Fonde une nouvelle lignée dont vous êtes le chef.\n\`${PREFIX}family-delete <Nom>\` : Dissout définitivement votre famille (Chef uniquement).` },
                    { name: 'ℹ️ Profil & Personnalisation', value: `\`${PREFIX}info [@User]\` : Fiche détaillée (Genre, Bio).\n\`${PREFIX}modif-info genre <masculin/féminin/autre>\` : Définit votre genre.\n\`${PREFIX}modif-info nom <Nouveau_Nom>\` : Change le nom de votre branche (Parent/Chef).\n\`${PREFIX}modif-info nom-conjoint\` : Adopte le nom de votre mari/femme.` },
                    { name: '💰 Économie & Fortune', value: `\`${PREFIX}account\` : Solde cumulé du foyer (Conjoint & Enfants) via UnbelievaBoat.\n\`${PREFIX}familytop\` : Classement des familles les plus riches du serveur.` },
                    { name: '🤝 Social & Rupture', value: `\`${PREFIX}divorce\` : Met fin à votre mariage actuel.\n\`${PREFIX}hug\`, \`${PREFIX}kiss\`, \`${PREFIX}pat\`, \`${PREFIX}slap\`, \`${PREFIX}poke\` : Interactions animées avec un membre ciblé.` }
                )
                .setFooter({ text: 'Note : Les modifications de liens ou exclusions nécessitent un vote communautaire.' });
            return message.reply({ embeds: [h] });
        }

        case 'stop': {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
            await message.reply("Arrêt du bot...");
            process.exit(0);
        }

        case 'info': {
            const targetUser = target || message.author;
            const tData = ensureUser(data, targetUser.id);
            const ext = getExtendedFamily(data, targetUser.id);
            
            const isHead = tData.familyName && data.families[tData.familyName]?.head === targetUser.id;
            const familyRole = isHead ? "Chef de Famille" : (tData.familyName ? "Membre" : "Sans Famille");

            const embed = new EmbedBuilder()
                .setTitle(`Profil Familial - ${targetUser.username}`)
                .setColor('#3498db')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '🏷️ Nom de Famille', value: tData.familyName ? tData.familyName.toUpperCase() : 'Aucun', inline: true },
                    { name: '🎭 Rang', value: familyRole, inline: true },
                    { name: '👤 Genre', value: tData.gender || 'Non défini', inline: true },
                    { name: '📝 Bio', value: tData.bio || 'Aucune bio définie.', inline: false },
                    { name: '💍 Conjoint(e)', value: tData.spouse ? formatMention(tData.spouse) : 'Célibataire', inline: true },
                    { name: '👨‍👩‍👦 Parents', value: tData.parents.map(formatMention).join(', ') || 'Inconnus', inline: true },
                    { name: '👶 Enfants', value: tData.children.map(formatMention).join(', ') || 'Aucun', inline: true }
                );
            return message.reply({ embeds: [embed] });
        }

        case 'modif-info': {
            const subCommand = args[0]?.toLowerCase();
            const value = args.slice(1).join(' ');

            if (subCommand === 'bio') {
                if (!value) return message.reply(`Usage: \`${PREFIX}modif-info bio <votre texte>\``);
                authorData.bio = value;
                saveData(data);
                return message.reply("✅ Votre bio a été mise à jour !");
            } else if (subCommand === 'genre') {
                const validGenders = ['masculin', 'féminin', 'autre'];
                if (!validGenders.includes(value.toLowerCase())) return message.reply("Genre invalide (choix : masculin, féminin, autre).");
                authorData.gender = value.toLowerCase();
                saveData(data);
                return message.reply(`✅ Genre défini sur **${authorData.gender}**.`);
            } else if (subCommand === 'nom-conjoint') {
                if (!authorData.spouse) return message.reply("❌ Vous devez être marié(e) pour prendre le nom de votre conjoint.");
                const spouseData = data.users[authorData.spouse];
                if (!spouseData.familyName) return message.reply("❌ Votre conjoint n'a pas de nom de famille défini.");
                
                authorData.familyName = spouseData.familyName;
                if (!data.families[authorData.familyName].members.includes(authorId)) {
                    data.families[authorData.familyName].members.push(authorId);
                }
                saveData(data);
                return message.reply(`💍 Vous portez désormais le nom de votre conjoint : **${authorData.familyName.toUpperCase()}**.`);
            } else if (subCommand === 'nom') {
                const oldName = authorData.familyName;
                const isHead = oldName && data.families[oldName]?.head === authorId;
                const isParent = authorData.children.length > 0;

                if (!isHead && !isParent) {
                    return message.reply("❌ Seul le chef de famille ou un parent peut modifier le nom de la lignée.");
                }

                const newName = value.toLowerCase().trim();
                if (!newName) return message.reply(`Usage: \`${PREFIX}modif-info nom <nouveau nom>\``);
                if (data.families[newName]) return message.reply("❌ Ce nom de famille est déjà utilisé.");

                if (isHead) {
                    // Renommer toute la dynastie enregistrée
                    data.families[newName] = data.families[oldName];
                    delete data.families[oldName];
                    data.families[newName].members.forEach(mId => {
                        if (data.users[mId]) data.users[mId].familyName = newName;
                    });
                } else {
                    // Changement de branche (Parent qui n'est pas chef)
                    authorData.familyName = newName;
                    data.families[newName] = { head: authorId, members: [authorId] };
                    // Propagation logique aux enfants dépendants
                    propagateNameChange(data, authorId, oldName, newName);
                }

                saveData(data);
                return message.reply(`✅ Changement de nom effectué : **${newName.toUpperCase()}** (appliqué aux descendants dépendants).`);
            } else {
                return message.reply(`Sous-commandes : \`bio\`, \`genre\`, \`nom\`, \`nom-conjoint\``);
            }
        }

        case 'hug': {
            if (!target) return message.reply('Qui veux-tu câliner ?');
            const rel = areRelated(data, authorId, target.id);
            let desc = `${formatMention(authorId)} fait un gros câlin à ${formatMention(target.id)} !`;
            if (rel && rel !== 'soi-même') desc += ` ❤️ Les câlins entre **${rel}s** sont les meilleurs !`;
            if (rel === 'soi-même') desc = `Tu te fais un câlin à toi-même ? C'est mignon mais un peu solitaire !`;

            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
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
                .setColor('#FF0000')
                .setDescription(`💋 ${formatMention(authorId)} embrasse amoureusement ${formatMention(target.id)} !`)
                .setImage('https://media.giphy.com/media/G3va31WfEKhS8/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'pat': {
            if (!target) return message.reply('Qui veux-tu tapoter ?');
            const rel = areRelated(data, authorId, target.id);
            let desc = `${formatMention(authorId)} tapote la tête de ${formatMention(target.id)}.`;
            if (['enfant', 'parent', 'frère/soeur'].includes(rel)) {
                desc = `😊 ${formatMention(authorId)} tapote affectueusement la tête de son **${rel}**, ${formatMention(target.id)}.`;
            }
            const embed = new EmbedBuilder()
                .setColor('#87CEEB')
                .setDescription(desc)
                .setImage('https://media.giphy.com/media/ARSp9T7wwxNcs/giphy.gif');
            return message.reply({ embeds: [embed] });
        }

        case 'slap': {
            if (!target) return message.reply('Qui veux-tu gifler ?');
            const rel = areRelated(data, authorId, target.id);
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
            const rel = areRelated(data, authorId, target.id);
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

if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN.trim() === "") {
    console.error("❌ ERREUR : Le DISCORD_TOKEN est manquant ou vide dans le fichier .env.");
    console.error("Vérifiez que le fichier .env est au même endroit que bot.js.");
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
    if (err.code === 'TokenInvalid') {
        console.error("❌ ERREUR : Le token Discord est invalide ou a été réinitialisé.");
        console.error("Allez sur https://discord.com/developers/applications pour générer un nouveau token.");
    } else {
        console.error("❌ Impossible de se connecter à Discord :");
        console.error(err);
    }
});