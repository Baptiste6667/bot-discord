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
    console.log("🎉 Connecté à MongoDB Atlas !");
  } catch (error) {
    console.error("❌ Erreur de connexion à MongoDB Atlas :", error);
    process.exit(1); // Arrête le bot si la connexion échoue
  }
}

async function getOrCreateUser(userId) {
  let user = await usersCollection.findOne({ _id: userId });
  if (!user) {
    user = {
      _id: userId,
      spouse: null,
      children: [],
      mother: null,
      father: null,
      customLinks: {},
      familyName: null,
      bio: "",
      gender: null
    };
    await usersCollection.insertOne(user);
  }
  return user;
}

async function updateUser(userId, updateFields) {
  await usersCollection.updateOne({ _id: userId }, { $set: updateFields });
}

async function getAllUsers() {
  return (await usersCollection.find({}).toArray()).reduce((acc, user) => {
    acc[user._id] = user;
    return acc;
  }, {});
}

async function getFamily(familyName) {
  return familiesCollection.findOne({ _id: familyName.toLowerCase() });
}

async function createFamily(familyName, headId) {
  const family = {
    _id: familyName.toLowerCase(),
    head: headId,
    members: [headId]
  };
  await familiesCollection.insertOne(family);
  return family;
}

async function updateFamily(familyName, updateFields) {
  await familiesCollection.updateOne({ _id: familyName.toLowerCase() }, { $set: updateFields });
}

async function deleteFamily(familyName) {
  await familiesCollection.deleteOne({ _id: familyName.toLowerCase() });
}

async function getAllFamilies() {
  return (await familiesCollection.find({}).toArray()).reduce((acc, family) => {
    acc[family._id] = family;
    return acc;
  }, {});
}

async function clearUserFamilyLinksDB(userId) {
  const userData = await getOrCreateUser(userId);

  if (userData.familyName) {
    const family = await getFamily(userData.familyName);
    if (family) {
      family.members = family.members.filter(id => id !== userId);
      if (family.head === userId) {
        if (family.members.length === 0) {
          await deleteFamily(family._id);
        } else {
            // Logique de succession : on cherche les membres sans parents dans la famille (les plus "vieux")
            const results = await Promise.all(family.members.map(async mId => {
                const mData = await getOrCreateUser(mId);
                const hasParentInFamily = (mData.mother && family.members.includes(mData.mother)) || 
                                          (mData.father && family.members.includes(mData.father));
                return { mId, isPotential: !hasParentInFamily };
            }));
            
            const potentialHeads = results.filter(r => r.isPotential).map(r => r.mId);

            if (potentialHeads.length > 0) {
                family.head = potentialHeads[Math.floor(Math.random() * potentialHeads.length)];
            } else {
                family.head = family.members[Math.floor(Math.random() * family.members.length)];
            }
            await updateFamily(family._id, { head: family.head, members: family.members });
        }
      } else {
        await updateFamily(family._id, { members: family.members });
      }
    }
  }

  await updateUser(userId, { spouse: null, children: [], mother: null, father: null, customLinks: {}, familyName: null });
}

module.exports = {
  connectDB,
  getOrCreateUser,
  updateUser,
  getAllUsers,
  getFamily,
  createFamily,
  updateFamily,
  deleteFamily,
  getAllFamilies,
  clearUserFamilyLinksDB
};