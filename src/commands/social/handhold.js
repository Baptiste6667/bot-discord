const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'handhold',
    aliases: [],
    description: 'Tenez la main d\'un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'handhold', {
            noTargetMsg: 'À qui veux-tu tenir la main ?',
            color: '#F0E68C',
            getDesc: (authorId, targetId, rel) => {
                if (rel === 'conjoint(e)') {
                    return `🤝 ${formatMention(authorId)} tient amoureusement la main de ${formatMention(targetId)}.`;
                }
                return `🤝 ${formatMention(authorId)} prend la main de ${formatMention(targetId)}.`;
            }
        });
    }
};
