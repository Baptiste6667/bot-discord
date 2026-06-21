const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./database/db');

require('./keep_alive.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Map();
client.aliases = new Map();

// Recursive command loader
function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            const command = require(fullPath);
            if (command.name) {
                client.commands.set(command.name.toLowerCase(), command);
                if (command.aliases && Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
                    }
                }
            }
        }
    }
}

// Event loader
function loadEvents(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            loadEvents(fullPath);
        } else if (file.endsWith('.js')) {
            const event = require(fullPath);
            if (event.name) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                }
            }
        }
    }
}

async function start() {
    // 1. Connect to Database
    await db.connectDB();

    // 2. Load Commands
    loadCommands(path.join(__dirname, 'commands'));
    console.log(`Loaded ${client.commands.size} commands.`);

    // 3. Load Events
    loadEvents(path.join(__dirname, 'events'));
    console.log("Registered events.");

    // 4. Client Login
    const token = process.env.DISCORD_TOKEN;
    if (!token || token.trim() === "") {
        console.error("❌ ERREUR : Le DISCORD_TOKEN est manquant ou vide dans le fichier .env.");
        process.exit(1);
    }

    try {
        await client.login(token);
    } catch (err) {
        if (err.code === 'TokenInvalid' || err.message?.includes('token')) {
            console.error("❌ ERREUR : Le token Discord est invalide.");
        } else {
            console.error("❌ Impossible de se connecter à Discord :", err);
        }
        process.exit(1);
    }
}

start();
