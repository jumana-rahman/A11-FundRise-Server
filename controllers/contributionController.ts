import { type Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import type { Contribution } from "../types";
import type { AuthRequest } from "../middleware/auth";

const COLLECTION = "contributions";

export async function create(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const {
      campaignId,
      campaignTitle,
      contributionAmount,
      creatorEmail,
      creatorName,
    } = req.body;

    if (!campaignId || !contributionAmount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!ObjectId.isValid(campaignId)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const campaign = await db.collection("campaigns").findOne({ _id: new ObjectId(campaignId) });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "approved") {
      return res.status(400).json({ error: "Campaign is not approved" });
    }

    const amount = Number(contributionAmount);
    if (amount < campaign.minimumContribution) {
      return res.status(400).json({ error: `Minimum contribution is ${campaign.minimumContribution} credits` });
    }

    const user = await db.collection("user").findOne({ email: req.user!.email });
    if (!user || user.credits < amount) {
      return res.status(400).json({ error: "Insufficient credits" });
    }

    // Deduct credits from supporter
    await db.collection("user").updateOne(
      { email: req.user!.email },
      { $inc: { credits: -amount } }
    );

    const contribution: Contribution = {
      campaignId,
      campaignTitle: campaignTitle || campaign.campaignTitle,
      contributionAmount: amount,
      supporterEmail: req.user!.email,
      supporterName: req.user!.name,
      creatorEmail: creatorEmail || campaign.creatorEmail,
      creatorName: creatorName || campaign.creatorName,
      currentDate: new Date().toISOString(),
      status: "pending",
    };

    const result = await db.collection(COLLECTION).insertOne(contribution);

    // Notify creator
    await db.collection("notifications").insertOne({
      message: `${req.user!.name} contributed ${amount} credits to "${campaign.campaignTitle}". Awaiting your review.`,
      toEmail: campaign.creatorEmail,
      actionRoute: "/dashboard/creator-home",
      time: new Date(),
      read: false,
    });

    res.status(201).json({ _id: result.insertedId, ...contribution });
  } catch (error) {
    res.status(500).json({ error: "Failed to create contribution" });
  }
}

export async function listBySupporter(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { page = "1", limit = "5" } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const filter = { supporterEmail: req.user!.email };

    const [contributions, total] = await Promise.all([
      db
        .collection(COLLECTION)
        .find(filter)
        .sort({ currentDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection(COLLECTION).countDocuments(filter),
    ]);

    res.json({
      contributions,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contributions" });
  }
}

export async function listPendingForCreator(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const contributions = await db
      .collection(COLLECTION)
      .find({ creatorEmail: req.user!.email, status: "pending" })
      .sort({ currentDate: -1 })
      .toArray();
    res.json(contributions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contributions" });
  }
}

export async function listApprovedForSupporter(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const contributions = await db
      .collection(COLLECTION)
      .find({ supporterEmail: req.user!.email, status: "approved" })
      .sort({ currentDate: -1 })
      .toArray();
    res.json(contributions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contributions" });
  }
}

export async function approve(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid contribution ID" });
    }

    const contribution = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!contribution) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    if (contribution.creatorEmail !== req.user!.email) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (contribution.status !== "pending") {
      return res.status(400).json({ error: "Contribution is not pending" });
    }

    // Update contribution status
    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" } }
    );

    // Add to campaign's raised amount
    await db.collection("campaigns").updateOne(
      { _id: new ObjectId(contribution.campaignId) },
      { $inc: { amountRaised: contribution.contributionAmount } }
    );

    // Notify supporter
    await db.collection("notifications").insertOne({
      message: `Your contribution of ${contribution.contributionAmount} credits to "${contribution.campaignTitle}" was approved by ${req.user!.name}.`,
      toEmail: contribution.supporterEmail,
      actionRoute: "/dashboard/my-contributions",
      time: new Date(),
      read: false,
    });

    res.json({ message: "Contribution approved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to approve contribution" });
  }
}

export async function reject(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid contribution ID" });
    }

    const contribution = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!contribution) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    if (contribution.creatorEmail !== req.user!.email) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (contribution.status !== "pending") {
      return res.status(400).json({ error: "Contribution is not pending" });
    }

    // Update contribution status
    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "rejected" } }
    );

    // Refund credits to supporter
    await db.collection("user").updateOne(
      { email: contribution.supporterEmail },
      { $inc: { credits: contribution.contributionAmount } }
    );

    // Notify supporter
    await db.collection("notifications").insertOne({
      message: `Your contribution of ${contribution.contributionAmount} credits to "${contribution.campaignTitle}" was rejected by ${req.user!.name}. Credits refunded.`,
      toEmail: contribution.supporterEmail,
      actionRoute: "/dashboard/my-contributions",
      time: new Date(),
      read: false,
    });

    res.json({ message: "Contribution rejected and credits refunded" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject contribution" });
  }
}

export async function listByCampaign(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { campaignId } = req.query;

    if (!campaignId || typeof campaignId !== "string") {
      return res.status(400).json({ error: "campaignId query param required" });
    }

    const contributions = await db
      .collection(COLLECTION)
      .find({ campaignId })
      .sort({ currentDate: -1 })
      .toArray();

    res.json(contributions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contributions" });
  }
}
