const infoCommand = require('./info');

module.exports = {
    name: 'admininfo',
    aliases: [],
    description: 'Permet à un administrateur d\'afficher et modifier le profil d\'un membre.',
    persistent: true,
    typing: true,
    adminOnly: true,
    async execute(message, args) {
        return infoCommand.execute(message, args, true);
    }
};
