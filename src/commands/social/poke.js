const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'poke',
    aliases: [],
    description: 'Titillez un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'poke', {
            noTargetMsg: 'Qui veux-tu titiller ?',
            color: '#98FB98',
            getDesc: (authorId, targetId, rel) => {
                if (rel && rel !== 'soi-même') {
                    return `👉 ${formatMention(authorId)} embête son **${rel}**, ${formatMention(targetId)} !`;
                }
                return `${formatMention(authorId)} donne un petit coup de doigt à ${formatMention(targetId)}.`;
            }
        });
    }
};
