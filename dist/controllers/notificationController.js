import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
const COLLECTION = "notifications";
// Get notifications for current user
export async function listByUser(req, res) {
    try {
        const db = getDb();
        const notifications = await db
            .collection(COLLECTION)
            .find({ toEmail: req.user.email })
            .sort({ time: -1 })
            .toArray();
        res.json(notifications);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
}
// Mark notification as read
export async function markRead(req, res) {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid notification ID" });
        }
        await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id), toEmail: req.user.email }, { $set: { read: true } });
        res.json({ message: "Marked as read" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to mark notification" });
    }
}
// Mark all as read
export async function markAllRead(req, res) {
    try {
        const db = getDb();
        await db.collection(COLLECTION).updateMany({ toEmail: req.user.email, read: false }, { $set: { read: true } });
        res.json({ message: "All marked as read" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to mark notifications" });
    }
}
// Delete notification
export async function remove(req, res) {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid notification ID" });
        }
        await db.collection(COLLECTION).deleteOne({
            _id: new ObjectId(id),
            toEmail: req.user.email,
        });
        res.json({ message: "Notification deleted" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete notification" });
    }
}
