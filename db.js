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
    gender: null
  };

  let user = await usersCollection.findOne({ _id: compositeId });
  
  if (!user) {
    user = { _id: compositeId, guildId, userId, ...defaults };
    await usersCollection.insertOne(user);
  } else {
    // Protection contre les anciennes données : on fusionne avec les valeurs par défaut
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
    createdAt: new Date()
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

async function clearUserFamilyLinksDB(guildId, userId) {
  const userData = await getOrCreateUser(guildId, userId);

  if (userData.familyName) {
    const family = await getFamily(guildId, userData.familyName);
    if (family) {
      family.members = family.members.filter(id => id !== userId);
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
        await updateFamily(guildId, family.familyName, { members: family.members });
      }
    }
  }

  await updateUser(guildId, userId, { spouse: null, children: [], mother: null, father: null, customLinks: {}, familyName: null });
}

module.exports = {
  connectDB,
  getOrCreateUser,
  getUsersByIds,
  updateUser,
  getAllUsers,
  getFamily,
  createFamily,
  updateFamily,
  deleteFamily,
  getAllFamilies,
  clearUserFamilyLinksDB,
  resetDatabase
};