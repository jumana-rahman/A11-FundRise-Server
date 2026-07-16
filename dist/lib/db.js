import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import { MongoClient } from "mongodb";
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "fundrise";
let client;
let db;
export async function connectToDatabase() {
    if (db)
        return db;
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log("Connected to MongoDB fundrise");
    return db;
}
export function getDb() {
    if (!db)
        throw new Error("Database not connected. Call connectToDatabase() first.");
    return db;
}
export function getClient() {
    if (!client)
        throw new Error("Database not connected. Call connectToDatabase() first.");
    return client;
}
