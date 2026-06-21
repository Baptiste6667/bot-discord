const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const { executeLinkChange } = require('../../utils/familyService');
const { formatMention, successEmbed, errorEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'end',
    aliases: [],
    description: 'Met fin à votre relation de couple actuelle.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorData = await db.getOrCreateUser(guildId, authorId);

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
    }
};
