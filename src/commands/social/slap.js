const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'slap',
    aliases: [],
    description: 'Giflez un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'slap', {
            noTargetMsg: 'Qui veux-tu gifler ?',
            color: '#FFA500',
            getDesc: (authorId, targetId, rel) => {
                let d = `💥 ${formatMention(authorId)} donne une gifle à ${formatMention(targetId)} !`;
                if (rel && rel !== 'soi-même') {
                    d += ` Oh non, une dispute de famille entre **${rel}s** !`;
                }
                return d;
            }
        });
    }
};
