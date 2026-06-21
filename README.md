# 🏰 Bot Discord Dynastie / Famille

Un bot Discord interactif permettant aux utilisateurs de fonder des familles (dynasties), gérer des relations, voir leur arbre généalogique sous forme d'image générée en temps réel, et suivre l'économie familiale.

## 🚀 Fonctionnalités
- **🏠 Gestion de Dynastie** : Fondez une famille, invitez des membres, gérez les rôles (père, mère, enfant, oncle, tante, etc.).
- **🌳 Arbre Généalogique Visuel** : Génération en temps réel de votre arbre généalogique au format PNG.
- **💰 Économie** : Intégration optionnelle avec l'API UnbelievaBoat pour suivre et classer la fortune des dynasties.
- **💍 Relations & Social** : Couple, mariage (fusion de lignées), divorce, et 11 types de commandes d'interaction animées (hug, kiss, slap, tickle, dance...).
- **⚙️ Administration** : Commandes pour renommer, modifier ou forcer la dissolution de lignées si nécessaire.

## 📁 Architecture du projet
Le projet a été restructuré pour être modulaire, propre et facile à maintenir :
```
bot-discord-main/
├── src/
│   ├── index.js                  # Point d'entrée principal
│   ├── keep_alive.js             # Maintien en vie (serveur HTTP)
│   ├── database/
│   │   └── db.js                 # Couche d'accès à MongoDB
│   ├── events/                   # Gestionnaires d'événements Discord.js
│   │   ├── ready.js
│   │   ├── messageCreate.js
│   │   └── interactionCreate.js
│   ├── utils/                    # Utilitaires & APIs externes
│   │   ├── helpers.js
│   │   ├── canvas.js             # Dessin de l'arbre généalogique
│   │   ├── economy.js            # API UnbelievaBoat
│   │   ├── interaction.js        # Modèle des commandes sociales animées
│   │   └── familyService.js      # Logique métier des familles
│   └── commands/                 # Fichiers de commandes modulaires
│       ├── admin/
│       ├── family/
│       ├── general/
│       └── social/
├── .env.example                  # Template pour les variables d'environnement
├── .gitignore                    # Fichiers ignorés par Git
├── font.ttf                      # Police personnalisée pour les arbres (optionnelle)
└── package.json                  # Dépendances & scripts de démarrage
```

## 🛠️ Installation & Configuration

1. Clonez ce dépôt.
2. Installez les dépendances :
   ```bash
   npm install
   ```
3. Créez un fichier `.env` basé sur `.env.example` et remplissez vos informations :
   ```env
   DISCORD_TOKEN=votre_token_discord
   MONGODB_URI=votre_connexion_mongodb
   PREFIX=,
   UNBELIEVABOAT_TOKEN=votre_token_unbelievaboat (optionnel)
   ```
4. Démarrez le bot :
   ```bash
   npm start
   ```
