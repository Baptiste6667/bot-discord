const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { errorEmbed } = require('../../utils/helpers');

module.exports = {
    name: 'love-calc',
    aliases: [],
    description: 'Calcule la compatibilité amoureuse entre deux membres.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const guildId = message.guild.id;
        const PREFIX = process.env.PREFIX || ',';
        
        let u1, u2;
        const mentions = message.mentions.users;
        if (mentions.size === 0) return message.reply({ embeds: [errorEmbed(`Usage: ${PREFIX}love-calc <@User1> [@User2]`)] });
        if (mentions.size === 1) { 
            u1 = message.author; 
            u2 = mentions.first(); 
        } else { 
            const iter = mentions.values(); 
            u1 = iter.next().value; 
            u2 = iter.next().value; 
        }
        if (u1.id === u2.id) return message.reply("L'algorithme nécessite deux entités distinctes !");

        const u1Data = await db.getOrCreateUser(guildId, u1.id);
        const u2Data = await db.getOrCreateUser(guildId, u2.id);

        // Reduction Algorithm
        const name1 = u1.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const name2 = u2.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const idSalt = (parseInt(u1.id.slice(-3)) + parseInt(u2.id.slice(-3))).toString();
        const combined = name1 + name2 + idSalt;
        
        const counts = [];
        const seen = new Set();
        for (const char of combined) {
            if (!seen.has(char)) {
                seen.add(char);
                const count = combined.split(char).length - 1;
                counts.push(count);
            }
        }

        let sequence = [...counts];
        while (sequence.length > 2) {
            const nextStep = [];
            let left = 0;
            let right = sequence.length - 1;

            while (left <= right) {
                if (left === right) {
                    nextStep.push(sequence[left]);
                } else {
                    const sum = sequence[left] + sequence[right];
                    if (sum >= 10) {
                        nextStep.push(Math.floor(sum / 10));
                        nextStep.push(sum % 10);
                    } else {
                        nextStep.push(sum);
                    }
                }
                left++;
                right--;
            }
            sequence = nextStep;
        }

        let score = parseInt(sequence.join('')) || 0;

        // Context bonuses
        if (u1Data.spouse === u2.id || u1Data.couple === u2.id) score += 10;
        if (u1Data.familyName && u1Data.familyName === u2Data.familyName) score += 5;
        
        score = Math.min(100, score);
        
        let comment = "";
        let color = "#747d8c";

        if (score === 100) {
            comment = "⚡ **ALERTE NUCLÉAIRE : 100% !** Vous êtes soit des clones, soit vous avez hacké mon code. C'est flippant, marriez-vous tout de suite !";
            color = "#ff0000";
        } else if (score >= 90) {
            comment = "🔥 **C'est l'amour atomique !** Préparez les faire-part, le gâteau et le labrador. Le serveur n'est pas prêt pour autant de love.";
            color = "#ff4757";
        } else if (score >= 80) {
            comment = "💎 **Un duo de choc !** Le destin a fait du bon boulot (ou vous avez triché sur vos pseudos). Vous brillez plus qu'un diamant poli.";
            color = "#ff6b81";
        } else if (score >= 60) {
            comment = "🌈 **Y'a du potentiel !** Vous pourriez survivre à un dîner de famille sans vous jeter les fourchettes au visage. C'est déjà beau.";
            color = "#ffa502";
        } else if (score >= 40) {
            comment = "🛋️ **La Zone de Confort.** C'est stable, comme un vieux canapé : pas très excitant, mais on s'y sent bien (ou alors c'est la friendzone).";
            color = "#eccc68";
        } else if (score >= 20) {
            comment = "🌵 **Aïe.** À ce stade, même une plante verte a plus d'affinités avec vous. Va falloir ramer très fort pour faire avancer le bateau.";
            color = "#f1c40f";
        } else {
            comment = "🛑 **ZONE DE DANGER.** Même l'eau et l'huile s'entendent mieux que vous. L'algorithme suggère de rester à au moins 5 km de distance.";
            color = "#747d8c";
        }

        const bar = "❤️".repeat(Math.floor(score / 10)) + "🖤".repeat(10 - Math.floor(score / 10));

        const loveEmbed = new EmbedBuilder()
            .setTitle("🔬 Rapport d'Expertise en Compatibilité")
            .setColor(color)
            .setThumbnail("https://media.giphy.com/media/l41lTfuxV6Zoopow8/giphy.gif")
            .setDescription(`Analyse probabiliste pour **${u1.username}** et **${u2.username}**.`)
            .addFields(
                { name: "📊 Résultat du Scan", value: `**${score}%**\n${bar}`, inline: false },
                { name: "💬 Conclusion du Bot", value: comment, inline: false },
                { name: "📉 Données Techniques", value: `• Affinité Nominale: ${((score * 7) % 31 + 60)}%\n• Résonance ID: ${((score * 13) % 41 + 50)}%\n• Bonus de Relation: ${u1Data.spouse === u2.id ? "Activé (Mariage)" : (u1Data.couple === u2.id ? "Activé (Couple)" : "Aucun")}`, inline: false }
            )
            .setFooter({ text: "Moteur analytique Dynastie v3.1.0" })
            .setTimestamp();

        return message.channel.send({ embeds: [loveEmbed] });
    }
};
