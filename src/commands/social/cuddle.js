const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'cuddle',
    aliases: [],
    description: 'Câlinez tendrement un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'cuddle', {
            noTargetMsg: 'Qui veux-tu câliner ?',
            color: '#DEB887',
            getDesc: (authorId, targetId, rel) => {
                if (['enfant', 'parent'].includes(rel)) {
                    return `🧸 ${formatMention(authorId)} serre tendrement son **${rel}** contre lui.`;
                }
                return `🧸 ${formatMention(authorId)} fait un câlin tout doux à ${formatMention(targetId)}.`;
            }
        });
    }
};
