const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

const client = uri
  ? new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
  : null;

if (!uri) {
  console.error("❌ MONGODB_URI manquant dans les variables d'environnement (.env)." );
}


let db;
let usersCollection;
let familiesCollection;

async function connectDB() {
  if (!client) {
    console.error("❌ Impossible de démarrer : MONGODB_URI manquant.");
    process.exit(1);
  }
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
  const updates = []; // To store all updateUser promises

  if (userData.familyName) {
    let family = await getFamily(userData.familyName);
    
    // Collect all unique IDs that need to be fetched for cleaning up pointers
    const idsToFetch = new Set();
    if (userData.spouse) {
      idsToFetch.add(userData.spouse);
    }
    if (userData.father) {
      idsToFetch.add(userData.father);
    }
    if (userData.mother) {
      idsToFetch.add(userData.mother);
    }
    if (userData.children && userData.children.length > 0) {
      userData.children.forEach(childId => idsToFetch.add(childId));
    }
    if (family && family.members) {
      family.members.forEach(memberId => idsToFetch.add(memberId));
    }
    idsToFetch.delete(userId); // Don't re-fetch current user

    const fetchedUsersData = {};
    await Promise.all(Array.from(idsToFetch).map(async (id) => {
      fetchedUsersData[id] = await getOrCreateUser(id);
    }));

    // Clean up pointers in other users (Spouse, Parents, Children)
    if (userData.spouse) {
      updates.push(updateUser(userData.spouse, { spouse: null }));
    }
    if (userData.father) {
      const fatherData = fetchedUsersData[userData.father];
      if (fatherData) {
        const updatedChildren = fatherData.children.filter(id => id !== userId);
        updates.push(updateUser(userData.father, { children: updatedChildren }));
      }
    }
    if (userData.mother) {
      const motherData = fetchedUsersData[userData.mother];
      if (motherData) {
        const updatedChildren = motherData.children.filter(id => id !== userId);
        updates.push(updateUser(userData.mother, { children: updatedChildren }));
      }
    }
    if (userData.children && userData.children.length > 0) {
      for (const childId of userData.children) {
        const childData = fetchedUsersData[childId];
        if (childData) {
          let update = {};
          if (childData.father === userId) update.father = null;
          if (childData.mother === userId) update.mother = null;
          if (Object.keys(update).length > 0) updates.push(updateUser(childId, update));
        }
      }
    }

    if (family) {
      const updatedMembers = family.members.filter(id => id !== userId);
      if (family.head === userId) {
        if (updatedMembers.length === 0) {
          updates.push(deleteFamily(family._id));
        } else {
            // Logique de succession : on cherche les membres sans parents dans la famille (les plus "vieux")
            const results = updatedMembers.map(mId => {
                const mData = fetchedUsersData[mId]; // Use pre-fetched data
                const hasParentInFamily = (mData?.mother && family.members.includes(mData.mother)) ||
                                          (mData?.father && family.members.includes(mData.father));
                return { mId, isPotential: !hasParentInFamily };
            });
            
            const potential = results.filter(r => r.isPotential).map(r => r.mId);
            const newHead = potential.length > 0 
                ? potential[Math.floor(Math.random() * potential.length)] 
                : updatedMembers[0];
                
            updates.push(updateFamily(family._id, { head: newHead, members: updatedMembers }));
        }
      } else {
        updates.push(updateFamily(family._id, { members: updatedMembers }));
      }
    }
  }

  updates.push(updateUser(userId, { spouse: null, children: [], mother: null, father: null, customLinks: {}, familyName: null }));
  await Promise.all(updates); // Execute all updates concurrently
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