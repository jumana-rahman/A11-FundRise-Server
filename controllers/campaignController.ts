import { type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import type { Campaign } from "../types";
import type { AuthRequest } from "../middleware/auth";

const COLLECTION = "campaigns";

export async function listApproved(req: Request, res: Response) {
  try {
    const db = getDb();
    const { search, category } = req.query;

    const filter: any = { status: "approved" };

    if (search && typeof search === "string") {
      filter.$or = [
        { campaignTitle: { $regex: search, $options: "i" } },
        { creatorName: { $regex: search, $options: "i" } },
      ];
    }
    if (category && typeof category === "string" && category !== "All") {
      filter.category = category;
    }

    const campaigns = await db
      .collection(COLLECTION)
      .find(filter)
      .sort({ deadline: -1 })
      .toArray();

    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

export async function listAll(req: Request, res: Response) {
  try {
    const db = getDb();
    const campaigns = await db
      .collection(COLLECTION)
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

export async function listByCreator(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const campaigns = await db
      .collection(COLLECTION)
      .find({ creatorEmail: req.user!.email })
      .sort({ deadline: -1 })
      .toArray();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

export async function listPending(req: Request, res: Response) {
  try {
    const db = getDb();
    const campaigns = await db
      .collection(COLLECTION)
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

export async function getTopFunded(req: Request, res: Response) {
  try {
    const db = getDb();
    const campaigns = await db
      .collection(COLLECTION)
      .find({ status: "approved" })
      .sort({ amountRaised: -1 })
      .limit(6)
      .toArray();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const campaign = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
}

export async function create(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const {
      campaignTitle,
      campaignStory,
      category,
      fundingGoal,
      minimumContribution,
      deadline,
      rewardInfo,
      campaignImageUrl,
    } = req.body;

    if (!campaignTitle || !campaignStory || !category || !fundingGoal || !deadline) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const campaign: Campaign = {
      campaignTitle,
      campaignStory,
      category,
      fundingGoal: Number(fundingGoal),
      minimumContribution: Number(minimumContribution) || 1,
      deadline,
      rewardInfo: rewardInfo || "",
      campaignImageUrl: campaignImageUrl || "",
      creatorEmail: req.user!.email,
      creatorName: req.user!.name,
      amountRaised: 0,
      status: "pending",
      createdAt: new Date(),
    };

    const result = await db.collection(COLLECTION).insertOne(campaign);
    res.status(201).json({ _id: result.insertedId, ...campaign });
  } catch (error) {
    res.status(500).json({ error: "Failed to create campaign" });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;
    const { campaignTitle, campaignStory, rewardInfo } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (existing.creatorEmail !== req.user!.email && req.user!.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }

    const updateData: any = {};
    if (campaignTitle !== undefined) updateData.campaignTitle = campaignTitle;
    if (campaignStory !== undefined) updateData.campaignStory = campaignStory;
    if (rewardInfo !== undefined) updateData.rewardInfo = rewardInfo;

    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.json({ message: "Campaign updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update campaign" });
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (existing.creatorEmail !== req.user!.email && req.user!.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Refund all approved contributors
    const approvedContributions = await db
      .collection("contributions")
      .find({ campaignId: id, status: "approved" })
      .toArray();

    for (const contrib of approvedContributions) {
      await db
        .collection("users")
        .updateOne(
          { email: contrib.supporterEmail },
          { $inc: { credits: contrib.contributionAmount } }
        );

      await db
        .collection("contributions")
        .updateOne(
          { _id: contrib._id },
          { $set: { status: "rejected" } }
        );
    }

    await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Campaign deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete campaign" });
  }
}

export async function approve(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved" } }
    );

    // Create notification for creator
    await db.collection("notifications").insertOne({
      message: `Your campaign "${existing.campaignTitle}" has been approved by the admin.`,
      toEmail: existing.creatorEmail,
      actionRoute: "/dashboard/my-campaigns",
      time: new Date(),
      read: false,
    });

    res.json({ message: "Campaign approved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to approve campaign" });
  }
}

export async function reject(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const existing = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "rejected" } }
    );

    // Create notification for creator
    await db.collection("notifications").insertOne({
      message: `Your campaign "${existing.campaignTitle}" has been rejected by the admin.`,
      toEmail: existing.creatorEmail,
      actionRoute: "/dashboard/my-campaigns",
      time: new Date(),
      read: false,
    });

    res.json({ message: "Campaign rejected" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject campaign" });
  }
}
