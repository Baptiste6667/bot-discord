const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { getUBUser } = require('../../utils/economy');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'account',
    aliases: ['familytop'],
    description: 'Affiche la fortune de votre foyer ou le classement des lignées les plus riches.',
    persistent: true,
    typing: true,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorData = await db.getOrCreateUser(guildId, authorId);
        const command = message.content.slice(1).trim().split(/\s+/)[0].toLowerCase(); // Can be account or familytop

        const showWealth = async (gId, uId, uData) => {
            const members = [uId];
            if (uData.spouse) members.push(uData.spouse);
            (uData.children || []).forEach(id => members.push(id));
            const results = await Promise.all(members.map(id => getUBUser(gId, id)));
            const total = results.reduce((acc, res) => acc + (res ? res.cash : 0), 0);
            return new EmbedBuilder()
                .setTitle('🏦 Banque Familiale')
                .setColor('#f1c40f')
                .addFields({ name: 'Fortune Totale', value: `💰 **${total.toLocaleString()}** cr.`, inline: false });
        };

        const showTop = async (gId) => {
            const familyWealths = [];
            const families = await db.getAllFamilies(gId);
            
            for (const fam of Object.values(families)) {
                const members = fam.members;
                const res = await Promise.all(members.map(id => getUBUser(gId, id)));
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
        
        const msg = await message.reply({ embeds: [initialEmbed], components: [row] });
        const coll = msg.createMessageComponentCollector({ time: 30000 });

        coll.on('collect', async (i) => {
            if (i.user.id !== authorId) return i.reply({ content: "❌ Seul l'invocateur peut consulter sa fortune ici.", flags: MessageFlags.Ephemeral });
            if (i.customId === 'cancel_bank') return i.message.delete().catch(() => {});
            await i.deferUpdate();
            const newEmbed = (i.customId === 'v_top') ? await showTop(guildId) : await showWealth(guildId, authorId, authorData);
            await i.editReply({ embeds: [newEmbed] });
        });
    }
};
