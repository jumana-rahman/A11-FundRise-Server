import express from "express";
import app from "../lib/app";
import { connectToDatabase } from "../lib/db";

let connected = false;

export default async function handler(req: any, res: any) {
  if (!connected) {
    await connectToDatabase();
    connected = true;
  }
  return app(req, res);
}
