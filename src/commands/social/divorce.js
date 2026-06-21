const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { executeLinkChange } = require('../../utils/familyService');
const { formatMention, successEmbed, errorEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'divorce',
    aliases: [],
    description: 'Divorcez de votre conjoint actuel.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorData = await db.getOrCreateUser(guildId, authorId);

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
                const currentFamName = authorData.familyName;
                if (family) {
                    // Defusion logic
                    const members = await db.getUsersByIds(guildId, family.members);
                    const branches = {}; 
                    for (const m of members) {
                        if (m.previousFamily) {
                            if (!branches[m.previousFamily]) branches[m.previousFamily] = [];
                            branches[m.previousFamily].push(m.userId);
                        }
                    }

                    for (const [oldName, mIds] of Object.entries(branches)) {
                        const newHead = mIds.includes(targetId) ? targetId : mIds[0];
                        await db.createFamily(guildId, oldName, newHead);
                        await db.updateFamily(guildId, oldName, { members: mIds });
                        for (const mid of mIds) {
                            await db.updateUser(guildId, mid, { familyName: oldName, previousFamily: null });
                            family.members = family.members.filter(id => id !== mid);
                        }
                        await db.addFamilyLog(guildId, oldName, `💔 La famille a été restaurée suite au divorce de <@${authorId}> et <@${targetId}>.`);
                    }

                    if (family.members.length === 0) {
                        await db.deleteFamily(guildId, currentFamName);
                    } else {
                        await db.updateFamily(guildId, currentFamName, { members: family.members });
                        await db.addFamilyLog(guildId, currentFamName, `💔 Défusion partielle suite au divorce de <@${authorId}> et <@${targetId}>.`);
                    }
                }

                await executeLinkChange(guildId, authorId, targetId, null, 'remove');
                if (currentFamName) await db.addFamilyLog(guildId, currentFamName, `💔 <@${authorId}> a divorcé de ${formatMention(targetId)}.`);

                await i.update({ embeds: [successEmbed(`💔 ${formatMention(authorId)} a divorcé de ${formatMention(targetId)} !`)], components: [] });
            } else {
                await i.update({ embeds: [errorEmbed("Divorce annulé.")], components: [] });
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            }
            collector.stop();
        });

        collector.on('end', (collected, reason) => { 
            if (reason === 'time') msg.delete().catch(() => {}); 
        });
    }
};
