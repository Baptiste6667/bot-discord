const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'highfive',
    aliases: [],
    description: 'Tapez m\'en cinq avec un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'highfive', {
            noTargetMsg: 'À qui veux-tu tapez m\'en cinq ?',
            color: '#00FF7F',
            getDesc: (authorId, targetId) => `🙌 ${formatMention(authorId)} et ${formatMention(targetId)} se tapent m'en cinq ! Quel duo !`
        });
    }
};
