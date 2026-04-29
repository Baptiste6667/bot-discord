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
    TextInputStyle
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

require('dotenv').config();

const PREFIX = process.env.PREFIX || ',';

const ROLES_LIST = [
    'parent', 'enfant', 'frère', 'soeur', 
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

// --- Visual Tree Generator ---
async function generateFamilyImage(client, userId) {
    const canvas = createCanvas(800, 450); // Canvas size
    const ctx = canvas.getContext('2d');
    const userData = await db.getOrCreateUser(userId); // Fetch user data from DB
    
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

// This function now needs to be async as it fetches data from DB
async function getExtendedFamily(userId) {
    const user = await db.getOrCreateUser(userId);
    const siblings = new Set();
    const grandparents = new Set();
    const unclesAunts = new Set();
    const cousins = new Set();

    // Siblings & Grandparents logic
    for (const pId of user.parents) {
        const parentData = await db.getOrCreateUser(pId);
        for (const cId of parentData.children) {
            if (cId !== userId) siblings.add(cId);
        }
        for (const gpId of parentData.parents) {
            grandparents.add(gpId);
        }
    }

    // Uncles/Aunts & Cousins logic
    for (const pId of user.parents) {
        const parentData = await db.getOrCreateUser(pId);
        for (const gpId of parentData.parents) {
            const gpData = await db.getOrCreateUser(gpId);
            for (const siblingOfParentId of gpData.children) {
                if (siblingOfParentId !== pId) {
                    unclesAunts.add(siblingOfParentId);
                    // Cousins (children of uncles/aunts)
                    const uaData = await db.getOrCreateUser(siblingOfParentId);
                    for (const cousinId of uaData.children) {
                        cousins.add(cousinId);
                    }
                }
            }
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
        'parent': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'enfant': gender === 'féminin' ? 'mère' : (gender === 'masculin' ? 'père' : 'parent')
    };
    return mapping[role] || role;
}

// Gère la propagation du nom de famille aux descendants non mariés et sans enfants
async function propagateNameChange(userId, oldName, newName) { // No longer needs `data`
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
    if (u1.parents.includes(id2)) return 'parent';
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
async function mergeFamilies(inviterFamilyName, invitedFamilyName, inviterId, invitedId, role) { // Made async
    const inviterFamily = await db.getFamily(inviterFamilyName);
    const invitedFamily = await db.getFamily(invitedFamilyName);

    if (!inviterFamily || !invitedFamily) {
        console.error("Attempted to merge non-existent families.");
        return;
    }

    // Add all members of the invited family to the inviter's family
    for (const memberId of invitedFamily.members) {
        if (!inviterFamily.members.includes(memberId)) {
            inviterFamily.members.push(memberId);
        }
        // Update each member's familyName
        await db.updateUser(memberId, { familyName: inviterFamilyName });
    }
    await db.updateFamily(inviterFamilyName, { members: inviterFamily.members });

    // Pont relationnel logique
    const inviter = await db.getOrCreateUser(inviterId);
    const invited = await db.getOrCreateUser(invitedId);

    if (role === 'oncle' || role === 'tante') {
        // La cible devient le frère/soeur d'un des parents de l'inviteur
        if (inviter.parents.length > 0) {
            const parentId = inviter.parents[0];
            const pData = await db.getOrCreateUser(parentId);
            if (pData && pData.parents.length > 0) {
                // On donne à l'invité les mêmes parents que le parent de l'inviteur (les grands-parents)
                await db.updateUser(invitedId, { parents: [...pData.parents] });
                for (const gpId of pData.parents) {
                    const gpData = await db.getOrCreateUser(gpId);
                    if (gpData && !gpData.children.includes(invitedId)) {
                        gpData.children.push(invitedId);
                        await db.updateUser(gpId, { children: gpData.children });
                    }
                }
            }
        }
    } else if (role === 'frère' || role === 'soeur') {
        // La cible partage les mêmes parents que l'inviteur
        if (inviter.parents.length > 0) {
            await db.updateUser(invitedId, { parents: [...inviter.parents] });
            for (const pId of inviter.parents) {
                const pData = await db.getOrCreateUser(pId);
                if (pData && !pData.children.includes(invitedId)) {
                    pData.children.push(invitedId);
                    await db.updateUser(pId, { children: pData.children });
                }
            }
        }
    } else if (role === 'grand-père' || role === 'grand-mère') {
        // La cible devient le parent d'un des parents de l'inviteur
        if (inviter.parents.length > 0) {
            const parentId = inviter.parents[0];
            const pData = await db.getOrCreateUser(parentId);
            if (pData && !pData.parents.includes(invitedId)) {
                pData.parents.push(invitedId);
                await db.updateUser(parentId, { parents: pData.parents });
            }
            if (invited && !invited.children.includes(parentId)) {
                invited.children.push(parentId);
                await db.updateUser(invitedId, { children: invited.children });
            }
        }
    }

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
async function executeLinkChange(id1, id2, role, action) { // No longer needs `data`
    const d1 = await db.getOrCreateUser(id1);
    const d2 = await db.getOrCreateUser(id2);

    // Nettoyage systématique des anciens liens entre ces deux personnes
    let d1Update = {};
    let d2Update = {};

    if (d1.spouse === id2) { d1.spouse = null; d2.spouse = null; }
    d1Update.children = d1.children.filter(id => id !== id2);
    d2Update.parents = d2.parents.filter(id => id !== id1);
    d1Update.parents = d1.parents.filter(id => id !== id2);
    d2Update.children = d2.children.filter(id => id !== id1);

    // Ensure customLinks exist before trying to delete
    if (d1.customLinks && d1.customLinks[id2]) {
        const newCustomLinks = { ...d1.customLinks };
        delete newCustomLinks[id2];
        d1Update.customLinks = newCustomLinks;
    }
    if (d2.customLinks && d2.customLinks[id1]) {
        const newCustomLinks = { ...d2.customLinks };
        delete newCustomLinks[id1];
        d2Update.customLinks = newCustomLinks;
    }

    if (action === 'remove') {
        await db.updateUser(id1, d1Update);
        await db.updateUser(id2, d2Update);
        return;
    }

    if (role === 'conjoint') {
        d1Update.spouse = id2; d2Update.spouse = id1;
    } else if (role === 'parent') {
        if (!d1Update.parents.includes(id2)) d1Update.parents.push(id2);
        if (!d2Update.children.includes(id1)) d2Update.children.push(id1);
    } else if (role === 'enfant') {
        if (!d1Update.children.includes(id2)) d1Update.children.push(id2);
        if (!d2Update.parents.includes(id1)) d2Update.parents.push(id1);
    } else {
        d1Update.customLinks = { ...(d1Update.customLinks || d1.customLinks), [id2]: role };
        d2Update.customLinks = { ...(d2Update.customLinks || d2.customLinks), [id1]: await getReverseRole(role, d1) };
    }

    await db.updateUser(id1, d1Update);
    await db.updateUser(id2, d2Update);
}

async function startFamilyVote(interaction, author, target, role, action) {
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
    if (interaction.replied || interaction.deferred) {
        voteMsg = await interaction.editReply({ embeds: [voteEmbed], components: [row], content: null });
    } else {
        voteMsg = await interaction.update({ embeds: [voteEmbed], components: [row], content: null });
    }
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
                await executeLinkChange(author.id, target.id, role, 'remove');
                await interaction.editReply({ content: `✅ **Vote validé !** Lien rompu avec ${target}.`, embeds: [], components: [] });
            } else {
                await sendInvitation(interaction, author, target, role, action, true);
            }
        } else {
            await interaction.editReply({ content: `❌ **Vote rejeté.** L'action a été annulée.`, embeds: [], components: [] });
        }
    });
}

async function sendInvitation(interaction, author, target, role, action, fromVote = false) {
    const authorData = await db.getOrCreateUser(author.id);
    const targetData = await db.getOrCreateUser(target.id);

    let inviteEmbed = new EmbedBuilder()
        .setTitle("📩 Invitation Familiale")
        .setColor("#FFD700")
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
        // If role is 'conjoint', only offer accept/refuse. No merge option.
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
                await clearUserFamilyLinks(target.id);
            }
            await executeLinkChange(author.id, target.id, role, action);
            if (authorData.familyName) {
                const family = await db.getFamily(authorData.familyName);
                if (family && !family.members.includes(target.id)) {
                    family.members.push(target.id);
                    await db.updateFamily(authorData.familyName, { members: family.members });
                }
                await db.updateUser(target.id, { familyName: authorData.familyName });
            }
            await i.update({ content: `🎊 Félicitations ! ${target} est maintenant le/la **${role}** de ${author} !`, embeds: [], components: [] });
        } else if (i.customId === 'i_merge') {
            await mergeFamilies(authorData.familyName, targetData.familyName, author.id, target.id, role);
            await executeLinkChange(author.id, target.id, role, action);
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
    const authorId = message.author.id;
    const authorData = await db.getOrCreateUser(authorId);

    const target = message.mentions.users.first();
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
                new StringSelectMenuBuilder().setCustomId('admin_action').setPlaceholder('Action...')
                    .addOptions([
                        { label: 'Ajouter/Modifier un membre', value: 'add' },
                        { label: 'Supprimer un membre', value: 'remove' },
                        { label: 'Réinitialiser la famille', value: 'clear' },
                        { label: 'Annuler', value: 'cancel' }
                    ])
            );

            const msg = await message.reply({ embeds: [embed], components: [row] });
            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });

            coll.on('collect', async (i) => {
                if (i.values[0] === 'cancel') return coll.stop();
                if (i.values[0] === 'clear') {
                    for (const mId of family.members) await db.updateUser(mId, { familyName: null, spouse: null, children: [], parents: [] });
                    await db.deleteFamily(familyName);
                    return i.update({ content: `✅ Famille ${familyName} supprimée.`, components: [], embeds: [] });
                }

                const action = i.values[0];
                const uSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('target').setPlaceholder('Choisir le membre...'));
                await i.update({ content: `Action: ${action}. Sélectionnez le membre.`, components: [uSelect] });

                try {
                    const ui = await msg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId, 
                        componentType: ComponentType.UserSelect, 
                        time: 30000 
                    });

                    const targetId = ui.values[0];
                    if (action === 'remove') {
                        await executeLinkChange(family.head, targetId, null, 'remove');
                        return ui.update({ content: `✅ Membre retiré de la famille.`, components: [] });
                    }

                    const rMenu = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('role').setPlaceholder('Rôle...')
                            .addOptions(ROLES_LIST.map(r => ({ label: r, value: r })))
                    );
                    await ui.update({ content: `Attribuer un rôle à <@${targetId}> :`, components: [rMenu] });

                    try {
                        const ri = await msg.awaitMessageComponent({ 
                            filter: subI => subI.user.id === authorId, 
                            componentType: ComponentType.StringSelect, 
                            time: 30000 
                        });

                        await executeLinkChange(family.head, targetId, ri.values[0], 'add');
                        await db.updateUser(targetId, { familyName: family._id });
                        if (!family.members.includes(targetId)) {
                            family.members.push(targetId);
                            await db.updateFamily(family._id, { members: family.members });
                        }
                        return ri.update({ content: `✅ Rôle ${ri.values[0]} mis à jour pour <@${targetId}>.`, components: [] });
                    } catch (e) {
                        await msg.edit({ content: "Temps écoulé pour le choix du rôle.", components: [] });
                    }
                } catch (e) {
                    await msg.edit({ content: "Temps écoulé pour la sélection du membre.", components: [] });
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

                const family = await db.getFamily(inputName);
                if (!targetId && family) targetId = family.head;
                else if (!targetId) return message.reply("❌ Famille introuvable.");

                const buffer = await generateFamilyImage(client, targetId);
                const attachment = new AttachmentBuilder(buffer, { name: 'family.png' });
                const ext = await getExtendedFamily(targetId);
                const embed = new EmbedBuilder().setTitle(`Arbre de ${inputName.toUpperCase()}`).setImage('attachment://family.png')
                    .addFields({ name: 'Fratrie', value: Array.from(ext.siblings).map(formatMention).join(', ') || 'Aucun', inline: true });
                return message.reply({ embeds: [embed], files: [attachment] });
            }

            const embed = new EmbedBuilder().setTitle("🏠 Gestion de Famille").setColor("#5865F2");
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
                
                const menu = new StringSelectMenuBuilder().setCustomId('fam_action').setPlaceholder('Gérer...')
                    .addOptions([
                        { label: 'Ajouter un membre', value: 'add' },
                        { label: 'Modifier un rôle', value: 'modify' },
                        { label: 'Enlever un membre', value: 'remove' },
                        { label: 'Quitter la famille', value: 'leave' }
                    ]);
                if (isHead) menu.addOptions({ label: 'Dissoudre la famille', value: 'delete' });
                menu.addOptions({ label: 'Annuler', value: 'cancel' });
                rows.push(new ActionRowBuilder().addComponents(menu));
            }

            const msg = await message.reply({ embeds: [embed], components: rows });
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'cancel' || i.values?.[0] === 'cancel') return collector.stop();
                if (i.customId === 'create_fam') {
                    const modal = new ModalBuilder().setCustomId('modal_create_fam').setTitle('Nouvelle Famille');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fam_name').setLabel("Nom de famille").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal);
                }
                const action = i.values[0];
                if (action === 'delete') {
                    const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_del').setLabel('Confirmer').setStyle(ButtonStyle.Danger));
                    return i.update({ content: "⚠️ Dissoudre la famille ?", components: [confirm] });
                }
                if (action === 'leave') {
                    await clearUserFamilyLinks(authorId);
                    return i.update({ content: "👋 Famille quittée.", components: [], embeds: [] });
                }
                const uSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('u').setPlaceholder('Choisir...'));
                await i.update({ content: `Action : ${action}.`, components: [uSelect] });

                try {
                    const ui = await msg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId, 
                        componentType: ComponentType.UserSelect, 
                        time: 30000 
                    });

                    const targetId = ui.values[0];
                    const targetUser = client.users.cache.get(targetId) || await client.users.fetch(targetId);

                    if (action === 'remove') return startFamilyVote(ui, message.author, targetUser, 'Aucun', 'remove');

                    const rMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('r').setPlaceholder('Rôle...').addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))));
                    await ui.update({ content: `Rôle pour <@${targetUser.id}> :`, components: [rMenu] });

                    const ri = await msg.awaitMessageComponent({ 
                        filter: subI => subI.user.id === authorId, 
                        componentType: ComponentType.StringSelect, 
                        time: 30000 
                    });

                        if (action === 'add') await sendInvitation(ri, message.author, targetUser, ri.values[0], 'add');
                        else await startFamilyVote(ri, message.author, targetUser, ri.values[0], 'modify');
                } catch (e) {
                    await msg.edit({ content: "Action annulée ou temps écoulé.", components: [] });
                }
            });
            collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
            return;
        }

        case 'familytop':
        case 'account': {
            await message.channel.sendTyping();
            const showWealth = async (uId, uData) => {
                const members = [uId];
                if (uData.spouse) members.push(uData.spouse);
                uData.children.forEach(id => members.push(id));
                const results = await Promise.all(members.map(id => getUBUser(message.guild.id, id)));
                const total = results.reduce((acc, res) => acc + (res ? res.cash : 0), 0);
                return new EmbedBuilder().setTitle('🏦 Banque Familiale').setColor('#f1c40f').addFields({ name: 'Fortune Totale', value: `💰 **${total.toLocaleString()}** cr.`, inline: false });
            };
            const showTop = async () => {
                const familyWealths = [];
                const allUsers = await db.getAllUsers();
                const processed = new Set();
                for (const uId of Object.keys(allUsers)) {
                    const uData = allUsers[uId];
                    let cId = uData.spouse ? [uId, uData.spouse].sort()[0] : uId;
                    if (processed.has(cId)) continue;
                    processed.add(cId);
                    const members = [uId];
                    if (uData.spouse) members.push(uData.spouse);
                    uData.children.forEach(id => members.push(id));
                    const res = await Promise.all(members.map(id => getUBUser(message.guild.id, id)));
                    familyWealths.push({ headId: uId, total: res.reduce((acc, r) => acc + (r ? r.cash : 0), 0) });
                }
                familyWealths.sort((a, b) => b.total - a.total);
                const embed = new EmbedBuilder().setTitle('🏆 Top des Familles').setColor('#ffd700');
                familyWealths.slice(0, 10).forEach((f, i) => embed.addFields({ name: `${i + 1}. ${formatMention(f.headId)}`, value: `💰 ${f.total.toLocaleString()} cr.`, inline: false }));
                return embed;
            };

            const initialEmbed = (command === 'familytop') ? await showTop() : await showWealth(authorId, authorData);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_wealth').setLabel('Ma Fortune').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_top').setLabel('🏆 Classement').setStyle(ButtonStyle.Primary)
            );
            const msg = await message.reply({ embeds: [initialEmbed], components: [row] });
            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });
            coll.on('collect', async (i) => {
                await i.deferUpdate();
                const newEmbed = (i.customId === 'v_top') ? await showTop() : await showWealth(authorId, authorData);
                await i.editReply({ embeds: [newEmbed] });
            });
            coll.on('end', () => msg.edit({ components: [] }).catch(() => {}));
            return;
        }

        case 'help': {
            const h = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📚 Guide Complet de la Dynastie')
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(`Gérez vos lignées et votre fortune via nos dashboards interactifs !\nPréfixe : \`${PREFIX}\``)
                .addFields(
                    { name: '🏠 Famille', value: `\`${PREFIX}family\` : Dashboard personnel.\n\`${PREFIX}family <Nom>\` : Voir l'arbre.` },
                    { name: 'ℹ️ Profil', value: `\`${PREFIX}info [@User]\` : Fiche d'identité et personnalisation.` },
                    { name: '💰 Fortune', value: `\`${PREFIX}account\` : Richesse du foyer et classement.` },
                    { name: '🛡️ Admin', value: `\`${PREFIX}adminfamily <Nom>\` : Gestion de dynastie.` }
                );
            return message.reply({ embeds: [h] });
        }

        case 'stop': {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
            await message.reply("Arrêt du bot...");
            process.exit(0);
        }

        case 'info': {
            const targetUser = target || message.author;
            const userData = await db.getOrCreateUser(targetUser.id);
            const family = userData.familyName ? await db.getFamily(userData.familyName) : null;

            const buildEmbed = () => new EmbedBuilder()
                .setTitle(`Profil Familial - ${targetUser.username}`)
                .setColor('#3498db')
                .addFields(
                    { name: '🏷️ Nom de Famille', value: userData.familyName ? userData.familyName.toUpperCase() : 'Aucun', inline: true },
                    { name: '🎭 Rang', value: family?.head === targetUser.id ? "Chef" : (userData.familyName ? "Membre" : "Aucun"), inline: true },
                    { name: '👤 Genre', value: userData.gender || 'Non défini', inline: true },
                    { name: '📝 Bio', value: userData.bio || 'Aucune bio définie.', inline: false },
                    { name: '💍 Conjoint', value: userData.spouse ? formatMention(userData.spouse) : 'Célibataire', inline: true },
                    { name: '👨‍👩‍👦 Parents', value: userData.parents.map(formatMention).join(', ') || 'Inconnus', inline: true }
                );

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('edit_p').setLabel('⚙️ Personnaliser').setStyle(ButtonStyle.Secondary));
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
                        ]);
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
                    return i.update({ content: "Votre genre ?", components: [gRow] });
                }
                if (i.customId === 'sel_gen') {
                    await db.updateUser(authorId, { gender: i.values[0] });
                    return i.update({ content: "✅ Genre mis à jour.", components: [] });
                }
                if (i.values?.[0] === 'name') {
                    const modal = new ModalBuilder().setCustomId('modal_rename_branch').setTitle('Nom de Branche');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal);
                }
                if (i.values?.[0] === 'spouse') {
                    if (!authorData.spouse) return i.reply({ content: "Pas de conjoint.", ephemeral: true });
                    const sData = await db.getOrCreateUser(authorData.spouse);
                    if (!sData.familyName) return i.reply({ content: "Pas de nom de famille.", ephemeral: true });
                    await db.updateUser(authorId, { familyName: sData.familyName });
                    return i.update({ content: "💍 Nom adopté !", components: [] });
                }
            });
            return;
        }

        case 'divorce': {
            if (!authorData.spouse) return message.reply('Tu n\'es pas marié(e).');
            await executeLinkChange(authorId, authorData.spouse, null, 'remove');
            return message.reply(`💔 Tu as divorcé de ${formatMention(authorData.spouse)}.`);
        }

        case 'hug': {
            if (!target) return message.reply('Qui veux-tu câliner ?');
            const rel = await areRelated(authorId, target.id);
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
            const rel = await areRelated(authorId, target.id); // Await async areRelated
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
        if (await db.getFamily(name)) return interaction.reply({ content: "❌ Nom déjà pris.", ephemeral: true });
        await db.createFamily(name, interaction.user.id);
        await db.updateUser(interaction.user.id, { familyName: name });
        await interaction.reply({ content: `🎉 Famille **${name.toUpperCase()}** fondée !` });
    }

    if (interaction.customId === 'modal_bio') {
        await db.updateUser(interaction.user.id, { bio: interaction.fields.getTextInputValue('bio_text') });
        await interaction.reply({ content: "✅ Bio mise à jour !", ephemeral: true });
    }

    if (interaction.customId === 'modal_rename_branch') {
        const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
        if (await db.getFamily(newName)) return interaction.reply({ content: "❌ Nom déjà pris.", ephemeral: true });
        const uData = await db.getOrCreateUser(interaction.user.id);
        const oldName = uData.familyName;
        const family = oldName ? await db.getFamily(oldName) : null;

        if (family?.head === interaction.user.id) {
            await db.createFamily(newName, interaction.user.id);
            await db.updateFamily(newName, { members: family.members });
            for (const mId of family.members) await db.updateUser(mId, { familyName: newName });
            await db.deleteFamily(oldName);
            await interaction.reply({ content: `✅ Dynastie renommée : **${newName.toUpperCase()}** !` });
        } else {
            if (oldName && family) await db.updateFamily(oldName, { members: family.members.filter(id => id !== interaction.user.id) });
            await db.createFamily(newName, interaction.user.id);
            await db.updateUser(interaction.user.id, { familyName: newName });
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