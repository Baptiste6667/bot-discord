const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const { errorEmbed, successEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'resetdb',
    aliases: [],
    description: 'Réinitialise complètement la base de données du serveur.',
    persistent: false,
    typing: false,
    adminOnly: true,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;

        const resetEmbed = new EmbedBuilder()
            .setTitle("⚠️ Réinitialisation de la Base de Données")
            .setColor("#ff4757")
            .setDescription("Êtes-vous sûr de vouloir supprimer **toutes les données** (utilisateurs et familles) ?\nCette action est irréversible.");

        const resetRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_reset').setLabel('Confirmer la réinitialisation').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_reset').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
        );

        const msg = await message.channel.send({ embeds: [resetEmbed], components: [resetRow] });
        const collector = msg.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== authorId) return i.reply({ content: "❌ Action réservée à l'administrateur.", flags: MessageFlags.Ephemeral });
            
            if (i.customId === 'confirm_reset') {
                await db.resetDatabase(guildId);
                await i.update({ embeds: [successEmbed("La base de données de ce serveur a été entièrement réinitialisée.")], components: [] });
            } else {
                await i.update({ embeds: [errorEmbed("Action annulée.")], components: [] });
            }
            collector.stop();
        });

        collector.on('end', (collected, reason) => { 
            if (reason === 'time') msg.delete().catch(() => {}); 
        });
    }
};
