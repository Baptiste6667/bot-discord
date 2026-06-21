const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { getGenderedRole, formatMention } = require('./helpers');
const { getExtendedFamily } = require('./familyService');
const { getUBUser } = require('./economy');

// Register font from project root
try {
    const fontPath = path.resolve(__dirname, '..', '..', 'font.ttf');
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'MyCustomFont');
        console.log(`✅ Police enregistrée (alias: MyCustomFont) depuis : ${fontPath}`);
    } else {
        console.warn(`⚠️ Fichier font.ttf introuvable à l'emplacement : ${fontPath}`);
    }
} catch (e) {
    console.error("❌ Erreur police :", e.message);
}

// Visual Tree Generator
async function generateFamilyImage(client, guildId, userId, isGlobal = false, extData = null) {
    console.log(`[DEBUG] Début génération image pour : ${userId}`);
    const userData = await db.getOrCreateUser(guildId, userId);
    const family = userData.familyName ? await db.getFamily(guildId, userData.familyName) : null;
    const ext = extData || await getExtendedFamily(guildId, userId);

    let childrenRow = (userData.children || []);
    let inviterParents = [userData.father, userData.mother].filter(p => !!p);
    
    let spouseData = userData.spouse ? await db.getOrCreateUser(guildId, userData.spouse) : null;
    let spouseParents = spouseData ? [spouseData.father, spouseData.mother].filter(p => !!p) : [];

    let parentsToDraw = [...new Set([...inviterParents, ...spouseParents])];

    let grandparentsData = [];
    for (const pId of parentsToDraw) {
        const pData = await db.getOrCreateUser(guildId, pId);
        if (pData.father) {
            grandparentsData.push({ id: pData.father, childId: pId, side: 'père' });
        }
        if (pData.mother) {
            grandparentsData.push({ id: pData.mother, childId: pId, side: 'mère' });
        }
    }

    for (const gpId of (ext.grandparents || [])) {
        if (!grandparentsData.find(g => g.id === gpId)) {
            grandparentsData.push({ id: gpId, childId: null, side: 'générique' });
        }
    }

    const siblings = isGlobal ? Array.from(ext.siblings) : [];
    let siblingsData = [];
    for (const sId of siblings) {
        const sDb = await db.getOrCreateUser(guildId, sId);
        const parentLink = parentsToDraw.find(pId => pId === sDb.father || pId === sDb.mother);
        siblingsData.push({ id: sId, parentId: parentLink || null });
    }

    const unclesAunts = isGlobal ? Array.from(ext.unclesAunts) : [];
    let unclesAuntsData = [];
    for (const uaId of unclesAunts) {
        const uaDb = await db.getOrCreateUser(guildId, uaId);
        const gpLink = grandparentsData.find(gp => gp.id === uaDb.father || gp.id === uaDb.mother);
        unclesAuntsData.push({ id: uaId, parentId: gpLink ? gpLink.id : null, side: uaDb.gender === 'féminin' ? 'mère' : 'père' });
    }

    const cousins = isGlobal ? Array.from(ext.cousins) : [];
    let cousinsData = [];
    for (const cId of cousins) {
        const cDb = await db.getOrCreateUser(guildId, cId);
        const uaLink = unclesAuntsData.find(ua => ua.id === cDb.father || ua.id === cDb.mother);
        cousinsData.push({ id: cId, parentId: uaLink ? uaLink.id : null });
    }
    
    const mainRowLength = 1 + (userData.spouse ? 2 : 0) + siblingsData.length + cousinsData.length;
    const canvasWidth = Math.max(1200, Math.max(mainRowLength, childrenRow.length) * 240);
    const hasGrandparents = grandparentsData.length > 0;
    const canvasHeight = hasGrandparents ? 800 : 600;
    const centerX = canvasWidth / 2;
    const spouseX = centerX + 300;

    const offsetY = hasGrandparents ? 150 : 0;
    const grandparentY = 130;
    const parentY = 130 + offsetY;
    const centerY = 280 + offsetY;
    const childY = 430 + offsetY;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    const drawnNodes = new Set();

    // Background
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

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
        if (drawnNodes.has(id)) return;
        drawnNodes.add(id);

        console.log(`[DEBUG] Dessin du nœud ${id} (${roleText}) à x:${x}, y:${y}`);
        
        const user = client.users.cache.get(id) || (typeof id === 'string' ? await client.users.fetch(id).catch(() => null) : null);
        const dbUser = await db.getOrCreateUser(guildId, id);
        const genderedRole = getGenderedRole(roleText, dbUser.gender);
        const name = dbUser.nickname || (user ? user.username : id)?.toString() || "Inconnu";
        const isHead = family?.head === id;
        const famName = dbUser.familyName ? dbUser.familyName.split('-famille')[0].toUpperCase() : "SANS NOM";

        fillRoundedRect(x - 95, y - 45, 190, 90, 15, isHead ? '#faa61a' : color);

        if (user) {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
            try {
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x - 50, y, 25, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, x - 75, y - 25, 50, 50);
                ctx.restore();
                
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.font = 'bold 16px "MyCustomFont", sans-serif';
                ctx.fillText(String(name).substring(0, 12), x - 15, y - 10);
                
                ctx.fillText(String((isHead ? "👑 " : "") + genderedRole), x - 15, y + 10);

                ctx.font = 'italic 11px sans-serif';
                ctx.fillStyle = '#b9bbbe';
                ctx.fillText(famName, x - 15, y + 25);
                ctx.restore();
            } catch (err) {
                console.error(`[DEBUG] Erreur chargement avatar/texte pour ${user.username}:`, err.message);
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = '16px sans-serif';
                ctx.fillText(String(name).substring(0, 15), x, y);
                ctx.restore();
            }
        } else {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = '16px sans-serif';
            ctx.fillText(String(name).substring(0, 15), x, y);
            ctx.restore();
        }
    };

    // Draw Title
    if (family) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '26px "MyCustomFont", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(isGlobal ? `VUE GLOBALE : ${family.familyName.toUpperCase()}` : `FOCUS BRANCHE : ${family.familyName.toUpperCase()}`), centerX, 45);
        ctx.restore();
    }

    // Step 1: Draw all lines first
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    if (userData.spouse) {
        ctx.beginPath(); 
        ctx.moveTo(centerX + 95, centerY); 
        ctx.lineTo(spouseX - 95, centerY); 
        ctx.stroke();
    }
    
    inviterParents.forEach((pId, i) => {
        const xPos = centerX + (i === 0 ? -110 : 110);
        ctx.beginPath(); 
        ctx.moveTo(centerX, centerY - 35); 
        ctx.lineTo(xPos, parentY + 35); 
        ctx.stroke();
    });

    spouseParents.forEach((pId, i) => {
        const xPos = spouseX + (i === 0 ? -110 : 110);
        ctx.beginPath(); 
        ctx.moveTo(spouseX, centerY - 35); 
        ctx.lineTo(xPos, parentY + 35); 
        ctx.stroke();
    });

    siblingsData.forEach((s, i) => {
        let parentX;
        if (s.parentId) {
            if (inviterParents.includes(s.parentId)) {
                const pIdx = inviterParents.indexOf(s.parentId);
                parentX = centerX + (pIdx === 0 ? -110 : 110);
            } else if (spouseParents.includes(s.parentId)) {
                const pIdx = spouseParents.indexOf(s.parentId);
                parentX = spouseX + (pIdx === 0 ? -110 : 110);
            } else {
                parentX = centerX;
            }
        } else {
            parentX = centerX;
        }
        const xPos = centerX + (i % 2 === 0 ? -220 * (Math.floor(i/2)+1) : 220 * (Math.floor(i/2)+1));
        ctx.beginPath(); 
        ctx.moveTo(parentX, parentY + 35); 
        ctx.lineTo(xPos, centerY - 35); 
        ctx.stroke();
    });

    unclesAuntsData.forEach((ua, i) => {
        let gpX, xPos;
        if (ua.parentId) {
            const gp = grandparentsData.find(g => g.id === ua.parentId);
            if (gp) {
                let parentOfX;
                if (inviterParents.includes(gp.childId)) {
                    const pIdx = inviterParents.indexOf(gp.childId);
                    parentOfX = centerX + (pIdx === 0 ? -110 : 110);
                } else if (spouseParents.includes(gp.childId)) {
                    const pIdx = spouseParents.indexOf(gp.childId);
                    parentOfX = spouseX + (pIdx === 0 ? -110 : 110);
                } else {
                    parentOfX = centerX;
                }
                gpX = parentOfX + (gp.side === 'père' ? -60 : 60);
                xPos = gpX + (i % 2 === 0 ? -120 : 120);
            } else {
                gpX = centerX;
                xPos = centerX + (i % 2 === 0 ? -450 - (Math.floor(i/2)*50) : 450 + (Math.floor(i/2)*50));
            }
        } else {
            gpX = centerX;
            xPos = centerX + (i % 2 === 0 ? -450 - (Math.floor(i/2)*50) : 450 + (Math.floor(i/2)*50));
        }
        ctx.beginPath(); 
        ctx.moveTo(gpX, grandparentY + 35); 
        ctx.lineTo(xPos, parentY - 35); 
        ctx.stroke();
    });

    if (hasGrandparents) {
        for (const gp of grandparentsData) {
            let gpX, parentX;
            if (gp.childId) { 
                if (inviterParents.includes(gp.childId)) {
                    const pIdx = inviterParents.indexOf(gp.childId);
                    parentX = centerX + (pIdx === 0 ? -110 : 110);
                } else if (spouseParents.includes(gp.childId)) {
                    const pIdx = spouseParents.indexOf(gp.childId);
                    parentX = spouseX + (pIdx === 0 ? -110 : 110);
                } else {
                    parentX = centerX;
                }
                gpX = parentX + (gp.side === 'père' ? -60 : 60);
            } else {
                parentX = centerX;
                gpX = centerX + (grandparentsData.indexOf(gp) % 2 === 0 ? -150 : 150);
            }

            ctx.beginPath();
            ctx.moveTo(parentX, parentY - 35);
            ctx.lineTo(gpX, grandparentY + 35);
            ctx.stroke();
        }
    }

    const childrenPos = [];
    const spouseId = userData.spouse;

    for (let i = 0; i < childrenRow.length; i++) {
        const childId = childrenRow[i];
        const childDb = await db.getOrCreateUser(guildId, childId);
        let targetBaseX = centerX;
        
        if (spouseId) {
            const isChildOfMe = childDb.father === userId || childDb.mother === userId;
            const isChildOfSpouse = childDb.father === spouseId || childDb.mother === spouseId;

            if (isChildOfMe && isChildOfSpouse) {
                targetBaseX = centerX + 100;
            } else if (isChildOfSpouse) {
                targetBaseX = centerX + 200;
            }
        }

        const sameParentage = childrenRow.filter((_, idx) => idx < i).length;
        const xPos = targetBaseX + (sameParentage * 20) - (childrenRow.length > 5 ? 50 : 0);
        childrenPos.push(xPos);

        let lineStartX = centerX;
        if (spouseId && (childDb.father === spouseId || childDb.mother === spouseId)) {
            lineStartX = (childDb.father === userId || childDb.mother === userId) ? centerX + 100 : centerX + 200;
        }

        ctx.beginPath(); 
        ctx.moveTo(lineStartX, centerY + 35); 
        ctx.lineTo(xPos, childY - 35); 
        ctx.stroke();
    }
    ctx.restore();

    // Step 2: Draw all nodes over top
    if (userData.spouse) await drawNode(userData.spouse, spouseX, centerY, "Conjoint(e)");
    
    for (let i = 0; i < inviterParents.length; i++) {
        const xPos = centerX + (i === 0 ? -110 : 110);
        const pData = await db.getOrCreateUser(guildId, inviterParents[i]);
        const pLabel = pData.gender === 'féminin' ? 'Mère' : (pData.gender === 'masculin' ? 'Père' : 'Parent');
        await drawNode(inviterParents[i], xPos, parentY, pLabel);
    }

    for (let i = 0; i < siblingsData.length; i++) {
        const s = siblingsData[i];
        const xPos = centerX + (i % 2 === 0 ? -220 * (Math.floor(i/2)+1) : 220 * (Math.floor(i/2)+1));
        await drawNode(s.id, xPos, centerY, "Frère/Soeur", '#95a5a6');
    }

    for (let i = 0; i < unclesAuntsData.length; i++) {
        const ua = unclesAuntsData[i];
        let xPos;
        if (ua.parentId) {
             xPos = centerX + (i % 2 === 0 ? -450 : 450); 
        } else {
             xPos = centerX + (i % 2 === 0 ? -450 - (Math.floor(i/2)*50) : 450 + (Math.floor(i/2)*50));
        }
        const uaDb = await db.getOrCreateUser(guildId, ua.id);
        const uaLabel = uaDb.gender === 'féminin' ? 'Tante' : (uaDb.gender === 'masculin' ? 'Oncle' : 'Oncle/Tante');
        await drawNode(ua.id, xPos, parentY, uaLabel, '#9b59b6');
    }

    for (let i = 0; i < cousinsData.length; i++) {
        const c = cousinsData[i];
        const offset = siblingsData.length + 1;
        const xPos = centerX + (i % 2 === 0 ? -220 * (Math.floor(i/2)+offset) : 220 * (Math.floor(i/2)+offset));
        const cDb = await db.getOrCreateUser(guildId, c.id);
        const cLabel = cDb.gender === 'féminin' ? 'Cousine' : (cDb.gender === 'masculin' ? 'Cousin' : 'Cousin(e)');
        await drawNode(c.id, xPos, centerY, cLabel, '#1abc9c');
    }

    if (hasGrandparents) {
        const drawnGPsNodes = new Set();
        for (const gp of grandparentsData) {
            if (drawnGPsNodes.has(gp.id)) continue;
            drawnGPsNodes.add(gp.id);

            let gpX, parentX;
            if (gp.childId) {
                if (inviterParents.includes(gp.childId)) {
                    const pIdx = inviterParents.indexOf(gp.childId);
                    parentX = centerX + (pIdx === 0 ? -110 : 110);
                } else if (spouseParents.includes(gp.childId)) {
                    const pIdx = spouseParents.indexOf(gp.childId);
                    parentX = spouseX + (pIdx === 0 ? -110 : 110);
                } else {
                    parentX = centerX;
                }
                gpX = parentX + (gp.side === 'père' ? -60 : 60);
            } else {
                gpX = centerX + (grandparentsData.indexOf(gp) % 2 === 0 ? -150 : 150);
            }
            
            const gpDb = await db.getOrCreateUser(guildId, gp.id);
            const gpLabel = gpDb.gender === 'féminin' ? 'Grand-mère' : (gpDb.gender === 'masculin' ? 'Grand-père' : 'Grand-parent');
            await drawNode(gp.id, gpX, grandparentY, gpLabel);
        }
    }

    for (let i = 0; i < childrenRow.length; i++) {
        await drawNode(childrenRow[i], childrenPos[i], childY, isGlobal ? "Branche" : "Enfant");
    }
    
    await drawNode(userId, centerX, centerY, "Moi", '#5865F2');

    console.log("[DEBUG] Image générée avec succès, conversion en buffer...");
    return canvas.toBuffer('image/png');
}

// Display family tree helper
async function sendFamilyDisplay(ctx, guildId, targetId, isGlobal = false) {
    const client = ctx.client;
    const targetData = await db.getOrCreateUser(guildId, targetId);
    if (!targetData.familyName) return;

    const family = await db.getFamily(guildId, targetData.familyName);
    if (!family) return;

    const ext = await getExtendedFamily(guildId, targetId);
    const [buffer, membersWealth] = await Promise.all([
        generateFamilyImage(client, guildId, targetId, isGlobal, ext),
        Promise.all((family.members || []).map(id => getUBUser(guildId, id)))
    ]);

    const totalWealth = (membersWealth || []).reduce((acc, res) => acc + (res ? res.cash : 0), 0);
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
            { name: '👨‍👩‍👧 Lignée Directe (Vue Relative)', value: `**Nom:** ${targetData.nickname || 'Aucun'}\n**Parents:** ${parentsText}\n**Enfants:** ${childrenText}`, inline: false },
            { name: '🌳 Parenté Étendue', value: `**Fratrie:** ${Array.from(ext.siblings).map(formatMention).join(', ') || 'Aucun'} | **Grands-Parents:** ${Array.from(ext.grandparents).map(formatMention).join(', ') || 'Aucun'} | **Oncles/Tantes:** ${Array.from(ext.unclesAunts).map(formatMention).join(', ') || 'Aucun'} | **Cousins:** ${Array.from(ext.cousins).map(formatMention).join(', ') || 'Aucun'}`, inline: false }
        ).setTimestamp();

    if (ctx.isChatInputCommand?.() || ctx.isButton?.() || ctx.isStringSelectMenu?.()) {
        return ctx.followUp({ embeds: [embed], files: [attachment] });
    } else {
        return ctx.channel.send({ embeds: [embed], files: [attachment] });
    }
}

module.exports = {
    generateFamilyImage,
    sendFamilyDisplay
};
