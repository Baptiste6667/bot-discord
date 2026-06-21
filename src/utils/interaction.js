const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { areRelated } = require('./familyService');
const { getGif, formatMention } = require('./helpers');

async function handleSocialInteraction(message, actionName, options) {
    const guildId = message.guild.id;
    const authorId = message.author.id;
    const target = message.mentions.users.first();

    if (!target) return message.reply(options.noTargetMsg || 'Qui veux-tu cibler ?');

    const rel = await areRelated(guildId, authorId, target.id);
    let desc = "";

    if (options.getDesc) {
        desc = options.getDesc(authorId, target.id, rel);
    } else {
        desc = `${formatMention(authorId)} interagit avec ${formatMention(target.id)}.`;
    }

    const embed = new EmbedBuilder()
        .setColor(options.color || '#5865F2')
        .setDescription(desc)
        .setImage(getGif(actionName));

    return message.reply({ embeds: [embed] });
}

module.exports = {
    handleSocialInteraction
};
