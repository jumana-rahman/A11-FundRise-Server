import { MongoClient, type Db } from "mongodb";
export declare function connectToDatabase(): Promise<Db>;
export declare function getDb(): Db;
export declare function getClient(): MongoClient;
