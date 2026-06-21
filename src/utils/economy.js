const axios = require('axios');

const ubApi = axios.create({
    baseURL: 'https://unbelievaboat.com/api/v1',
    headers: { 
        'Authorization': process.env.UNBELIEVABOAT_TOKEN,
        'Accept': 'application/json'
    }
});

async function getUBUser(guildId, userId) {
    if (!process.env.UNBELIEVABOAT_TOKEN || process.env.UNBELIEVABOAT_TOKEN.trim() === "") return null;
    try {
        const res = await ubApi.get(`/guilds/${guildId}/users/${userId}`);
        return res.data;
    } catch (e) { 
        console.error(`Erreur API UnbelievaBoat pour l'utilisateur ${userId}:`, e.response?.status || e.message);
        return null; 
    }
}

async function updateUBBalance(guildId, userId, cashDelta) {
    if (!process.env.UNBELIEVABOAT_TOKEN || process.env.UNBELIEVABOAT_TOKEN.trim() === "") return false;
    try {
        await ubApi.patch(`/guilds/${guildId}/users/${userId}`, { cash: cashDelta });
        return true;
    } catch (e) { 
        console.error(`Erreur mise à jour balance UnbelievaBoat pour l'utilisateur ${userId}:`, e.response?.status || e.message);
        return false; 
    }
}

module.exports = {
    getUBUser,
    updateUBBalance
};
