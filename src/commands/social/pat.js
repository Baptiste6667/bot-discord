const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'pat',
    aliases: [],
    description: 'Tapotez la tête d\'un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'pat', {
            noTargetMsg: 'Qui veux-tu tapoter ?',
            color: '#87CEEB',
            getDesc: (authorId, targetId, rel) => {
                if (['enfant', 'parent', 'frère/soeur'].includes(rel)) {
                    return `😊 ${formatMention(authorId)} tapote affectueusement la tête de son **${rel}**, ${formatMention(targetId)}.`;
                }
                return `${formatMention(authorId)} tapote la tête de ${formatMention(targetId)}.`;
            }
        });
    }
};
