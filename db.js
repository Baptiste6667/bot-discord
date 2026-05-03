const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
let usersCollection;
let familiesCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(); // Connects to the database specified in the URI (e.g., familyBotDB)
    usersCollection = db.collection('users');
    familiesCollection = db.collection('families');

    // Création d'index pour booster les performances multi-guilde
    await usersCollection.createIndex({ guildId: 1 });
    await familiesCollection.createIndex({ guildId: 1 });

    console.log("🎉 Connecté à MongoDB Atlas !");
  } catch (error) {
    console.error("❌ Erreur de connexion à MongoDB Atlas :", error);
    process.exit(1); // Arrête le bot si la connexion échoue
  }
}

async function getOrCreateUser(guildId, userId) {
  const compositeId = `${guildId}_${userId}`;
  const defaults = {
    spouse: null,
    children: [],
    mother: null,
    father: null,
    customLinks: {},
    familyName: null,
    previousFamily: null,
    couple: null,
    bio: "",
    gender: null,
    nickname: null
  };

  let user = await usersCollection.findOne({ _id: compositeId });
  
  if (!user) {
    user = { _id: compositeId, guildId, userId, ...defaults };
    await usersCollection.insertOne(user);
  } else {
    // Si l'utilisateur existe, on fusionne ses données avec les valeurs par défaut pour s'assurer que tous les champs sont présents
    user = { ...defaults, ...user };
  }
  return user;
}

async function getUsersByIds(guildId, userIds) {
  if (!userIds || userIds.length === 0) return [];
  const compositeIds = userIds.map(id => `${guildId}_${id}`);
  const users = await usersCollection.find({ _id: { $in: compositeIds } }).toArray();
  return users;
}

async function updateUser(guildId, userId, updateFields) {
  await usersCollection.updateOne({ _id: `${guildId}_${userId}` }, { $set: updateFields });
}

async function getAllUsers(guildId) {
  return (await usersCollection.find({ guildId }).toArray()).reduce((acc, user) => {
    acc[user.userId] = user;
    return acc;
  }, {});
}

async function getFamily(guildId, familyName) {
  if (!familyName) return null;
  return familiesCollection.findOne({ _id: `${guildId}_${familyName.toLowerCase()}` });
}

async function createFamily(guildId, familyName, headId) {
  const compositeId = `${guildId}_${familyName.toLowerCase()}`;
  const family = {
    _id: compositeId,
    guildId,
    familyName: familyName.toLowerCase(),
    head: headId,
    members: [headId],
    createdAt: new Date(),
    history: [{ action: `Famille créée par <@${headId}>`, date: new Date() }]
  };
  await familiesCollection.insertOne(family);
  return family;
}

async function resetDatabase(guildId) {
  await usersCollection.deleteMany({ guildId });
  await familiesCollection.deleteMany({ guildId });
}

async function updateFamily(guildId, familyName, updateFields) {
  await familiesCollection.updateOne({ _id: `${guildId}_${familyName.toLowerCase()}` }, { $set: updateFields });
}

async function deleteFamily(guildId, familyName) {
  await familiesCollection.deleteOne({ _id: `${guildId}_${familyName.toLowerCase()}` });
}

async function getAllFamilies(guildId) {
  return (await familiesCollection.find({ guildId }).toArray()).reduce((acc, family) => {
    acc[family.familyName] = family;
    return acc;
  }, {});
}

// New function to merge two families
async function mergeFamilies(guildId, inviterFamilyName, invitedFamilyName, inviterId, invitedId, role) {
    const inviterFamily = await familiesCollection.findOne({ _id: `${guildId}_${inviterFamilyName.toLowerCase()}` });
    const invitedFamily = await familiesCollection.findOne({ _id: `${guildId}_${invitedFamilyName.toLowerCase()}` });

    if (!inviterFamily || !invitedFamily) {
        console.error("Attempted to merge non-existent families.");
        return;
    }

    // On crée un nom de branche pour préserver l'identité (ex: Smith-Jones)
    // Si la famille invitée est déjà une sous-branche de l'inviteur, on ne change pas son nom
    // Sinon, on crée une nouvelle sous-branche
    let subBranchName = invitedFamilyName.toLowerCase();
    if (!invitedFamilyName.startsWith(inviterFamilyName.toLowerCase())) {
        subBranchName = `${inviterFamilyName}-${invitedFamilyName}`.toLowerCase();
    }

    // Add all members of the invited family to the inviter's family
    for (const memberId of invitedFamily.members) {
        if (!inviterFamily.members.includes(memberId)) {
            inviterFamily.members.push(memberId);
        }
        // Les membres rejoignent la grande famille sous le nom de leur branche spécifique
        await updateUser(guildId, memberId, { familyName: subBranchName, previousFamily: invitedFamilyName.toLowerCase() });
    }
    await updateFamily(guildId, inviterFamilyName, { members: inviterFamily.members });

    // Gestion des sous-branches existantes de la famille invitée (si elle n'est pas déjà une sous-branche)
    if (!invitedFamilyName.startsWith(inviterFamilyName.toLowerCase())) {
        const branches = await familiesCollection.find({ 
            guildId, 
            familyName: { $regex: new RegExp(`^${invitedFamilyName}`, 'i') } 
        }).toArray();

        for (const branch of branches) {
            const newBranchName = branch.familyName.replace(new RegExp(`^${invitedFamilyName}`, 'i'), subBranchName); // Replace root part
            const newBranchId = `${guildId}_${newBranchName.toLowerCase()}`;
            
            await familiesCollection.deleteOne({ _id: branch._id });
            await familiesCollection.insertOne({
                ...branch,
                _id: newBranchId,
                familyName: newBranchName.toLowerCase()
            });

            for (const mId of branch.members) {
                await updateUser(guildId, mId, { familyName: newBranchName.toLowerCase() });
            }
        }
    }

    const inviter = await getOrCreateUser(guildId, inviterId);
    const invited = await getOrCreateUser(guildId, invitedId);

    if (['oncle', 'tante', 'cousin', 'cousine'].includes(role.toLowerCase())) {
        // La cible devient le frère/soeur d'un des parents de l'inviteur
        const parentId = inviter.father || inviter.mother;
        if (parentId) {
            const pData = await getOrCreateUser(guildId, parentId);
            if (pData && (pData.father || pData.mother)) {
                // On donne à l'invité les mêmes parents que le parent de l'inviteur (les grands-parents)
                await updateUser(guildId, invitedId, { father: pData.father, mother: pData.mother });
                const gps = [pData.father, pData.mother].filter(g => g !== null);
                for (const gpId of gps) {
                    const gpData = await getOrCreateUser(guildId, gpId);
                    if (gpData && !gpData.children.includes(invitedId)) {
                        gpData.children.push(invitedId);
                        await updateUser(guildId, gpId, { children: gpData.children });
                    }
                }
            }
        }
    } else if (role === 'frère' || role === 'soeur') {
        // La cible partage les mêmes parents que l'inviteur
        if (inviter.father || inviter.mother) {
            await updateUser(guildId, invitedId, { father: inviter.father, mother: inviter.mother });
            const ps = [inviter.father, inviter.mother].filter(p => p !== null);
            for (const pId of ps) {
                const pData = await getOrCreateUser(guildId, pId);
                if (pData && !pData.children.includes(invitedId)) {
                    pData.children.push(invitedId);
                    await updateUser(guildId, pId, { children: pData.children });
                }
            }
        }
    } else if (role === 'grand-père' || role === 'grand-mère') {
        // La cible devient le parent d'un des parents de l'inviteur
        // S'il y a deux parents, on en choisit un au hasard (simulant le côté paternel/maternel)
        const possibleParents = [inviter.father, inviter.mother].filter(p => p !== null);
        const parentId = possibleParents[Math.floor(Math.random() * possibleParents.length)];
        
        if (parentId) {
            const pData = await getOrCreateUser(guildId, parentId);
            if (pData) {
                const field = (role === 'grand-père') ? 'father' : 'mother';
                await updateUser(guildId, parentId, { [field]: invitedId, previousFamily: invitedFamilyName });
            }
            if (invited && !invited.children.includes(parentId)) {
                invited.children.push(parentId);
                await updateUser(guildId, invitedId, { children: invited.children });
            }
        }
    }

    // Remove the invited family
    await deleteFamily(guildId, invitedFamilyName);
}

async function clearUserFamilyLinksDB(guildId, userId) {
  const userData = await getOrCreateUser(guildId, userId);

  if (userData.familyName) {
    const familyName = userData.familyName;
    const family = await getFamily(guildId, userData.familyName);
    if (family) {
      family.members = family.members.filter(id => id !== userId);
      
      // Enregistrement du départ dans l'historique
      await addFamilyLog(guildId, familyName, `<@${userId}> a quitté ou a été retiré de la famille.`);

      if (family.head === userId) {
        if (family.members.length === 0) {
          await deleteFamily(guildId, family.familyName);
        } else {
            // Logique de succession optimisée
            const membersData = await getUsersByIds(guildId, family.members);
            const potentialHeads = membersData
                .filter(mData => {
                    const hasParentInFamily = (mData.mother && family.members.includes(mData.mother)) || 
                                              (mData.father && family.members.includes(mData.father));
                    return !hasParentInFamily;
                })
                .map(mData => mData.userId);
            
            if (potentialHeads.length > 0) {
                family.head = potentialHeads[Math.floor(Math.random() * potentialHeads.length)];
            } else {
                family.head = family.members[Math.floor(Math.random() * family.members.length)];
            }
            await updateFamily(guildId, family.familyName, { head: family.head, members: family.members });
        }
      } else {
        if (family.members.length === 0) {
          await deleteFamily(guildId, family.familyName);
        } else {
          await updateFamily(guildId, family.familyName, { members: family.members });
        }
      }
    }
  }

  await updateUser(guildId, userId, { spouse: null, children: [], mother: null, father: null, customLinks: {}, familyName: null });
}

async function addFamilyLog(guildId, familyName, message) {
    if (!familyName) return;
    await familiesCollection.updateOne(
        { _id: `${guildId}_${familyName.toLowerCase()}` },
        { $push: { history: { $each: [{ action: message, date: new Date() }], $slice: -15 } } }
    );
}

module.exports = {
  connectDB,
  getOrCreateUser,
  getUsersByIds,
  updateUser,
  getAllUsers,
  getFamily,
  createFamily,
  mergeFamilies,
  updateFamily,
  deleteFamily,
  getAllFamilies,
  clearUserFamilyLinksDB,
  resetDatabase,
  addFamilyLog
};