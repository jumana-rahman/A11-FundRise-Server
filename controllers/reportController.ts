import { type Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import type { AuthRequest } from "../middleware/auth";
import type { Report } from "../types";

const COLLECTION = "reports";

// Create a report
export async function create(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { campaignId, campaignTitle, reason } = req.body;

    if (!campaignId || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!ObjectId.isValid(campaignId)) {
      return res.status(400).json({ error: "Invalid campaign ID" });
    }

    const campaign = await db.collection("campaigns").findOne({ _id: new ObjectId(campaignId) });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const report: Report = {
      campaignId,
      campaignTitle: campaignTitle || campaign.campaignTitle,
      reporterName: req.user!.name,
      reporterEmail: req.user!.email,
      reason,
      date: new Date().toISOString(),
      status: "open",
    };

    const result = await db.collection(COLLECTION).insertOne(report);
    res.status(201).json({ _id: result.insertedId, ...report });
  } catch (error) {
    res.status(500).json({ error: "Failed to create report" });
  }
}

// Admin: list all reports
export async function listAll(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const reports = await db
      .collection(COLLECTION)
      .find()
      .sort({ date: -1 })
      .toArray();
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
}

// Admin: resolve report (suspend/delete campaign)
export async function resolve(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    const { id } = req.params;
    const { action } = req.body; // "delete" or "suspend"

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    const report = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Mark report as resolved
    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "resolved" } }
    );

    // Take action on campaign
    if (action === "delete" && ObjectId.isValid(report.campaignId)) {
      // Refund all approved contributors
      const contributions = await db
        .collection("contributions")
        .find({ campaignId: report.campaignId, status: "approved" })
        .toArray();

      for (const contrib of contributions) {
        await db
          .collection("users")
          .updateOne(
            { email: contrib.supporterEmail },
            { $inc: { credits: contrib.contributionAmount } }
          );
        await db
          .collection("contributions")
          .updateOne({ _id: contrib._id }, { $set: { status: "rejected" } });
      }

      await db.collection("campaigns").deleteOne({ _id: new ObjectId(report.campaignId) });
    } else if (action === "suspend" && ObjectId.isValid(report.campaignId)) {
      await db.collection("campaigns").updateOne(
        { _id: new ObjectId(report.campaignId) },
        { $set: { status: "rejected" } }
      );
    }

    res.json({ message: "Report resolved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve report" });
  }
}
