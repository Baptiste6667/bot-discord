const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'bite',
    aliases: [],
    description: 'Mordez un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'bite', {
            noTargetMsg: 'Qui veux-tu mordre ?',
            color: '#8B0000',
            getDesc: (authorId, targetId, rel) => {
                if (rel === 'conjoint(e)') {
                    return `🦷 ${formatMention(authorId)} donne un petit mordillement amoureux à ${formatMention(targetId)}...`;
                }
                return `🦷 Nom ! ${formatMention(authorId)} a mordu ${formatMention(targetId)} !`;
            }
        });
    }
};
