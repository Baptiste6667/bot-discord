const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'tickle',
    aliases: [],
    description: 'Chatouillez un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'tickle', {
            noTargetMsg: 'Qui veux-tu chatouiller ?',
            color: '#FFD700',
            getDesc: (authorId, targetId, rel) => {
                let d = `🤣 ${formatMention(authorId)} chatouille ${formatMention(targetId)} jusqu'à ce qu'il/elle n'en puisse plus !`;
                if (rel && rel !== 'soi-même') {
                    d += ` Les rires en famille sont précieux !`;
                }
                return d;
            }
        });
    }
};
