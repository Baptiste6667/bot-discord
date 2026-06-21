module.exports = {
    name: 'stop',
    aliases: [],
    description: 'Arrête le bot (Admin uniquement).',
    persistent: false,
    typing: false,
    adminOnly: true,
    async execute(message, args) {
        await message.channel.send("Arrêt du bot...");
        process.exit(0);
    }
};
