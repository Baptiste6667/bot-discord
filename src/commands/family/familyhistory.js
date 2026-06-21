const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { errorEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'familyhistory',
    aliases: ['fh'],
    description: 'Affiche l\'historique des événements de votre lignée ou d\'une autre (Admin uniquement).',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorData = await db.getOrCreateUser(guildId, authorId);

        let familyNameArg = args.join(' ');
        let family;

        if (familyNameArg) {
            // Admin mode: inspect specific family by name
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply({ embeds: [errorEmbed("Seuls les administrateurs peuvent consulter l'historique d'une autre famille via son nom.")] });
            }
            family = await db.getFamily(guildId, familyNameArg.toLowerCase());
            if (!family) {
                return message.reply({ embeds: [errorEmbed(`La famille "**${familyNameArg.toUpperCase()}**" n'existe pas sur ce serveur.`)] });
            }
        } else {
            // User mode: view own family
            if (!authorData.familyName) {
                return message.reply({ embeds: [errorEmbed("Vous n'avez pas de famille. Utilisez ,family pour en créer une.")] });
            }
            family = await db.getFamily(guildId, authorData.familyName);
            if (!family) {
                return message.reply({ embeds: [errorEmbed("Erreur : Impossible de charger les données de votre famille.")] });
            }
        }

        const historyEntries = family.history || [];
        const historyEmbed = new EmbedBuilder()
            .setTitle(`📜 Histoire des ${family.familyName.toUpperCase()}`)
            .setColor('#f1c40f')
            .setDescription(historyEntries.map(h => `• [${new Date(h.date).toLocaleDateString('fr-FR')}] ${h.action}`).reverse().join('\n') || "Aucun événement enregistré dans les annales.")
            .setTimestamp();

        return message.channel.send({ embeds: [historyEmbed] });
    }
};
