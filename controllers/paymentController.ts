import { type Response } from "express";
import { getDb } from "../lib/db";
import type { AuthRequest } from "../middleware/auth";
import type { Payment } from "../types";

const COLLECTION = "payments";

// Record a payment (after successful Stripe checkout or credit purchase)
export async function create(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { credits, amount, method } = req.body;

    if (!credits || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payment: Payment = {
      userEmail: req.user!.email,
      userName: req.user!.name,
      credits: Number(credits),
      amount: Number(amount),
      method: method || "Stripe",
      date: new Date().toISOString(),
      status: "completed",
    };

    const result = await db.collection(COLLECTION).insertOne(payment);
    res.status(201).json({ _id: result.insertedId, ...payment });
  } catch (error) {
    res.status(500).json({ error: "Failed to record payment" });
  }
}

// List payments by user
export async function listByUser(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const payments = await db
      .collection(COLLECTION)
      .find({ userEmail: req.user!.email })
      .sort({ date: -1 })
      .toArray();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
}

// Admin: list all payments
export async function listAll(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const payments = await db
      .collection(COLLECTION)
      .find()
      .sort({ date: -1 })
      .toArray();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
}
