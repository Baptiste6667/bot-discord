const { Events } = require('discord.js');
const { PREFIX } = require('../utils/helpers');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Logged in as ${client.user.tag}`);
        console.log(`Prefix: ${PREFIX}`);
    }
};
