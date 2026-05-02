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
    InteractionType
} = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'); // Utilisation de @napi-rs/canvas
const path = require('path');
const fs = require('fs');

// Modification de l'enregistrement de la police
try {
    const fontPath = path.resolve(__dirname, 'font.ttf');
    if (fs.existsSync(fontPath)) {
        // La syntaxe change de registerFont(...) à GlobalFonts.registerFromPath(...)
        GlobalFonts.registerFromPath(fontPath, 'MyCustomFont');
        console.log(`✅ Police enregistrée (alias: MyCustomFont) depuis : ${fontPath}`);
    } else {
        console.warn(`⚠️ Fichier font.ttf introuvable à l'emplacement : ${fontPath}`);
        console.log("💡 Vérifie que le fichier est bien nommé 'font.ttf' (tout en minuscules) et qu'il est à la racine de ton dépôt GitHub.");
    }
} catch (e) {
    console.error("❌ Erreur police :", e.message);
}

const axios = require('axios');

require('dotenv').config();

const PREFIX = process.env.PREFIX || ',';

const ROLES_LIST = [
    'père', 'mère', 'enfant', 'frère', 'soeur', 
    'oncle', 'tante', 'cousin', 'cousine',
    'grand-père', 'grand-mère'
];

/** --- UTILITAIRES --- **/
const formatMention = (id) => `<@${id}>`;
const errorEmbed = (text) => new EmbedBuilder().setColor('#ff4757').setDescription(`❌ ${text}`);
const successEmbed = (text) => new EmbedBuilder().setColor('#2ed573').setDescription(`✅ ${text}`);
const clearUserFamilyLinks = async (guildId, userId) => await db.clearUserFamilyLinksDB(guildId, userId);
const safeDelete = (msg) => msg && typeof msg.delete === 'function' ? msg.delete().catch(() => {}) : null;
const autoDelete = (msg, time = 30000) => setTimeout(() => safeDelete(msg), time);

const getGif = (action) => {
    const gifs = GIF_LIBRARY[action];
    if (!gifs) return null;
    return Array.isArray(gifs) ? gifs[Math.floor(Math.random() * gifs.length)] : gifs;
};

/** --- BIBLIOTHÈQUE DE GIFS --- **/
const GIF_LIBRARY = {
    marry_accept: ['https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHYzeXN6bmN6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/m9SULzJXS6lRhRmB4o/giphy.gif'],
    marry_decline: ['https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif'],
    ask_accept: ['https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHpueG8ycWV6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/6YfMIn9680i9G/giphy.gif'],
    ask_decline: ['https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif'],
    end_rel: ['https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif'],
    hug: [
        'https://media.giphy.com/media/u9B3S2ArX9X5S/giphy.gif',
        'https://media.giphy.com/media/3M4NpbLCTxBqU/giphy.gif',
        'https://media.giphy.com/media/wnXz0N0iS3fHy/giphy.gif'
    ],
    kiss: [
        'https://media.giphy.com/media/G3va31WfEKhS8/giphy.gif',
        'https://media.giphy.com/media/K7YvY29Xh7hD2/giphy.gif',
        'https://media.giphy.com/media/119i1S6Wp4sh56/giphy.gif'
    ],
    pat: [
        'https://media.giphy.com/media/ARSp9T7wwxNcs/giphy.gif',
        'https://media.giphy.com/media/5tmRh1obzf3fW/giphy.gif',
        'https://media.giphy.com/media/ye7OTLw6EAsA8/giphy.gif'
    ],
    slap: [
        'https://media.giphy.com/media/uG3lKscP9lE1W/giphy.gif',
        'https://media.giphy.com/media/Zau0yrl17uzdEXqzjZ/giphy.gif',
        'https://media.giphy.com/media/Gf3AUz3eBNbTW/giphy.gif'
    ],
    poke: ['https://media.giphy.com/media/1X7Ag3SAsZ2Gk/giphy.gif', 'https://media.giphy.com/media/3YZ7A9hU8wTLO/giphy.gif'],
    tickle: ['https://media.giphy.com/media/v0reFosH7N8m4/giphy.gif', 'https://media.giphy.com/media/3v9yqZat2O7XW/giphy.gif'],
    bite: ['https://media.giphy.com/media/O9HeC68S69hPa/giphy.gif', 'https://media.giphy.com/media/vUrwX6Gv6vS6s/giphy.gif'],
    dance: ['https://media.giphy.com/media/1082yS2HMbLMSQ/giphy.gif', 'https://media.giphy.com/media/UptY0pDk48n0A/giphy.gif'],
    cuddle: ['https://media.giphy.com/media/lrr96YS85KkNi/giphy.gif', 'https://media.giphy.com/media/49mdjsMrH7oze/giphy.gif'],
    highfive: ['https://media.giphy.com/media/26ufgSwMRqauQWqL6/giphy.gif', 'https://media.giphy.com/media/5SByS3mRz5r2M/giphy.gif'],
    handhold: ['https://media.giphy.com/media/6YfMIn9680i9G/giphy.gif', 'https://media.giphy.com/media/YvMsc7zUvVfMc/giphy.gif']
};

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

/**
 * Helper pour envoyer l'affichage de l'arbre généalogique
 */
async function sendFamilyDisplay(ctx, guildId, targetId, isGlobal = false) {
    const targetData = await db.getOrCreateUser(guildId, targetId);
    if (!targetData.familyName) return;

    const family = await db.getFamily(guildId, targetData.familyName);
    if (!family) return;

    const [buffer, ext, membersWealth] = await Promise.all([
        generateFamilyImage(client, guildId, targetId),
        getExtendedFamily(guildId, targetId),
        Promise.all(family.members.map(id => getUBUser(guildId, id)))
    ]);

    const totalWealth = membersWealth.reduce((acc, res) => acc + (res ? res.cash : 0), 0);
    const spouseText = targetData.spouse ? formatMention(targetData.spouse) : 'Célibataire';
    const parentsText = [targetData.father, targetData.mother].filter(p => !!p).map(formatMention).join(', ') || 'Inconnus';
    const childrenText = (targetData.children || []).map(formatMention).join(', ') || 'Aucun';
    const attachment = new AttachmentBuilder(buffer, { name: 'family.png' });

    const embed = new EmbedBuilder()
        .setTitle(isGlobal ? `🌳 Lignée Complète : ${family.familyName.toUpperCase()}` : `🌿 Ma Branche : ${family.familyName.toUpperCase()}`)
        .setColor('#5865F2')
        .setImage('attachment://family.png')
        .addFields(
            { name: '👑 Chef de Lignée', value: formatMention(family.head), inline: true },
            { name: '👥 Population', value: `${family.members.length} membre(s)`, inline: true },
            { name: '💰 Fortune Totale', value: `**${totalWealth.toLocaleString()}** cr.`, inline: true },
            { name: '📅 Création', value: family.createdAt ? new Date(family.createdAt).toLocaleDateString('fr-FR') : 'Inconnue', inline: true },
            { name: '💍 Union', value: spouseText, inline: true },
            { name: '👨‍👩‍👧 Lignée Directe', value: `**Parents:** ${parentsText}\n**Enfants:** ${childrenText}`, inline: false },
            { name: '🌳 Parenté Étendue', value: `**Fratrie:** ${Array.from(ext.siblings).map(formatMention).join(', ') || 'Aucun'} | **Grands-Parents:** ${Array.from(ext.grandparents).map(formatMention).join(', ') || 'Aucun'} | **Oncles/Tantes:** ${Array.from(ext.unclesAunts).map(formatMention).join(', ') || 'Aucun'} | **Cousins:** ${Array.from(ext.cousins).map(formatMention).join(', ') || 'Aucun'}`, inline: false }
        ).setTimestamp();

    if (ctx.isChatInputCommand?.() || ctx.isButton?.() || ctx.isStringSelectMenu?.()) {
        return ctx.followUp({ embeds: [embed], files: [attachment] });
    } else {
        return ctx.channel.send({ embeds: [embed], files: [attachment] });
    }
}

// --- Visual Tree Generator ---
async function generateFamilyImage(client, guildId, userId) {
    console.log(`[DEBUG] Début génération image pour : ${userId}`);
    const userData = await db.getOrCreateUser(guildId, userId); // Fetch user data from DB
    const family = userData.familyName ? await db.getFamily(guildId, userData.familyName) : null;

    // Calcul dynamique de la largeur en fonction du nombre d'enfants (220px par enfant)
    const childrenData = (userData.children || []);
    const canvasWidth = Math.max(800, childrenData.length * 210 + 100);
    const canvasHeight = 550;
    const centerX = canvasWidth / 2;
    const centerY = 280;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fond
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Fonction robuste pour dessiner un rectangle arrondi (fallback manuel)
    const fillRoundedRect = (x, y, width, height, radius, color) => {
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    const drawNode = async (id, x, y, roleText, color = '#7289da') => {
        if (!id) return;
        console.log(`[DEBUG] Dessin du nœud ${id} (${roleText}) à x:${x}, y:${y}`);
        
        const user = client.users.cache.get(id) || (typeof id === 'string' ? await client.users.fetch(id).catch(() => null) : null);
        const name = (user ? user.username : id)?.toString() || "Inconnu";
        const isHead = family?.head === id;

        // Dessin du rectangle
        fillRoundedRect(x - 90, y - 35, 180, 70, 15, isHead ? '#faa61a' : color);

        if (user) {
            // Charger l'avatar
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
            try {
                console.log(`[DEBUG] Chargement avatar pour ${user.username}: ${avatarUrl}`);
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x - 50, y, 25, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, x - 75, y - 25, 50, 50);
                ctx.restore();
                
                // Dessin du nom
                ctx.save(); // Sauvegarder l'état pour le texte
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.font = '16px "MyCustomFont", sans-serif'; // Utiliser l'alias et un fallback générique
                ctx.fillText(String(name).substring(0, 12), x - 15, y - 5);
                
                // Dessin du rôle
                ctx.font = '13px "MyCustomFont", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(String((isHead ? "👑 " : "") + roleText), x - 15, y + 15);
                ctx.restore(); // Restaurer l'état après le texte
            } catch (err) {
                console.error(`[DEBUG] Erreur chargement avatar/texte pour ${user.username}:`, err.message);
                ctx.save(); // Sauvegarder l'état pour le texte de fallback
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = '16px sans-serif'; // Fallback vers une police système générique
                ctx.fillText(String(name).substring(0, 15), x, y);
                ctx.restore(); // Restaurer l'état après le texte de fallback
            }
        } else {
            console.log(`[DEBUG] Utilisateur ${id} non trouvé dans le cache/fetch.`);
            ctx.save(); // Sauvegarder l'état pour le texte
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = '16px sans-serif'; // Fallback vers une police système générique
                ctx.fillText(String(name).substring(0, 15), x, y);
            ctx.restore(); // Restaurer l'état après le texte
        }
    };

    // Dessin du Titre
    if (family) {
        console.log(`[DEBUG] Dessin du titre pour la famille ${family._id}`);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '26px "MyCustomFont", sans-serif'; // Utiliser l'alias et un fallback générique
        ctx.textAlign = 'center';
        ctx.fillText(String(`Lignée des ${family.familyName.toUpperCase()}`), centerX, 45);
        ctx.restore();
    }

    // ÉTAPE 1 : Dessiner toutes les lignes d'abord
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    if (userData.spouse) {
        ctx.beginPath(); ctx.moveTo(centerX + 90, centerY); ctx.lineTo(centerX + 110, centerY); ctx.stroke();
    }
    
    const parents = [userData.father, userData.mother].filter(p => !!p);
    for (let i = 0; i < parents.length; i++) {
        const xPos = centerX - 130 + (i * 260);
        ctx.beginPath(); ctx.moveTo(centerX, centerY - 35); ctx.lineTo(xPos, 130 + 35); ctx.stroke();
    }

    const childrenDataLines = childrenData;
    for (let i = 0; i < childrenDataLines.length; i++) {
        const spread = canvasWidth - 100;
        const xPos = centerX + (i - (childrenDataLines.length - 1) / 2) * (childrenDataLines.length > 1 ? spread / (Math.max(1, childrenDataLines.length - 1)) : 0);
        ctx.beginPath(); ctx.moveTo(centerX, centerY + 35); ctx.lineTo(xPos, 430 - 35); ctx.stroke();
    }
    ctx.restore();

    // ÉTAPE 2 : Dessiner tous les nœuds par-dessus
    console.log("[DEBUG] Dessin des membres...");
    if (userData.spouse) await drawNode(userData.spouse, centerX + 200, centerY, "Conjoint(e)");
    for (let i = 0; i < parents.length; i++) {
        const xPos = centerX - 130 + (i * 260);
        await drawNode(parents[i], xPos, 130, parents[i] === userData.father ? "Père" : "Mère");
    }
    for (let i = 0; i < childrenDataLines.length; i++) {
        const spread = canvasWidth - 100;
        const xPos = centerX + (i - (childrenDataLines.length - 1) / 2) * (childrenDataLines.length > 1 ? spread / Math.max(1, childrenDataLines.length - 1) : 0);
        await drawNode(childrenDataLines[i], xPos, 430, "Enfant");
    }
    
    await drawNode(userId, centerX, centerY, "Moi", '#5865F2');

    console.log("[DEBUG] Image générée avec succès, conversion en buffer...");
    return canvas.toBuffer('image/png');
}

// This function now needs to be async as it fetches data from DB
async function getExtendedFamily(guildId, userId) {
    const user = await db.getOrCreateUser(guildId, userId);
    const siblings = new Set();
    const grandparents = new Set();
    const unclesAunts = new Set();
    const cousins = new Set();

    const parents = [user.father, user.mother].filter(p => !!p);
    const parentDataArray = await db.getUsersByIds(guildId, parents);
    
    for (const parentData of parentDataArray) {
        for (const cId of (parentData?.children || [])) {
            if (cId !== userId) siblings.add(cId);
        }
        if (parentData.father) grandparents.add(parentData.father);
        if (parentData.mother) grandparents.add(parentData.mother);
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
        'mari': gender === 'masculin' ? 'mari' : 'femme',
        'femme': gender === 'féminin' ? 'femme' : 'mari',
        'père': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'mère': gender === 'féminin' ? 'fille' : (gender === 'masculin' ? 'fils' : 'enfant'),
        'enfant': gender === 'féminin' ? 'mère' : (gender === 'masculin' ? 'père' : 'père')
    };
    return mapping[role] || role;
}

// Gère la propagation du nom de famille aux descendants non mariés et sans enfants
async function propagateNameChange(guildId, userId, oldName, newName) { // No longer needs `data`
    const user = await db.getOrCreateUser(guildId, userId);
    if (!user) return;

    for (const childId of (user.children || [])) {
        const child = await db.getOrCreateUser(guildId, childId);
        if (child && child.familyName === oldName) {
            // Logique : On ne change le nom que si l'enfant n'est pas marié et n'a pas lui-même d'enfants
            if (!child.spouse && (child.children || []).length === 0) {
                await db.updateUser(guildId, childId, { familyName: newName });
                // Mise à jour du registre de famille
                const newFamily = await db.getFamily(guildId, newName);
                if (newFamily && !newFamily.members.includes(childId)) {
                    newFamily.members.push(childId);
                    await db.updateFamily(guildId, newName, { members: newFamily.members });
                }
                // Remove from old family members if it was there
                const oldFamily = await db.getFamily(guildId, oldName);
                if (oldFamily) {
                    oldFamily.members = oldFamily.members.filter(id => id !== childId);
                    await db.updateFamily(guildId, oldName, { members: oldFamily.members });
                }
                await propagateNameChange(guildId, childId, oldName, newName);
            }
        }
    }
}

async function areRelated(guildId, id1, id2) { // Made async
    if (id1 === id2) return 'soi-même';
    const u1 = await db.getOrCreateUser(guildId, id1);
    
    if (u1.customLinks && u1.customLinks[id2]) return u1.customLinks[id2];
    if (u1.spouse === id2) return 'conjoint(e)';
    if (u1.father === id2) return 'père';
    if (u1.mother === id2) return 'mère';
    if (u1.children.includes(id2)) return 'enfant';

    const ext = await getExtendedFamily(guildId, id1); // Call async version
    if (ext.siblings.has(id2)) return 'frère/soeur';
    if (ext.grandparents.has(id2)) return 'grand-parent';
    if (ext.unclesAunts.has(id2)) return 'oncle/tante';
    if (ext.cousins.has(id2)) return 'cousin(e)';

    return null;
}

// Function to get all members of a family
async function getFamilyMembers(guildId, familyName) { // Made async
    const normalizedFamilyName = familyName.toLowerCase();
    const family = await db.getFamily(guildId, normalizedFamilyName);
    if (family) {
        return family.members;
    }
    return [];
}

// Function to get the head of a family
async function getFamilyHead(guildId, familyName) { // Made async
    const normalizedFamilyName = familyName.toLowerCase();
    const family = await db.getFamily(guildId, normalizedFamilyName);
    return family ? family.head : null;
}

// New function to merge two families
async function mergeFamilies(guildId, inviterFamilyName, invitedFamilyName, inviterId, invitedId, role) { // Made async
    const inviterFamily = await db.getFamily(guildId, inviterFamilyName);
    const invitedFamily = await db.getFamily(guildId, invitedFamilyName);

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
        await db.updateUser(guildId, memberId, { familyName: inviterFamilyName });
    }
    await db.updateFamily(guildId, inviterFamilyName, { members: inviterFamily.members });

    // Pont relationnel logique
    const inviter = await db.getOrCreateUser(guildId, inviterId);
    const invited = await db.getOrCreateUser(guildId, invitedId);

    if (role === 'oncle' || role === 'tante') {
        // La cible devient le frère/soeur d'un des parents de l'inviteur
        const parentId = inviter.father || inviter.mother;
        if (parentId) {
            const pData = await db.getOrCreateUser(guildId, parentId);
            if (pData && (pData.father || pData.mother)) {
                // On donne à l'invité les mêmes parents que le parent de l'inviteur (les grands-parents)
                await db.updateUser(guildId, invitedId, { father: pData.father, mother: pData.mother });
                const gps = [pData.father, pData.mother].filter(g => g !== null);
                for (const gpId of gps) {
                    const gpData = await db.getOrCreateUser(guildId, gpId);
                    if (gpData && !gpData.children.includes(invitedId)) {
                        gpData.children.push(invitedId);
                        await db.updateUser(guildId, gpId, { children: gpData.children });
                    }
                }
            }
        }
    } else if (role === 'frère' || role === 'soeur') {
        // La cible partage les mêmes parents que l'inviteur
        if (inviter.father || inviter.mother) {
            await db.updateUser(guildId, invitedId, { father: inviter.father, mother: inviter.mother });
            const ps = [inviter.father, inviter.mother].filter(p => p !== null);
            for (const pId of ps) {
                const pData = await db.getOrCreateUser(guildId, pId);
                if (pData && !pData.children.includes(invitedId)) {
                    pData.children.push(invitedId);
                    await db.updateUser(guildId, pId, { children: pData.children });
                }
            }
        }
    } else if (role === 'grand-père' || role === 'grand-mère') {
        // La cible devient le parent d'un des parents de l'inviteur
        const parentId = inviter.father || inviter.mother;
        if (parentId) {
            const pData = await db.getOrCreateUser(guildId, parentId);
            if (pData) {
                const field = role === 'grand-père' ? 'father' : 'mother';
                await db.updateUser(guildId, parentId, { [field]: invitedId });
            }
            if (invited && !invited.children.includes(parentId)) {
                invited.children.push(parentId);
                await db.updateUser(guildId, invitedId, { children: invited.children });
            }
        }
    }

    // Remove the invited family
    await db.deleteFamily(guildId, invitedFamilyName);
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
async function executeLinkChange(guildId, id1, id2, role, action) { // No longer needs `data`
    const d1 = await db.getOrCreateUser(guildId, id1);
    const d2 = await db.getOrCreateUser(guildId, id2);

    // Nettoyage systématique des anciens liens
    let d1Update = { customLinks: d1.customLinks || {} };
    let d2Update = { customLinks: d2.customLinks || {} };

    if (d1.spouse === id2) { d1Update.spouse = null; d2Update.spouse = null; }
    if (d1.couple === id2) { d1Update.couple = null; d2Update.couple = null; }
    d1Update.children = (d1.children || []).filter(id => id !== id2);
    if (d1.father === id2) d1Update.father = null;
    if (d1.mother === id2) d1Update.mother = null;
    if (d2.father === id1) d2Update.father = null;
    if (d2.mother === id1) d2Update.mother = null;
    d2Update.children = (d2.children || []).filter(id => id !== id1);

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
        await db.updateUser(guildId, id1, d1Update);
        await db.updateUser(guildId, id2, d2Update);
        return;
    }

    if (role === 'conjoint') {
        d1Update.spouse = id2; d2Update.spouse = id1;
    } else if (role === 'couple') {
        d1Update.couple = id2; d2Update.couple = id1;
    } else if (role === 'père' || role === 'mère') {
        const field = role === 'père' ? 'father' : 'mother';
        d1Update[field] = id2;
        if (!d2Update.children.includes(id1)) d2Update.children.push(id1);
    } else if (role === 'enfant') {
        if (!d1Update.children.includes(id2)) d1Update.children.push(id2);
        const genderField = d1.gender === 'féminin' ? 'mother' : 'father';
        d2Update[genderField] = id1;
    } else {
        d1Update.customLinks = { ...(d1Update.customLinks || d1.customLinks), [id2]: role };
        d2Update.customLinks = { ...(d2Update.customLinks || d2.customLinks), [id1]: await getReverseRole(role, d1) };
    }

    await db.updateUser(guildId, id1, d1Update);
    await db.updateUser(guildId, id2, d2Update);
    
    // Logique de mariage automatique pour Oncles/Tantes et Grands-parents
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
            // On pourrait déclencher une invitation ici, mais pour rester simple on informe juste
            console.log(`Match romantique potentiel entre ${userId} et ${mId}`);
        }
    }
}

async function startFamilyVote(guildId, interaction, author, target, role, action) {
    const authorData = await db.getOrCreateUser(guildId, author.id);
    const family = await db.getFamily(guildId, authorData.familyName);

    // Règle spéciale : Si la famille ne compte que 2 membres, le choix du chef est immédiat
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

async function sendInvitation(guildId, interaction, author, target, role, action, fromVote = false) {
    const authorData = await db.getOrCreateUser(guildId, author.id);
    const targetData = await db.getOrCreateUser(guildId, target.id);

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
        row = new ActionRowBuilder().addComponents( 
            new ButtonBuilder().setCustomId('i_ok').setLabel('Accepter').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('i_no').setLabel('Refuser').setStyle(ButtonStyle.Danger)
        );
    }

    // Sécurité accrue pour déterminer si on doit utiliser reply ou editReply
    const msg = (interaction.replied || interaction.deferred) 
        ? await interaction.editReply({ content: `${target}`, embeds: [inviteEmbed], components: [row] })
        : await interaction.reply({ content: `${target}`, embeds: [inviteEmbed], components: [row], fetchReply: true });

    const collector = (msg || await interaction.fetchReply()).createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    
    collector.on('collect', async (i) => {
        if (i.user.id !== target.id) return i.reply({ content: "Ce n'est pas pour vous.", flags: MessageFlags.Ephemeral });

        if (i.customId === 'i_ok') {
            if (targetData.familyName && authorData.familyName && targetData.familyName !== authorData.familyName) await clearUserFamilyLinks(guildId, target.id);
            await executeLinkChange(guildId, author.id, target.id, role, action);
            if (authorData.familyName) {
                const family = await db.getFamily(guildId, authorData.familyName);
                if (family && !family.members.includes(target.id)) {
                    family.members.push(target.id);
                    await db.updateFamily(guildId, authorData.familyName, { members: family.members });
                }
                await db.updateUser(guildId, target.id, { familyName: authorData.familyName });
            }
            await i.message.delete().catch(() => {});
            await i.channel.send(`🎊 Félicitations ! ${target} est maintenant le/la **${role}** de ${author} !`);
        } else if (i.customId === 'i_merge') {
            await mergeFamilies(guildId, authorData.familyName, targetData.familyName, author.id, target.id, role);
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

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Prefix: ${PREFIX}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    if (!message.guild) return message.reply("Cette commande ne peut être utilisée que dans un serveur."); // S'assurer que c'est dans un serveur

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const authorId = message.author.id;
    const author = message.author;
    const guildId = message.guild.id;
    const authorData = await db.getOrCreateUser(guildId, authorId);
    
    // On définit les commandes dont on veut garder la trace (social et info)
    // Seuls help, account, familytop et les interactions sociales restent affichés.
    const persistentCommands = ['help', 'account', 'familytop', 'familyhistory', 'fh', 'ask', 'end', 'marry', 'divorce', 'love-calc', 'hug', 'kiss', 'pat', 'slap', 'poke', 'tickle', 'bite', 'dance', 'cuddle', 'highfive', 'handhold'];

    // Suppression automatique du message utilisateur si la commande n'est pas persistante
    if (!persistentCommands.includes(command)) safeDelete(message);

    const target = message.mentions.users.first();
    const commandsToType = ['adminfamily', 'family', 'account', 'info'];
    if (commandsToType.includes(command)) await message.channel.sendTyping();
    let response = null;

    switch (command) {
        case 'adminfamily': {
            const adminMsgTimeout = 30000; // Suppression après 30 secondes
            try {
                if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return message.channel.send({ embeds: [errorEmbed("Admin uniquement.")] });
                }
                const familyName = args.join(' ');
                if (!familyName) {
                    return message.channel.send({ embeds: [errorEmbed(`Usage: ${PREFIX}adminfamily <Nom>`)] });
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
                    filter: i => i.user.id === authorId && ['admin_add', 'admin_modify', 'admin_remove', 'admin_clear', 'admin_cancel', 'admin_transfer', 'admin_rename', 'admin_history'].includes(i.customId), 
                    time: 120000 
                });

                coll.on('collect', async (i) => {
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
                    for (const mId of family.members) await db.updateUser(guildId, mId, { familyName: null, spouse: null, children: [], mother: null, father: null });
                    await db.deleteFamily(guildId, familyName);
                    await i.message.delete();
                    return i.channel.send({ embeds: [successEmbed(`Famille **${familyName.toUpperCase()}** supprimée.`)] });
                }

                const action = i.customId.replace('admin_', ''); // Extract action from customId
                let targetSelectRow;
                if (action === 'add' || action === 'transfer') {
                    targetSelectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('target').setPlaceholder('Choisir le membre à ajouter...'));
                } else {
                    // On ne propose pas le chef pour modification/suppression
                    const filteredMembers = family.members.filter(mId => mId !== family.head);
                    
                    if (filteredMembers.length === 0) {
                        return i.reply({ content: "❌ Aucun autre membre à modifier ou retirer.", flags: MessageFlags.Ephemeral });
                    }

                    const memberOptions = await Promise.all(filteredMembers.map(async (mId) => {
                        const user = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
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
                        
                        await executeLinkChange(guildId, family.head, targetId, ri.values[0], 'add'); // family.head est l'ID du chef
                        await db.updateUser(guildId, targetId, { familyName: family.familyName }); // family.familyName est le nom de la famille
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
            }); // Fin coll.on('collect')
                coll.on('end', () => msg.delete().catch(() => {})); // Suppression du message admin à la fin du collecteur
            } catch (err) {
                console.error("Erreur adminfamily:", err);
                message.channel.send({ embeds: [errorEmbed("Une erreur critique est survenue dans la commande admin.")] });
            }
            return;
        }

        case 'family': {
            let embed = new EmbedBuilder().setColor("#5865F2");
            let rows = [];
            try {
                const isGlobalArg = args.some(a => ['global', 'lignée', 'toute'].includes(a.toLowerCase()));
                const searchArgs = args.filter(a => !['global', 'lignée', 'toute'].includes(a.toLowerCase()));

                if (searchArgs.length > 0) {
                    await message.channel.sendTyping();

                    let targetId = message.mentions.users.first()?.id;
                    // Support de l'ID direct
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

                    if (!family || !targetId) return message.reply({ embeds: [errorEmbed("Famille introuvable (utilisez un nom, une mention ou un ID).")] });
                    
                    // Si c'est une demande de lignée complète, on part du chef
                    await sendFamilyDisplay(message, guildId, isGlobalArg ? family.head : targetId, isGlobalArg);
                    return; // Ne pas supprimer
                }

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
                        // Nettoyage automatique si la famille a disparu de la DB
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

                        const menu = new StringSelectMenuBuilder().setCustomId('fam_action').setPlaceholder('Gérer...')
                            .addOptions([ // These options will be replaced by buttons
                                { label: 'Ajouter un membre', value: 'add' },
                                { label: 'Modifier un rôle', value: 'modify' },
                                { label: 'Enlever un membre', value: 'remove' },
                                { label: 'Quitter la famille', value: 'leave' }
                            ]);
                if (isHead) menu.addOptions({ label: 'Dissoudre la famille', value: 'delete' }); // Option de dissolution pour le chef
                        menu.addOptions({ label: 'Annuler', value: 'cancel' });

                        // Remplacer le menu déroulant par des boutons pour une meilleure accessibilité
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
                const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId && (['fam_action', 'create_fam', 'cancel_main', 'view_branch', 'view_global', 'confirm_del'].includes(i.customId) || i.customId.startsWith('fam_')), time: 120000 });
                
                collector.on('collect', async (i) => {
                    if (i.customId === 'cancel_main') { // Gérer le bouton d'annulation principal
                        return msg.delete().catch(() => {});
                    }

                    if (i.customId === 'view_branch' || i.customId === 'view_global') {
                    await i.deferUpdate();
                    const family = await db.getFamily(guildId, authorData.familyName);
                    const targetId = i.customId === 'view_global' ? family.head : authorId;
                    await sendFamilyDisplay(i, guildId, targetId, i.customId === 'view_global');
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
                        await i.update({ components: [] }); // Supprimer les boutons de confirmation
                        return i.channel.send({ embeds: [successEmbed(`La famille **${family.familyName.toUpperCase()}** a été dissoute.`)] });
                    }
                    return;
                }

                // Gérer les interactions des boutons d'action de la famille
                if (i.customId.startsWith('fam_')) {
                    const action = i.customId.replace('fam_', ''); // Extract action from customId

                    if (action === 'cancel') { // Bouton "Annuler" ou "Fermer"
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
                        // Le bouton de confirmation est géré par 'confirm_del'
                        // On affiche juste le message de confirmation ici
                        const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('confirm_del').setLabel('Confirmer la dissolution').setStyle(ButtonStyle.Danger));
                        return i.update({ content: "⚠️ Dissoudre la famille ?", components: [confirm] });
                    }
                    
                    if (action === 'leave') {
                        await i.deferUpdate();
                        await clearUserFamilyLinks(guildId, authorId);
                        await msg.delete().catch(() => {});
                        return i.channel.send(`👋 ${message.author} a quitté sa famille.`);
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
                            const user = client.users.cache.get(mId) || await client.users.fetch(mId).catch(() => null);
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
                        const targetUser = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);

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

                        const rMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('r').setPlaceholder('Rôle...').addOptions(ROLES_LIST.map(r => ({ label: r, value: r }))));
                        const rCancel = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('c_r').setLabel('Annuler').setStyle(ButtonStyle.Danger));
                        await ui.editReply({ content: `Rôle pour <@${targetUser.id}> :`, components: [rMenu, rCancel] });

                        const ri = await i.message.awaitMessageComponent({ 
                            filter: subI => subI.user.id === authorId && ['r', 'c_r'].includes(subI.customId), 
                            time: 60000 
                        });
                        await ri.deferUpdate();

                        if (ri.customId === 'c_r') return msg.delete();

                        if (action === 'add') await sendInvitation(guildId, ri, message.author, targetUser, ri.values[0], 'add');
                        else await startFamilyVote(guildId, ri, message.author, targetUser, ri.values[0], 'modify');
                    } catch (e) {
                        console.error("Erreur family (membre/rôle):", e);
                        if (msg) await msg.edit({ embeds: [errorEmbed("Action annulée ou temps écoulé.")], components: [] }).catch(() => {});
                    }
                }
            });
                // Suppression automatique du menu à la fin (temps écoulé ou fermeture manuelle)
                collector.on('end', (collected, reason) => { if (msg) msg.delete().catch(() => {}); });
            } catch (err) {
                console.error("Erreur commande family (dashboard):", err);
                return message.channel.send({ embeds: [errorEmbed("Une erreur est survenue lors de l'affichage de la famille.")] }); // Le message d'erreur reste
            }
            return;
        }

        case 'familytop':
        case 'account': {
            await message.channel.sendTyping(); // Ces commandes sont persistantes
            const showWealth = async (guildId, uId, uData) => {
                const members = [uId];
                if (uData.spouse) members.push(uData.spouse);
                uData.children.forEach(id => members.push(id));
                const results = await Promise.all(members.map(id => getUBUser(message.guild.id, id)));
                const total = results.reduce((acc, res) => acc + (res ? res.cash : 0), 0);
                return new EmbedBuilder().setTitle('🏦 Banque Familiale').setColor('#f1c40f').addFields({ name: 'Fortune Totale', value: `💰 **${total.toLocaleString()}** cr.`, inline: false });
            };
            const showTop = async (guildId) => {
                const familyWealths = [];
                const allUsers = await db.getAllUsers(guildId);
                const families = await db.getAllFamilies(guildId);
                
                for (const fam of Object.values(families)) {
                    const members = fam.members;
                    const res = await Promise.all(members.map(id => getUBUser(message.guild.id, id)));
                    familyWealths.push({ headId: fam.head, total: res.reduce((acc, r) => acc + (r ? r.cash : 0), 0) });
                }
                familyWealths.sort((a, b) => b.total - a.total);
                const embed = new EmbedBuilder().setTitle('🏆 Top des Familles').setColor('#ffd700');
                familyWealths.slice(0, 10).forEach((f, i) => embed.addFields({ name: `${i + 1}. ${formatMention(f.headId)}`, value: `💰 ${f.total.toLocaleString()} cr.`, inline: false }));
                return embed;
            };

            const initialEmbed = (command === 'familytop') ? await showTop(guildId) : await showWealth(guildId, authorId, authorData);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_wealth').setLabel('Ma Fortune').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_top').setLabel('🏆 Classement').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancel_bank').setLabel('❌').setStyle(ButtonStyle.Secondary)
            );
            const msg = await message.reply({ embeds: [initialEmbed], components: [row] }); // La réponse reste
            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });
            coll.on('collect', async (i) => {
                if (i.customId === 'cancel_bank') return i.message.delete();
                await i.deferUpdate();
                const newEmbed = (i.customId === 'v_top') ? await showTop(guildId) : await showWealth(guildId, authorId, authorData);
                await i.editReply({ embeds: [newEmbed] });
            });
            return;
        }

        case 'help': {
            const h = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📚 Guide Complet de la Dynastie')
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(`Gérez vos lignées et votre fortune via nos dashboards interactifs !\nPréfixe : \`${PREFIX}\``)
                .addFields(
                    { name: '🏠 Famille', value: `\`${PREFIX}family\` : Dashboard personnel.\n\`${PREFIX}family <Nom/ID> [global]\` : Arbre visuel.\n\`${PREFIX}fh [Nom]\` : Historique de la lignée.\n\`${PREFIX}listfamilies\` : Liste des familles.` },
                    { name: 'ℹ️ Profil', value: `\`${PREFIX}info [@User]\` : Fiche d'identité et personnalisation.` },
                    { name: '💰 Économie', value: `\`${PREFIX}account\` : Fortune du foyer et classement des richesses.` },
                    { name: '💍 Relations & Social', value: `\`${PREFIX}ask <@User>\` : Se mettre en couple.\n\`${PREFIX}end\` : Rompre la relation.\n\`${PREFIX}marry <@User>\` : Mariage.\n\`${PREFIX}love-calc <@U1> [@U2]\` : Test de compatibilité.\n\`${PREFIX}divorce\`, \`${PREFIX}hug\`, \`${PREFIX}kiss\`, \`${PREFIX}pat\`, \`${PREFIX}slap\`, \`${PREFIX}tickle\`, \`${PREFIX}dance\`, \`${PREFIX}cuddle\`, \`${PREFIX}bite\`, \`${PREFIX}highfive\`, \`${PREFIX}handhold\`` },
                    { name: '⚙️ Administration', value: `\`${PREFIX}adminfamily <Nom>\` : Gestion forcée (Rename, Transfert, Historique).\n\`${PREFIX}resetdb\` : Réinitialisation complète (Admin uniquement).` }
                );
            return message.channel.send({ embeds: [h] }); // La réponse reste
        }

        case 'ask': {
            if (!target) return message.reply('Avec qui souhaites-tu te mettre en couple ?');
            if (target.id === authorId) return message.reply('C\'est beau l\'amour propre, mais choisis quelqu\'un d\'autre !');
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
            return;
        }

        case 'end': {
            if (!authorData.couple) return message.reply('Tu n\'es pas en couple.');
            const targetId = authorData.couple;

            const endEmbed = new EmbedBuilder()
                .setTitle("💔 Rupture")
                .setColor("#95a5a6")
                .setDescription(`Es-tu sûr(e) de vouloir mettre fin à ta relation avec ${formatMention(targetId)} ?`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_end').setLabel('Confirmer la rupture').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_end').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.reply({ embeds: [endEmbed], components: [row] });
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'confirm_end') {
                    await executeLinkChange(guildId, authorId, targetId, 'couple', 'remove');
                    await i.update({ embeds: [successEmbed(`💔 La relation entre ${formatMention(authorId)} et ${formatMention(targetId)} est terminée.`)], components: [] });
                } else {
                    await i.update({ embeds: [errorEmbed("Action annulée.")], components: [] });
                }
                collector.stop();
            });
            return;
        }

        case 'love-calc': {
            let u1, u2;
            const mentions = message.mentions.users;
            if (mentions.size === 0) return message.reply({ embeds: [errorEmbed(`Usage: ${PREFIX}love-calc <@User1> [@User2]`)] });
            if (mentions.size === 1) { u1 = message.author; u2 = mentions.first(); }
            else { const iter = mentions.values(); u1 = iter.next().value; u2 = iter.next().value; }
            if (u1.id === u2.id) return message.reply("L'algorithme nécessite deux entités distinctes !");

            // Récupération des données pour une analyse contextuelle "précise"
            const u1Data = await db.getOrCreateUser(guildId, u1.id);
            const u2Data = await db.getOrCreateUser(guildId, u2.id);

            // --- ALGORITHME DE RÉDUCTION ITÉRATIVE (Love Calculator Classic) ---
            const name1 = u1.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            const name2 = u2.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // On ajoute un "sel" basé sur les IDs pour que le calcul soit unique aux comptes
            // et pas seulement aux pseudos
            const idSalt = (parseInt(u1.id.slice(-3)) + parseInt(u2.id.slice(-3))).toString();
            const combined = name1 + name2 + idSalt;
            
            // Étape 1 : Compter les occurrences de chaque lettre dans l'ordre d'apparition
            const counts = [];
            const seen = new Set();
            for (const char of combined) {
                if (!seen.has(char)) {
                    seen.add(char);
                    const count = combined.split(char).length - 1;
                    counts.push(count);
                }
            }

            // Étape 2 : Réduction itérative (Somme des extrémités)
            let sequence = [...counts];
            while (sequence.length > 2) {
                const nextStep = [];
                let left = 0;
                let right = sequence.length - 1;

                while (left <= right) {
                    if (left === right) {
                        nextStep.push(sequence[left]);
                    } else {
                        const sum = sequence[left] + sequence[right];
                        if (sum >= 10) {
                            // On décompose la somme en chiffres individuels (ex: 12 -> 1, 2)
                            nextStep.push(Math.floor(sum / 10));
                            nextStep.push(sum % 10);
                        } else {
                            nextStep.push(sum);
                        }
                    }
                    left++;
                    right--;
                }
                sequence = nextStep;
            }

            let score = parseInt(sequence.join('')) || 0;

            // --- CALCUL DES BONUS CONTEXTUELS (La partie "Précise") ---
            // Bonus si déjà en couple/mariés (+10%)
            if (u1Data.spouse === u2.id || u1Data.couple === u2.id) score += 10;
            // Bonus si dans la même famille (+5%)
            if (u1Data.familyName && u1Data.familyName === u2Data.familyName) score += 5;
            
            score = Math.min(100, score); // Cap à 100%
            
            let comment = "";
            let color = "#747d8c";

            if (score === 100) {
                comment = "⚡ **ALERTE NUCLÉAIRE : 100% !** Vous êtes soit des clones, soit vous avez hacké mon code. C'est flippant, marriez-vous tout de suite !";
                color = "#ff0000";
            } else if (score >= 90) {
                comment = "🔥 **C'est l'amour atomique !** Préparez les faire-part, le gâteau et le labrador. Le serveur n'est pas prêt pour autant de love.";
                color = "#ff4757";
            } else if (score >= 80) {
                comment = "💎 **Un duo de choc !** Le destin a fait du bon boulot (ou vous avez triché sur vos pseudos). Vous brillez plus qu'un diamant poli.";
                color = "#ff6b81";
            } else if (score >= 60) {
                comment = "🌈 **Y'a du potentiel !** Vous pourriez survivre à un dîner de famille sans vous jeter les fourchettes au visage. C'est déjà beau.";
                color = "#ffa502";
            } else if (score >= 40) {
                comment = "🛋️ **La Zone de Confort.** C'est stable, comme un vieux canapé : pas très excitant, mais on s'y sent bien (ou alors c'est la friendzone).";
                color = "#eccc68";
            } else if (score >= 20) {
                comment = "🌵 **Aïe.** À ce stade, même une plante verte a plus d'affinités avec vous. Va falloir ramer très fort pour faire avancer le bateau.";
                color = "#f1c40f";
            } else {
                comment = "🛑 **ZONE DE DANGER.** Même l'eau et l'huile s'entendent mieux que vous. L'algorithme suggère de rester à au moins 5 km de distance.";
                color = "#747d8c";
            }

            const bar = "❤️".repeat(Math.floor(score / 10)) + "🖤".repeat(10 - Math.floor(score / 10));

            const loveEmbed = new EmbedBuilder()
                .setTitle("🔬 Rapport d'Expertise en Compatibilité")
                .setColor(color)
                .setThumbnail("https://media.giphy.com/media/l41lTfuxV6Zoopow8/giphy.gif")
                .setDescription(`Analyse probabiliste pour **${u1.username}** et **${u2.username}**.`)
                .addFields(
                    { name: "📊 Résultat du Scan", value: `**${score}%**\n${bar}`, inline: false },
                    { name: "💬 Conclusion du Bot", value: comment, inline: false },
                    { name: "📉 Données Techniques", value: `• Affinité Nominale: ${((score * 7) % 31 + 60)}%\n• Résonance ID: ${((score * 13) % 41 + 50)}%\n• Bonus de Relation: ${u1Data.spouse === u2.id ? "Activé (Mariage)" : (u1Data.couple === u2.id ? "Activé (Couple)" : "Aucun")}`, inline: false }
                )
                .setFooter({ text: "Moteur analytique Dynastie v3.1.0" })
                .setTimestamp();

            return message.channel.send({ embeds: [loveEmbed] });
        }

        case 'marry': {
            if (!target) return message.reply('Qui veux-tu épouser ?');
            if (target.id === authorId) return message.reply('Tu ne peux pas t\'épouser toi-même !');

            const authorData = await db.getOrCreateUser(guildId, authorId);
            const targetData = await db.getOrCreateUser(guildId, target.id);

            if (authorData.spouse) return message.reply(`Tu es déjà marié(e) à ${formatMention(authorData.spouse)}.`);
            if (targetData.spouse) return message.reply(`${formatMention(target.id)} est déjà marié(e).`);

            const marryEmbed = new EmbedBuilder()
                .setTitle("💖 Demande en Mariage")
                .setColor("#FF69B4")
                .setDescription(`${formatMention(target.id)}, ${formatMention(authorId)} te demande en mariage !`)
                .setFooter({ text: "Tu as 60 secondes pour répondre." });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('m_accept').setLabel('Accepter').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('m_decline').setLabel('Refuser').setStyle(ButtonStyle.Danger)
            );

            const msg = await message.channel.send({ content: `${formatMention(target.id)}`, embeds: [marryEmbed], components: [row] }); // La réponse reste
            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === target.id,
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async (i) => {
                await i.update({ components: [] }); // Retire les boutons dès le premier clic pour verrouiller le choix

                if (i.customId === 'm_accept') { // Use guildId for all DB calls
                    const currentAuthorData = await db.getOrCreateUser(guildId, authorId);
                    const currentTargetData = await db.getOrCreateUser(guildId, target.id);

                    if (currentAuthorData.spouse || currentTargetData.spouse) {
                        await i.followUp({ content: "L'un de vous est déjà marié(e) ! La demande est annulée.", flags: MessageFlags.Ephemeral });
                        return msg.delete();
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

                        // Fusion ou création basée sur le nom choisi
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
                    await msg.delete().catch(() => {}); // Suppression sécurisée
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await msg.delete().catch(() => {}); // Delete if timed out
                    await message.channel.send(`⌛ La demande en mariage de ${formatMention(authorId)} à ${formatMention(target.id)} a expiré.`);
                }
            });
            return;
        }

        case 'stop': {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
            await message.channel.send("Arrêt du bot...");
            process.exit(0);
        }

        case 'resetdb': {
            try {
                if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return message.channel.send({ embeds: [errorEmbed("Seuls les administrateurs peuvent réinitialiser la base de données.")] });
                }

                const resetEmbed = new EmbedBuilder()
                .setTitle("⚠️ Réinitialisation de la Base de Données")
                .setColor("#ff4757")
                .setDescription("Êtes-vous sûr de vouloir supprimer **toutes les données** (utilisateurs et familles) ?\nCette action est irréversible.");

            const resetRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_reset').setLabel('Confirmer la réinitialisation').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_reset').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.channel.send({ embeds: [resetEmbed], components: [resetRow] }); // La réponse reste
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'confirm_reset') {
                    await db.resetDatabase(guildId);
                    await i.update({ embeds: [successEmbed("La base de données de ce serveur a été entièrement réinitialisée.")], components: [] });
                } else {
                    await i.update({ embeds: [errorEmbed("Action annulée.")], components: [] });
                }
                collector.stop();
            });

            collector.on('end', (collected, reason) => { if (reason === 'time') msg.delete().catch(() => {}); });
            } catch (err) {
                console.error("Erreur resetdb:", err);
            }
            return;
        }

        case 'listfamilies': {
            try {
                const families = await db.getAllFamilies(guildId);
                const familyList = Object.values(families);

                if (familyList.length === 0) {
                    return message.channel.send({ embeds: [errorEmbed("Aucune famille n'a encore été créée sur ce serveur.")] });
                }

                // Tri alphabétique par nom
                familyList.sort((a, b) => a.familyName.localeCompare(b.familyName));

                const embed = new EmbedBuilder();
                embed
                    .setTitle(`🏰 Dynasties de ${message.guild.name}`)
                    .setColor('#5865F2')
                    .setThumbnail(message.guild.iconURL())
                    .setDescription(`Voici la liste des **${familyList.length}** familles fondées sur ce serveur :`)
                    .setTimestamp();

                const listText = familyList.map((f, i) => {
                    const date = f.createdAt ? new Date(f.createdAt).toLocaleDateString('fr-FR') : 'Inconnue';
                    return `**${i + 1}. ${f.familyName.toUpperCase()}**\n┕ 👑 Chef: ${formatMention(f.head)} | 👥 Membres: ${f.members.length} | 📅 ${date}`;
                }).join('\n\n');

                embed.setDescription(`${embed.data.description}\n\n${listText.length > 4000 ? listText.substring(0, 3997) + '...' : listText}`);

                return message.channel.send({ embeds: [embed] });
            } catch (err) {
                console.error("Erreur listfamilies:", err);
                return message.channel.send({ embeds: [errorEmbed("Impossible de récupérer la liste des familles.")] });
            }
        }

        case 'info': {
            let targetUser = target; // Cette commande ne sera pas auto-supprimée
            if (!targetUser && args[0]) {
                // Tente de récupérer l'utilisateur par ID si aucune mention n'est présente
                targetUser = client.users.cache.get(args[0]) || await client.users.fetch(args[0]).catch(() => null);
            }
            if (!targetUser) targetUser = message.author;

            const userData = await db.getOrCreateUser(guildId, targetUser.id);
            const family = userData.familyName ? await db.getFamily(guildId, userData.familyName) : null;

            const buildEmbed = () => new EmbedBuilder()
                .setTitle(`Profil Familial - ${targetUser.username}`)
                .setColor('#3498db')
                .addFields(
                    { name: '🏷️ Nom de Famille', value: userData.familyName ? userData.familyName.toUpperCase() : 'Aucun', inline: true },
                    { name: '🎭 Rang', value: family?.head === targetUser.id ? "Chef" : (userData.familyName ? "Membre" : "Aucun"), inline: true },
                    { name: '👤 Genre', value: userData.gender || 'Non défini', inline: true },
                    { name: '📝 Bio', value: userData.bio || 'Aucune bio définie.', inline: false },
                    { name: '💕 Relation', value: userData.spouse ? `Marié(e) à ${formatMention(userData.spouse)}` : (userData.couple ? `En couple avec ${formatMention(userData.couple)}` : 'Célibataire'), inline: true },
                    { name: '👨 Père', value: userData.father ? formatMention(userData.father) : 'Inconnu', inline: true },
                    { name: '👩 Mère', value: userData.mother ? formatMention(userData.mother) : 'Inconnue', inline: true }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('edit_p').setLabel('✏️ Modifier Profil').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('cancel_info').setLabel('Fermer').setStyle(ButtonStyle.Secondary)
            );
            const msg = await message.channel.send({ embeds: [buildEmbed()], components: targetUser.id === authorId ? [row] : [] });

            const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId && ['edit_p', 'cancel_info', 'sel_gen', 'btn_bio', 'btn_gender', 'btn_name', 'btn_spouse', 'back_info'].includes(i.customId), time: 60000 });
            coll.on('collect', async (i) => {
                if (i.customId === 'cancel_info') {
                    await i.deferUpdate();
                    return msg.delete().catch(() => {});
                }
                if (i.customId === 'back_info') {
                    return i.update({ content: null, embeds: [buildEmbed()], components: [row] });
                }
                if (i.customId === 'edit_p') {
                    const editRow1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_bio').setLabel('Ma Bio').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
                        new ButtonBuilder().setCustomId('btn_gender').setLabel('Mon Genre').setStyle(ButtonStyle.Secondary).setEmoji('👤')
                    );
                    const editRow2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_name').setLabel('Renommer Branche').setStyle(ButtonStyle.Secondary).setEmoji('🏷️'),
                        new ButtonBuilder().setCustomId('btn_spouse').setLabel('Nom Conjoint').setStyle(ButtonStyle.Secondary).setEmoji('💍')
                    );
                    const editRow3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('back_info').setLabel('Retour').setStyle(ButtonStyle.Danger)
                    );
                    return i.update({ content: "**Que souhaitez-vous modifier ?**", embeds: [], components: [editRow1, editRow2, editRow3] });
                }
                if (i.customId === 'btn_bio') {
                    const modal = new ModalBuilder().setCustomId('modal_bio').setTitle('Ma Bio');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bio_text').setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return i.showModal(modal);
                }
                if (i.customId === 'btn_gender') {
                    const gRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sel_gen').setPlaceholder('Genre...')
                        .addOptions([{ label: 'Masculin', value: 'masculin' }, { label: 'Féminin', value: 'féminin' }, { label: 'Autre', value: 'autre' }]));
                    return i.update({ content: "Choisissez votre genre :", components: [gRow] });
                }
                if (i.customId === 'sel_gen') {
                    await db.updateUser(guildId, authorId, { gender: i.values[0] }); // La réponse est persistante
                    return i.update({ content: "✅ Genre mis à jour.", components: [] }); 
                }
                if (i.customId === 'btn_name') {
                    const modal = new ModalBuilder().setCustomId('modal_rename_branch').setTitle('Nom de Branche');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel("Nouveau nom").setStyle(TextInputStyle.Short).setRequired(true)));
                    return i.showModal(modal);
                }
                if (i.customId === 'btn_spouse') {
                    if (!authorData.spouse) return i.reply({ content: "Pas de conjoint.", flags: MessageFlags.Ephemeral });
                    const sData = await db.getOrCreateUser(guildId, authorData.spouse);
                    if (!sData.familyName) return i.reply({ content: "Pas de nom de famille.", flags: MessageFlags.Ephemeral });
                    await db.updateUser(guildId, authorId, { familyName: sData.familyName });
                    return i.update({ content: "💍 Nom adopté !", components: [] }); // La réponse est persistante
                }
            });
            coll.on('end', () => { if (msg) msg.delete().catch(() => {}); });
            return;
        }

        case 'divorce': {
            if (!authorData.spouse) return message.reply('Tu n\'es pas marié(e).');
            const targetId = authorData.spouse;

            const confirmEmbed = new EmbedBuilder()
                .setTitle("💔 Confirmation de Divorce")
                .setColor("#ff4757")
                .setDescription(`Es-tu certain(e) de vouloir divorcer de ${formatMention(targetId)} ?\n\n*Cette action rompra vos liens officiels.*`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_divorce').setLabel('Confirmer').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_divorce').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.reply({ embeds: [confirmEmbed], components: [row] });
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorId, time: 30000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'confirm_divorce') {
                    const family = await db.getFamily(guildId, authorData.familyName);
                    if (family) {
                        // Logique de défusion : On cherche les membres qui avaient une famille d'origine différente
                        const members = await db.getUsersByIds(guildId, family.members);
                        const branches = {}; 
                        for (const m of members) {
                            if (m.previousFamily) {
                                if (!branches[m.previousFamily]) branches[m.previousFamily] = [];
                                branches[m.previousFamily].push(m.userId);
                            }
                        }

                        for (const [oldName, mIds] of Object.entries(branches)) {
                            // On recrée la famille d'origine
                            const newHead = mIds.includes(targetId) ? targetId : mIds[0];
                            await db.createFamily(guildId, oldName, newHead);
                            await db.updateFamily(guildId, oldName, { members: mIds });
                            for (const mid of mIds) {
                                await db.updateUser(guildId, mid, { familyName: oldName, previousFamily: null });
                                family.members = family.members.filter(id => id !== mid);
                            }
                        }
                        await db.updateFamily(guildId, family.familyName, { members: family.members });
                    }

                    await executeLinkChange(guildId, authorId, targetId, null, 'remove');
                    await i.update({ embeds: [successEmbed(`💔 ${formatMention(authorId)} a divorcé de ${formatMention(targetId)} !`)], components: [] });
                } else {
                    await i.update({ embeds: [errorEmbed("Divorce annulé.")], components: [] });
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                }
                collector.stop();
            });

            collector.on('end', (collected, reason) => { if (reason === 'time') msg.delete().catch(() => {}); });
            return;
        }

        case 'hug': {
            if (!target) return message.reply('Qui veux-tu câliner ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id);
            let desc = `${formatMention(authorId)} fait un gros câlin à ${formatMention(target.id)} !`;
            if (rel && rel !== 'soi-même') desc += ` ❤️ Les câlins entre **${rel}s** sont les meilleurs !`;
            if (rel === 'soi-même') desc = `Tu te fais un câlin à toi-même ? C'est mignon mais un peu solitaire !`;

            const embed = new EmbedBuilder()
                .setColor('#FFC0CB')
                .setDescription(desc)
                .setImage(getGif('hug'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'kiss': {
            if (!target) return message.reply('Qui veux-tu embrasser ?'); // La réponse est persistante
            if (authorData.spouse !== target.id) { // authorData already fetched with guildId
                return message.reply(`Désolé, mais tu ne peux embrasser que ton/ta conjoint(e) ! 💍`); // La réponse est persistante
            }
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(`💋 ${formatMention(authorId)} embrasse amoureusement ${formatMention(target.id)} !`)
                .setImage(getGif('kiss'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'pat': {
            if (!target) return message.reply('Qui veux-tu tapoter ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id); // Await async areRelated
            let desc = `${formatMention(authorId)} tapote la tête de ${formatMention(target.id)}.`;
            if (['enfant', 'parent', 'frère/soeur'].includes(rel)) {
                desc = `😊 ${formatMention(authorId)} tapote affectueusement la tête de son **${rel}**, ${formatMention(target.id)}.`;
            }
            const embed = new EmbedBuilder()
                .setColor('#87CEEB')
                .setDescription(desc)
                .setImage(getGif('pat'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'slap': {
            if (!target) return message.reply('Qui veux-tu gifler ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id); // Await async areRelated
            let desc = `💥 ${formatMention(authorId)} donne une gifle à ${formatMention(target.id)} !`;
            if (rel && rel !== 'soi-même') desc += ` Oh non, une dispute de famille entre **${rel}s** !`;
            
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription(desc)
                .setImage(getGif('slap'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'poke': {
            if (!target) return message.reply('Qui veux-tu titiller ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id); // Await async areRelated
            let desc = `${formatMention(authorId)} donne un petit coup de doigt à ${formatMention(target.id)}.`;
            if (rel && rel !== 'soi-même') desc = `👉 ${formatMention(authorId)} embête son **${rel}**, ${formatMention(target.id)} !`;

            const embed = new EmbedBuilder()
                .setColor('#98FB98')
                .setDescription(desc)
                .setImage(getGif('poke'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'tickle': {
            if (!target) return message.reply('Qui veux-tu chatouiller ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id);
            let desc = `🤣 ${formatMention(authorId)} chatouille ${formatMention(target.id)} jusqu'à ce qu'il/elle n'en puisse plus !`;
            if (rel && rel !== 'soi-même') desc += ` Les rires en famille sont précieux !`;
            const embed = new EmbedBuilder().setColor('#FFD700').setDescription(desc).setImage(getGif('tickle'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'bite': {
            if (!target) return message.reply('Qui veux-tu mordre ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id);
            let desc = `🦷 Nom ! ${formatMention(authorId)} a mordu ${formatMention(target.id)} !`;
            if (rel === 'conjoint(e)') desc = `🦷 ${formatMention(authorId)} donne un petit mordillement amoureux à ${formatMention(target.id)}...`;
            const embed = new EmbedBuilder().setColor('#8B0000').setDescription(desc).setImage(getGif('bite'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'dance': {
            if (!target) return message.reply('Avec qui veux-tu danser ?'); // La réponse est persistante
            const desc = `💃 ${formatMention(authorId)} entraîne ${formatMention(target.id)} dans une danse endiablée !`;
            const embed = new EmbedBuilder().setColor('#FF69B4').setDescription(desc).setImage(getGif('dance'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'cuddle': {
            if (!target) return message.reply('Qui veux-tu câliner ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id);
            let desc = `🧸 ${formatMention(authorId)} fait un câlin tout doux à ${formatMention(target.id)}.`;
            if (['enfant', 'parent'].includes(rel)) desc = `🧸 ${formatMention(authorId)} serre tendrement son **${rel}** contre lui.`;
            const embed = new EmbedBuilder().setColor('#DEB887').setDescription(desc).setImage(getGif('cuddle'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'highfive': {
            if (!target) return message.reply('À qui veux-tu taper m\'en cinq ?'); // La réponse est persistante
            const desc = `🙌 ${formatMention(authorId)} et ${formatMention(target.id)} se tapent m'en cinq ! Quel duo !`;
            const embed = new EmbedBuilder().setColor('#00FF7F').setDescription(desc).setImage(getGif('highfive'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }

        case 'handhold': {
            if (!target) return message.reply('À qui veux-tu tenir la main ?'); // La réponse est persistante
            const rel = await areRelated(guildId, authorId, target.id);
            let desc = `🤝 ${formatMention(authorId)} prend la main de ${formatMention(target.id)}.`;
            if (rel === 'conjoint(e)') desc = `🤝 ${formatMention(authorId)} tient amoureusement la main de ${formatMention(target.id)}.`;
            const embed = new EmbedBuilder().setColor('#F0E68C').setDescription(desc).setImage(getGif('handhold'));
            return message.reply({ embeds: [embed] }); // La réponse est persistante
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit() || !interaction.guildId) return; // S'assurer que c'est dans un serveur

    const guildId = interaction.guildId;
    
    if (interaction.customId === 'modal_create_fam') {
        try {
            // On diffère la réponse immédiatement pour éviter le timeout de 3 secondes de Discord
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const nameInput = interaction.fields.getTextInputValue('fam_name').trim();
            const name = nameInput.toLowerCase();
            console.log(`[DEBUG] Tentative de création famille: "${name}" sur serveur: ${guildId}`);

            if (await db.getFamily(guildId, name)) {
                return interaction.editReply({ content: `❌ Le nom "**${nameInput.toUpperCase()}**" est déjà utilisé sur ce serveur.` });
            }

            // Sécurité : Vérifier si l'utilisateur n'a pas déjà une famille entre temps
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

    if (interaction.customId === 'modal_bio') {
        await db.updateUser(guildId, interaction.user.id, { bio: interaction.fields.getTextInputValue('bio_text') });
        await interaction.reply({ content: "✅ Bio mise à jour !", flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'admin_modal_rename') {
        const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
        const oldName = interaction.message.embeds[0].title.split('Famille ')[1].toLowerCase();
        
        if (await db.getFamily(guildId, newName)) return interaction.reply({ content: "❌ Ce nom est déjà pris.", flags: MessageFlags.Ephemeral });
        
        const family = await db.getFamily(guildId, oldName);
        await db.createFamily(guildId, newName, family.head);
        await db.updateFamily(guildId, newName, { members: family.members, history: family.history });
        for (const mId of family.members) await db.updateUser(guildId, mId, { familyName: newName });
        await db.deleteFamily(guildId, oldName);
        await db.addFamilyLog(guildId, newName, `🏷️ Famille renommée de ${oldName.toUpperCase()} à ${newName.toUpperCase()} par un administrateur.`);
        await interaction.reply({ content: `✅ Famille renommée en **${newName.toUpperCase()}** !`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'modal_rename_branch') {
        const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().trim();
        if (await db.getFamily(guildId, newName)) return interaction.reply({ content: "❌ Nom déjà pris.", flags: MessageFlags.Ephemeral });
        const uData = await db.getOrCreateUser(guildId, interaction.user.id);
        const oldName = uData.familyName;
        const family = oldName ? await db.getFamily(guildId, oldName) : null;

        if (family?.head === interaction.user.id) {
            await db.createFamily(guildId, newName, interaction.user.id);
            await db.updateFamily(guildId, newName, { members: family.members });
            for (const mId of family.members) await db.updateUser(guildId, mId, { familyName: newName });
            await db.deleteFamily(guildId, oldName);
            await db.addFamilyLog(guildId, newName, `🏷️ Dynastie renommée de ${oldName.toUpperCase()} à ${newName.toUpperCase()} par <@${interaction.user.id}>.`);
            await interaction.reply({ content: `✅ Dynastie renommée : **${newName.toUpperCase()}** !` });
        } else {
            if (oldName && family) await db.updateFamily(guildId, oldName, { members: family.members.filter(id => id !== interaction.user.id) });
            await db.createFamily(guildId, newName, interaction.user.id);
            await db.updateUser(guildId, interaction.user.id, { familyName: newName });
            await db.addFamilyLog(guildId, newName, `🏷️ Nouvelle branche fondée : ${newName.toUpperCase()} (issue de ${oldName.toUpperCase()}).`);
            await propagateNameChange(guildId, interaction.user.id, oldName, newName);
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