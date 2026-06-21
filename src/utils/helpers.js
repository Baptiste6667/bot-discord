const { EmbedBuilder } = require('discord.js');

const PREFIX = process.env.PREFIX || ',';

// Mapping for automatic gender update according to role
const GENDER_ROLES = {
    'père': 'masculin', 'mère': 'féminin',
    'mari': 'masculin', 'femme': 'féminin',
    'frère': 'masculin', 'soeur': 'féminin',
    'oncle': 'masculin', 'tante': 'féminin',
    'cousin': 'masculin', 'cousine': 'féminin',
    'grand-père': 'masculin', 'grand-mère': 'féminin'
};

const ROLES_LIST = [
    'père', 'mère', 'enfant', 'frère', 'soeur', 
    'oncle', 'tante', 'cousin', 'cousine',
    'grand-père', 'grand-mère'
];

/** --- GENDER ADJUSTMENT --- **/
function getGenderedRole(role, gender) {
    if (!gender) return role;
    const mapping = {
        'père': { 'féminin': 'mère' },
        'mère': { 'masculin': 'père' },
        'frère': { 'féminin': 'soeur' },
        'soeur': { 'masculin': 'frère' },
        'oncle': { 'féminin': 'tante' },
        'tante': { 'masculin': 'oncle' },
        'cousin': { 'féminin': 'cousine' },
        'cousine': { 'masculin': 'cousin' },
        'grand-père': { 'féminin': 'grand-mère' },
        'grand-mère': { 'masculin': 'grand-père' }
    };
    return mapping[role.toLowerCase()]?.[gender] || role.toLowerCase();
}

/** --- UTILITIES --- **/
const formatMention = (id) => `<@${id}>`;
const errorEmbed = (text) => new EmbedBuilder().setColor('#ff4757').setDescription(`❌ ${text}`);
const successEmbed = (text) => new EmbedBuilder().setColor('#2ed573').setDescription(`✅ ${text}`);
const safeDelete = (msg) => msg && typeof msg.delete === 'function' ? msg.delete().catch(() => {}) : null;
const autoDelete = (msg, time = 30000) => setTimeout(() => safeDelete(msg), time);

const getGif = (action) => {
    const gifs = GIF_LIBRARY[action];
    if (!gifs) return null;
    return Array.isArray(gifs) ? gifs[Math.floor(Math.random() * gifs.length)] : gifs;
};

/** --- GIFS LIBRARY --- **/
const GIF_LIBRARY = {
    marry_accept: [
        'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHYzeXN6bmN6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/m9SULzJXS6lRhRmB4o/giphy.gif',
        'https://klipy.com/gifs/marriage-cat--k01KQQ25G60PRC4V9NWH0VYZ45E',
        'https://klipy.com/gifs/just-married-nibbles-1--k01KQQ28YQ5N1C0Q0YXGTHHKKJX'
    ],
    marry_decline: [
        'https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif',
        'https://klipy.com/gifs/news-what--k01KQQ2GVV81DCCT3ZK28YKQV88',
        'https://klipy.com/gifs/pickachu-cute--k01KQQ2CN4K87CE47HG6P20BP19'
    ],
    ask_accept: ['https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHpueG8ycWV6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6ZWZ6NXFpZWhqbjF6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/6YfMIn9680i9G/giphy.gif'],
    ask_decline: ['https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif'],
    end_rel: ['https://media.giphy.com/media/7T33BLlB7NQrjozoRB/giphy.gif'],
    hug: [
        'https://media.giphy.com/media/u9B3S2ArX9X5S/giphy.gif',
        'https://media.giphy.com/media/3M4NpbLCTxBqU/giphy.gif',
        'https://media.giphy.com/media/wnXz0N0iS3fHy/giphy.gif'
    ],
    kiss: [
        'https://media.giphy.com/media/G3va31WfEKhS8/giphy.gif',
        'https://media.giphy.com/media/K7YvY29Xh7hD2/giphy.gif',
        'https://media.giphy.com/media/119i1S6Wp4sh56/giphy.gif'
    ],
    pat: [
        'https://media.giphy.com/media/ARSp9T7wwxNcs/giphy.gif',
        'https://media.giphy.com/media/5tmRh1obzf3fW/giphy.gif',
        'https://media.giphy.com/media/ye7OTLw6EAsA8/giphy.gif'
    ],
    slap: [
        'https://media.giphy.com/media/uG3lKscP9lE1W/giphy.gif',
        'https://media.giphy.com/media/Zau0yrl17uzdEXqzjZ/giphy.gif',
        'https://media.giphy.com/media/Gf3AUz3eBNbTW/giphy.gif'
    ],
    poke: ['https://media.giphy.com/media/1X7Ag3SAsZ2Gk/giphy.gif', 'https://media.giphy.com/media/3YZ7A9hU8wTLO/giphy.gif'],
    tickle: ['https://media.giphy.com/media/v0reFosH7N8m4/giphy.gif', 'https://media.giphy.com/media/3v9yqZat2O7XW/giphy.gif'],
    bite: ['https://media.giphy.com/media/O9HeC68S69hPa/giphy.gif', 'https://media.giphy.com/media/vUrwX6Gv6vS6s/giphy.gif'],
    dance: ['https://media.giphy.com/media/1082yS2HMbLMSQ/giphy.gif', 'https://media.giphy.com/media/UptY0pDk48n0A/giphy.gif'],
    cuddle: ['https://media.giphy.com/media/lrr96YS85KkNi/giphy.gif', 'https://media.giphy.com/media/49mdjsMrH7oze/giphy.gif'],
    highfive: ['https://media.giphy.com/media/26ufgSwMRqauQWqL6/giphy.gif', 'https://media.giphy.com/media/5SByS3mRz5r2M/giphy.gif'],
    handhold: ['https://media.giphy.com/media/6YfMIn9680i9G/giphy.gif', 'https://media.giphy.com/media/YvMsc7zUvVfMc/giphy.gif']
};

module.exports = {
    PREFIX,
    GENDER_ROLES,
    ROLES_LIST,
    getGenderedRole,
    formatMention,
    errorEmbed,
    successEmbed,
    safeDelete,
    autoDelete,
    getGif,
    GIF_LIBRARY
};
