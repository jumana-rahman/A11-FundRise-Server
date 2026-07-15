import { type Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import type { AuthRequest } from "../middleware/auth";
import type { Withdrawal } from "../types";

const COLLECTION = "withdrawals";

// Creator: get earnings summary
export async function getEarnings(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const campaigns = await db
      .collection("campaigns")
      .find({ creatorEmail: req.user!.email, status: "approved" })
      .toArray();

    const totalRaised = campaigns.reduce((sum, c) => sum + (c.amountRaised || 0), 0);
    const withdrawalAmount = totalRaised / 20;

    res.json({ totalRaised, withdrawalAmount });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
}

// Creator: request withdrawal
export async function create(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { withdrawalCredit, paymentSystem, accountNumber } = req.body;

    const creditAmount = Number(withdrawalCredit);
    if (!creditAmount || creditAmount < 200) {
      return res.status(400).json({ error: "Minimum withdrawal is 200 credits" });
    }

    // Check raised credits
    const campaigns = await db
      .collection("campaigns")
      .find({ creatorEmail: req.user!.email, status: "approved" })
      .toArray();
    const totalRaised = campaigns.reduce((sum, c) => sum + (c.amountRaised || 0), 0);

    if (creditAmount > totalRaised) {
      return res.status(400).json({ error: "Insufficient raised credits" });
    }

    const withdrawal: Withdrawal = {
      creatorEmail: req.user!.email,
      creatorName: req.user!.name,
      withdrawalCredit: creditAmount,
      withdrawalAmount: creditAmount / 20,
      paymentSystem: paymentSystem || "Stripe",
      accountNumber: accountNumber || "",
      withdrawDate: new Date().toISOString(),
      status: "pending",
    };

    const result = await db.collection(COLLECTION).insertOne(withdrawal);
    res.status(201).json({ _id: result.insertedId, ...withdrawal });
  } catch (error) {
    res.status(500).json({ error: "Failed to create withdrawal request" });
  }
}

// Creator: payment history
export async function listByCreator(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const withdrawals = await db
      .collection(COLLECTION)
      .find({ creatorEmail: req.user!.email })
      .sort({ withdrawDate: -1 })
      .toArray();
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
}

// Admin: list pending withdrawals
export async function listPending(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const withdrawals = await db
      .collection(COLLECTION)
      .find({ status: "pending" })
      .sort({ withdrawDate: -1 })
      .toArray();
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
}

// Admin: list all processed withdrawals
export async function listAll(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const withdrawals = await db
      .collection(COLLECTION)
      .find({ status: { $ne: "pending" } })
      .sort({ withdrawDate: -1 })
      .toArray();
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
}

// Admin: approve withdrawal (mark as paid)
export async function approve(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid withdrawal ID" });
    }

    const withdrawal = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Withdrawal is not pending" });
    }

    // Update status
    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" } }
    );

    // Deduct from creator's campaign raised amounts
    const campaigns = await db
      .collection("campaigns")
      .find({ creatorEmail: withdrawal.creatorEmail, status: "approved" })
      .sort({ deadline: -1 })
      .toArray();

    let remaining = withdrawal.withdrawalCredit;
    for (const campaign of campaigns) {
      if (remaining <= 0) break;
      const deduct = Math.min(campaign.amountRaised, remaining);
      await db.collection("campaigns").updateOne(
        { _id: campaign._id },
        { $inc: { amountRaised: -deduct } }
      );
      remaining -= deduct;
    }

    // Notify creator
    await db.collection("notifications").insertOne({
      message: `Your withdrawal of $${withdrawal.withdrawalAmount} has been processed.`,
      toEmail: withdrawal.creatorEmail,
      actionRoute: "/dashboard/creator-payment-history",
      time: new Date(),
      read: false,
    });

    res.json({ message: "Withdrawal approved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
}
