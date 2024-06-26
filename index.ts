import { MongoClient } from "mongodb";

import readline from "readline";
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

require("dotenv").config();

// Stolen from https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'Kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb', 'Zb', 'Yb']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

console.log("Connecting to databases...");
const fromClient = new MongoClient(process.env.FROM_URI!);
const toClient = new MongoClient(process.env.TO_URI!);

async function getDbs(client: MongoClient) {
  console.log("Fetching database names...");

  console.log("Connected to MongoDB");
  const dbNames = await client.db().admin().listDatabases();

  return dbNames.databases;
}

async function copyDb(fromClient: MongoClient, toClient: MongoClient, dbName: string) {
  console.log(`Copying database ${dbName}...`);

  const collections = await fromClient.db(dbName).listCollections().toArray();
  console.log(`Collections: ${collections.map(c => c.name).join(", ")}`);

  for (const collection of collections) {
    console.log(`Copying collection ${collection.name}...`);

    const cursor = fromClient.db(dbName).collection(collection.name).find();
    const docs = await cursor.toArray();
    console.log(`Found ${docs.length} documents`);

    if (docs.length === 0) {
      console.log("Skipping collection...");
      continue;
    }

    const toCollection = toClient.db(dbName).collection(collection.name);
    await toCollection.insertMany(docs);

    console.log(`Copied ${docs.length} documents`);
  }

  console.log(`Copied database ${dbName}`);
}

async function main() {
  await Promise.all([fromClient.connect(), toClient.connect()]);

  const dbs = await getDbs(fromClient);
  const existingDbs = await getDbs(toClient);

  console.log(`Available databases: ${dbs.map(db => `${db.name} (${formatBytes(db.sizeOnDisk)})`).join(", ")}`);
  console.log(`Existing databases: ${existingDbs.map(db => `${db.name} (${formatBytes(db.sizeOnDisk)})`).join(", ")}`);

  rl.question("Select a database to copy: ", async selectedDbName => {
    console.log(`Selected database: ${selectedDbName}`);
    const selectedDb = dbs.find(db => db.name === selectedDbName);
    if (!selectedDb) {
      console.error("Database not found");
      process.exit(1);
    }

    await copyDb(fromClient, toClient, selectedDbName);

    console.log("Closing connections...");
    fromClient.close();
    toClient.close();
  });
}

main();