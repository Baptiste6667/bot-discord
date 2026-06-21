const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'dance',
    aliases: [],
    description: 'Dansez avec un membre.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        return handleSocialInteraction(message, 'dance', {
            noTargetMsg: 'Avec qui veux-tu danser ?',
            color: '#FF69B4',
            getDesc: (authorId, targetId) => `💃 ${formatMention(authorId)} entraîne ${formatMention(targetId)} dans une danse endiablée !`
        });
    }
};
