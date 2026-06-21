const { EmbedBuilder } = require('discord.js');
const { PREFIX } = require('../../utils/helpers');

module.exports = {
    name: 'help',
    aliases: [],
    description: 'Affiche le guide complet des commandes du bot.',
    persistent: true,
    typing: false,
    async execute(message, args) {
        const client = message.client;
        const h = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📚 Guide Complet de la Dynastie')
            .setThumbnail(client.user.displayAvatarURL())
            .setDescription(`Gérez vos lignées et votre fortune via nos dashboards interactifs !\nPréfixe : \`${PREFIX}\``)
            .addFields(
                { name: '🏠 Famille', value: `\`${PREFIX}family\` : Dashboard personnel.\n\`${PREFIX}family <Nom/ID> [global]\` : Arbre visuel.\n\`${PREFIX}listfamilies\` : Liste des familles.` },
                { name: 'ℹ️ Profil', value: `\`${PREFIX}info [@User]\` : Fiche d'identité, bio, genre et surnom sur l'arbre.` },
                { name: '💰 Économie', value: `\`${PREFIX}account\` : Fortune du foyer et classement des richesses.` },
                { name: '💍 Relations & Social', value: `\`${PREFIX}ask <@User>\` : Se mettre en couple.\n\`${PREFIX}end\` : Rompre la relation.\n\`${PREFIX}marry <@User>\` : Mariage.\n\`${PREFIX}divorce\` : Divorcer.\n\`${PREFIX}love-calc <@U1> [@U2]\` : Test de compatibilité.\n**Interactions :** \`hug\`, \`kiss\`, \`pat\`, \`slap\`, \`tickle\`, \`dance\`, \`cuddle\`, \`bite\`, \`highfive\`, \`handhold\`, \`poke\`` },
                { name: '⚙️ Administration', value: `\`${PREFIX}adminfamily <Nom>\` : Gestion forcée (Rename, Transfert, Historique).\n\`${PREFIX}admininfo <@User>\` : Modifier le profil d'un membre.\n\`${PREFIX}fh <Nom>\` : Historique d'une lignée.\n\`${PREFIX}resetdb\` : Réinitialisation complète.` }
            );
        return message.channel.send({ embeds: [h] });
    }
};
