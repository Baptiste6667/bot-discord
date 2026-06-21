const db = require('../../database/db');
const { handleSocialInteraction } = require('../../utils/interaction');
const { formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'kiss',
    aliases: [],
    description: 'Embrassez votre conjoint(e).',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Qui veux-tu embrasser ?');

        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorData = await db.getOrCreateUser(guildId, authorId);

        if (authorData.spouse !== target.id) {
            return message.reply(`Désolé, mais tu ne peux embrasser que ton/ta conjoint(e) ! 💍`);
        }

        return handleSocialInteraction(message, 'kiss', {
            noTargetMsg: 'Qui veux-tu embrasser ?',
            color: '#FF0000',
            getDesc: (authorId, targetId) => `💋 ${formatMention(authorId)} embrasse amoureusement ${formatMention(targetId)} !`
        });
    }
};
