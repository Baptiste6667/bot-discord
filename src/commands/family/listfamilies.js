const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { getUBUser } = require('../../utils/economy');
const { errorEmbed, formatMention } = require('../../utils/helpers');

module.exports = {
    name: 'listfamilies',
    aliases: [],
    description: 'Affiche la liste des lignées actives sur le serveur classées par fortune.',
    persistent: true,
    typing: true,
    async execute(message, args) {
        const guildId = message.guild.id;
        try {
            const families = await db.getAllFamilies(guildId);
            let familyList = Object.values(families);

            // Filter and enrich with wealth, delete empty families
            const enrichedFamilies = (await Promise.all(familyList.map(async (f) => {
                if (!f.members || f.members.length === 0) {
                    await db.deleteFamily(guildId, f.familyName);
                    return null;
                }
                
                const res = await Promise.all(f.members.map(id => getUBUser(guildId, id)));
                const total = res.reduce((acc, r) => acc + (r ? r.cash : 0), 0);
                return { ...f, totalWealth: total };
            }))).filter(f => f !== null);

            if (enrichedFamilies.length === 0) {
                return message.channel.send({ embeds: [errorEmbed("Aucune lignée active n'a été trouvée.")] });
            }

            // Hierarchical grouping by root family name
            const rootLignages = {};
            enrichedFamilies.forEach(f => {
                const rootName = f.familyName.split('-')[0].toLowerCase();
                if (!rootLignages[rootName]) {
                    rootLignages[rootName] = { 
                        name: rootName, 
                        branches: [], 
                        totalWealth: 0, 
                        totalMembers: 0, 
                        mainHead: null 
                    };
                }
                
                rootLignages[rootName].branches.push(f);
                rootLignages[rootName].totalWealth += f.totalWealth;
                rootLignages[rootName].totalMembers += f.members.length;
                
                if (f.familyName === rootName) rootLignages[rootName].mainHead = f.head;
            });

            // Sort root dynasties by wealth
            const sortedRoots = Object.values(rootLignages).sort((a, b) => b.totalWealth - a.totalWealth);

            const embed = new EmbedBuilder()
                .setTitle(`🏰 Registre des Dynasties - ${message.guild.name}`)
                .setColor('#5865F2')
                .setThumbnail(message.guild.iconURL())
                .setDescription(`Voici les lignées du serveur regroupées par branches et classées par fortune totale :`)
                .setTimestamp();

            let listText = "";
            sortedRoots.slice(0, 10).forEach((root, i) => {
                const headMention = root.mainHead ? formatMention(root.mainHead) : formatMention(root.branches[0].head);
                let rootEntry = `**${i + 1}. LIGNÉE ${root.name.toUpperCase()}**\n`;
                rootEntry += `┕ 💰 **${root.totalWealth.toLocaleString()}** cr. | 👥 ${root.totalMembers} membres\n`;
                rootEntry += `┕ 👑 Chef: ${headMention}\n`;
                
                if (root.branches.length > 1 || (root.branches.length === 1 && root.branches[0].familyName !== root.name)) {
                    rootEntry += `┕ 🌿 *Branches :*\n`;
                    root.branches.sort((a, b) => b.totalWealth - a.totalWealth);
                    root.branches.forEach(b => {
                        const bName = b.familyName === root.name ? "Principale" : b.familyName.split('-').slice(1).join('-').toUpperCase();
                        rootEntry += `   • \`${bName}\` : ${b.totalWealth.toLocaleString()} cr.\n`;
                    });
                }
                listText += rootEntry + "\n";
            });

            if (sortedRoots.length > 10) {
                listText += `*... et ${sortedRoots.length - 10} autres lignées répertoriées.*`;
            }

            embed.setDescription(`${embed.data.description}\n\n${listText}`);

            return message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error("Erreur listfamilies:", err);
            return message.channel.send({ embeds: [errorEmbed("Impossible de récupérer la liste des familles.")] });
        }
    }
};
