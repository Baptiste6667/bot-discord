const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'hug',
    aliases: [],
    description: 'Faites un câlin à un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'hug', {
            noTargetMsg: 'Qui veux-tu câliner ?',
            color: '#FFC0CB',
            getDesc: (authorId, targetId, rel) => {
                if (rel === 'soi-même') {
                    return `Tu te fais un câlin à toi-même ? C'est mignon mais un peu solitaire !`;
                }
                let d = `${formatMention(authorId)} fait un gros câlin à ${formatMention(targetId)} !`;
                if (rel) {
                    d += ` ❤️ Les câlins entre **${rel}s** sont les meilleurs !`;
                }
                return d;
            }
        });
    }
};
