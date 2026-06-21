const { Events, PermissionFlagsBits } = require('discord.js');
const { PREFIX, errorEmbed, safeDelete } = require('../utils/helpers');

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        const client = message.client;
        if (message.author.bot || !message.content.startsWith(PREFIX)) return;
        if (!message.guild) return message.reply("Cette commande ne peut être utilisée que dans un serveur.");

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        // Find the command or its alias
        let command = client.commands.get(commandName);
        if (!command) {
            const resolvedName = client.aliases.get(commandName);
            if (resolvedName) command = client.commands.get(resolvedName);
        }

        // If it's not a recognized command, ignore
        if (!command) return;

        // Admin check
        if (command.adminOnly) {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.channel.send({ embeds: [errorEmbed("Admin uniquement.")] });
            }
        }

        // Delete user message if the command is not persistent
        if (command.persistent === false) {
            safeDelete(message);
        }

        // Send typing if requested by command definition
        if (command.typing) {
            await message.channel.sendTyping().catch(() => {});
        }

        try {
            await command.execute(message, args);
        } catch (err) {
            console.error(`Error executing command ${commandName}:`, err);
            await message.channel.send({ embeds: [errorEmbed("Une erreur est survenue lors de l'exécution de la commande.")] }).catch(() => {});
        }
    }
};
