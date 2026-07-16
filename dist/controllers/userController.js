import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
const COLLECTION = "user";
// Get current user profile
export async function getProfile(req, res) {
    try {
        const db = getDb();
        const user = await db.collection(COLLECTION).findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        const { password, ...safe } = user;
        res.json(safe);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch profile" });
    }
}
// Update current user profile
export async function updateProfile(req, res) {
    try {
        const db = getDb();
        const { name, photoUrl } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (photoUrl !== undefined)
            updateData.photoUrl = photoUrl;
        await db.collection(COLLECTION).updateOne({ email: req.user.email }, { $set: updateData });
        res.json({ message: "Profile updated" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update profile" });
    }
}
// Get current user's credits
export async function getCredits(req, res) {
    try {
        const db = getDb();
        const user = await db.collection(COLLECTION).findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ credits: user.credits });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch credits" });
    }
}
// Add credits to user (for purchases)
export async function addCredits(req, res) {
    try {
        const db = getDb();
        const { email, amount } = req.body;
        const targetEmail = email || req.user.email;
        const creditAmount = Number(amount);
        if (!creditAmount || creditAmount <= 0) {
            return res.status(400).json({ error: "Invalid credit amount" });
        }
        await db.collection(COLLECTION).updateOne({ email: targetEmail }, { $inc: { credits: creditAmount } });
        res.json({ message: `${creditAmount} credits added` });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to add credits" });
    }
}
// Admin: list all users
export async function listAll(req, res) {
    try {
        const db = getDb();
        const users = await db
            .collection(COLLECTION)
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
}
// Admin: get stats
export async function getStats(req, res) {
    try {
        const db = getDb();
        const [totalSupporters, totalCreators, totalAdmins, creditSum, totalPayments] = await Promise.all([
            db.collection(COLLECTION).countDocuments({ role: "supporter" }),
            db.collection(COLLECTION).countDocuments({ role: "creator" }),
            db.collection(COLLECTION).countDocuments({ role: "admin" }),
            db.collection(COLLECTION).aggregate([{ $group: { _id: null, total: { $sum: "$credits" } } }]).toArray(),
            db.collection("payments").countDocuments({ status: "completed" }),
        ]);
        res.json({
            totalSupporters,
            totalCreators,
            totalAdmins,
            totalCredits: creditSum[0]?.total ?? 0,
            totalPayments,
        });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
}
// Admin: update user role
export async function updateRole(req, res) {
    try {
        const db = getDb();
        const { id } = req.params;
        const { role } = req.body;
        if (!["supporter", "creator", "admin"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }
        await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: { role } });
        res.json({ message: "Role updated" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update role" });
    }
}
// Admin: delete user
export async function remove(req, res) {
    try {
        const db = getDb();
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }
        const user = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
        res.json({ message: "User deleted" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete user" });
    }
}
// Grant credits on registration (called after better-auth sign-up)
export async function grantRegistrationCredits(email, role) {
    try {
        const db = getDb();
        const credits = role === "supporter" ? 50 : 20;
        await db.collection(COLLECTION).updateOne({ email }, { $set: { credits, role } });
    }
    catch (error) {
        console.error("Failed to grant registration credits:", error);
    }
}
