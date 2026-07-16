import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "8.8.4.4"]); } catch {}

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, customSession, createAccessControl } from "better-auth/plugins";
import { SignJWT, jwtVerify } from "jose";
import Stripe from "stripe";

// ─── DB ──────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.DB_NAME || "fundrise";
let client: MongoClient;
let db: Db;

async function connectToDatabase(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

function getDb(): Db {
  if (!db) throw new Error("Database not connected");
  return db;
}

// ─── JWT ─────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function signJWT(payload: Record<string, any>): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(JWT_SECRET);
}

async function verifyJWT(token: string): Promise<any> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload;
}

// ─── AUTH TYPES ──────────────────────────────────────────────────────
interface AuthUser {
  id: string; email: string; name: string;
  role: "supporter" | "creator" | "admin";
  credits: number; photoUrl: string;
}
interface AuthRequest extends Request { user?: AuthUser; }

// ─── BETTER-AUTH ─────────────────────────────────────────────────────
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const statement = {
  campaign: ["create", "read", "update", "delete"],
  contribution: ["create", "read", "update", "delete"],
  withdrawal: ["create", "read", "update"],
  notification: ["read", "update", "delete"],
  report: ["create", "read", "update", "delete"],
  user: ["read", "update", "delete"],
  payment: ["create", "read"],
} as const;

const ac = createAccessControl(statement);
const supporterRole = ac.newRole({ campaign: ["read"], contribution: ["create", "read"], withdrawal: ["read"], notification: ["read", "update"], report: ["create", "read"], payment: ["create", "read"] });
const creatorRole = ac.newRole({ campaign: ["create", "read", "update", "delete"], contribution: ["read", "update"], withdrawal: ["create", "read"], notification: ["read", "update"], report: ["read"], payment: ["read"] });
const adminRole = ac.newRole({ campaign: ["create", "read", "update", "delete"], contribution: ["read", "update", "delete"], withdrawal: ["read", "update"], notification: ["read", "update", "delete"], report: ["read", "update", "delete"], user: ["read", "update", "delete"], payment: ["read"] });

let _auth: any = null;
function getAuth(): any {
  if (_auth) return _auth;
  const c = client;
  _auth = betterAuth({
    trustedOrigins: [CLIENT_URL],
    database: mongodbAdapter(c.db("fundrise")),
    emailAndPassword: { enabled: true, autoSignIn: true },
    socialProviders: {
      google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
    },
    plugins: [
      admin({ defaultRole: "supporter", adminRole: "admin", ac, roles: { supporter: supporterRole, creator: creatorRole, admin: adminRole } }),
      customSession(async ({ user, session }) => {
        const d = c.db();
        let fullUser: any;
        try { fullUser = await d.collection("user").findOne({ _id: new ObjectId(user.id) }); } catch { fullUser = await d.collection("user").findOne({ email: user.email }); }
        return { user: { ...user, credits: fullUser?.credits ?? 0, photoUrl: fullUser?.photoUrl || fullUser?.image || (user as any).image || "", role: fullUser?.role ?? "supporter" }, session };
      }),
    ],
    user: {
      additionalFields: {
        credits: { type: "number", required: false, default: 0 },
        photoUrl: { type: "string", required: false, default: "" },
        role: { type: "string", required: false, default: "supporter" },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  } as any);
  return _auth;
}

const authProxy: any = new Proxy({} as any, {
  get(_: any, prop: any) {
    const instance = getAuth();
    const value = Reflect.get(instance, prop);
    if (typeof value === "function") return value.bind(instance);
    return value;
  },
});

// ─── MIDDLEWARE ──────────────────────────────────────────────────────
async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
    const payload = await verifyJWT(header.split(" ")[1]);
    req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role, credits: payload.credits, photoUrl: payload.photoUrl };
    next();
  } catch { return res.status(401).json({ error: "Invalid or expired token" }); }
}

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

// ─── STRIPE ──────────────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-12-18.acacia" as any });
const CREDIT_PACKAGES: Record<number, { credits: number; amount: number }> = {
  100: { credits: 100, amount: 1000 }, 300: { credits: 300, amount: 2500 },
  800: { credits: 800, amount: 6000 }, 1500: { credits: 1500, amount: 11000 },
};

// ─── EXPRESS APP ─────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }) as any);
app.use(express.json());
app.use(cookieParser());

// Root
app.get("/", (_: any, res: any) => {
  res.json({ name: "FundRise API", status: "running" });
});

// Health
app.get("/api/health", async (_: any, res: any) => {
  try { const d = getDb(); await d.command({ ping: 1 }); res.json({ status: "ok", database: "connected" }); }
  catch { res.json({ status: "ok", database: "disconnected" }); }
});

// JWT endpoint
app.post("/api/auth/jwt", async (req: any, res: any) => {
  try {
    const session = await authProxy.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: "No active session" });
    const token = await signJWT({ id: session.user.id, email: session.user.email, name: session.user.name, role: (session.user as any).role ?? "supporter", credits: (session.user as any).credits ?? 0, photoUrl: (session.user as any).photoUrl || (session.user as any).image || "" });
    res.json({ token });
  } catch { res.status(500).json({ error: "Failed to generate token" }); }
});

// Register credits
app.post("/api/auth/register-credits", async (req: any, res: any) => {
  try {
    const session = await authProxy.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: "No active session" });
    const role = req.body.role ?? (session.user as any).role ?? "supporter";
    const credits = role === "supporter" ? 50 : 20;
    await getDb().collection("user").updateOne({ email: session.user.email }, { $set: { credits, role } });
    res.json({ message: "Credits granted" });
  } catch { res.status(500).json({ error: "Failed to grant credits" }); }
});

// ─── USER ROUTES ─────────────────────────────────────────────────────
app.get("/api/users/me", requireAuth, async (req: any, res: any) => {
  try { const u = await getDb().collection("user").findOne({ email: req.user!.email }); if (!u) return res.status(404).json({ error: "Not found" }); const { password, ...safe } = u; res.json(safe); } catch { res.status(500).json({ error: "Failed" }); }
});
app.put("/api/users/me", requireAuth, async (req: any, res: any) => {
  try { const d: any = {}; if (req.body.name !== undefined) d.name = req.body.name; if (req.body.photoUrl !== undefined) d.photoUrl = req.body.photoUrl; await getDb().collection("user").updateOne({ email: req.user!.email }, { $set: d }); res.json({ message: "Profile updated" }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/users/credits", requireAuth, async (req: any, res: any) => {
  try { const u = await getDb().collection("user").findOne({ email: req.user!.email }); res.json({ credits: u?.credits ?? 0 }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.post("/api/users/credits", requireAuth, async (req: any, res: any) => {
  try { const amt = Number(req.body.amount); if (!amt || amt <= 0) return res.status(400).json({ error: "Invalid" }); await getDb().collection("user").updateOne({ email: req.body.email || req.user!.email }, { $inc: { credits: amt } }); res.json({ message: `${amt} credits added` }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/users/admin/all", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const users = await getDb().collection("user").find({}, { projection: { password: 0 } }).sort({ createdAt: -1 }).toArray(); res.json(users); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/users/admin/stats", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try {
    const d = getDb(); const col = d.collection("user");
    const [s, c, a, cr, p] = await Promise.all([col.countDocuments({ role: "supporter" }), col.countDocuments({ role: "creator" }), col.countDocuments({ role: "admin" }), col.aggregate([{ $group: { _id: null, total: { $sum: "$credits" } } }]).toArray(), d.collection("payments").countDocuments({ status: "completed" })]);
    res.json({ totalSupporters: s, totalCreators: c, totalAdmins: a, totalCredits: cr[0]?.total ?? 0, totalPayments: p });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/users/admin/:id/role", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try { if (!["supporter", "creator", "admin"].includes(req.body.role)) return res.status(400).json({ error: "Invalid role" }); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); await getDb().collection("user").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role: req.body.role } }); res.json({ message: "Role updated" }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.delete("/api/users/admin/:id", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try { if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); await getDb().collection("user").deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ message: "User deleted" }); } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── CAMPAIGN ROUTES ─────────────────────────────────────────────────
app.get("/api/campaigns/top", async (_: any, res: any) => {
  try { const c = await getDb().collection("campaigns").find({ status: "approved" }).sort({ amountRaised: -1 }).limit(6).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/campaigns", async (req: any, res: any) => {
  try {
    const d = getDb(); const f: any = { status: "approved" };
    if (req.query.search) f.$or = [{ campaignTitle: { $regex: req.query.search, $options: "i" } }, { creatorName: { $regex: req.query.search, $options: "i" } }];
    if (req.query.category && req.query.category !== "All") f.category = req.query.category;
    const c = await d.collection("campaigns").find(f).sort({ deadline: -1 }).toArray(); res.json(c);
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/campaigns/:id", async (req: any, res: any) => {
  try { if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); const c = await getDb().collection("campaigns").findOne({ _id: new ObjectId(req.params.id) }); if (!c) return res.status(404).json({ error: "Not found" }); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/campaigns/creator/mine", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try { const c = await getDb().collection("campaigns").find({ creatorEmail: req.user!.email }).sort({ deadline: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.post("/api/campaigns", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try {
    const d = getDb(); const b = req.body;
    if (!b.campaignTitle || !b.campaignStory || !b.category || !b.fundingGoal || !b.deadline) return res.status(400).json({ error: "Missing fields" });
    const campaign = { ...b, fundingGoal: Number(b.fundingGoal), minimumContribution: Number(b.minimumContribution) || 1, creatorEmail: req.user!.email, creatorName: req.user!.name, amountRaised: 0, status: "pending" as const, createdAt: new Date() };
    const r = await d.collection("campaigns").insertOne(campaign); res.status(201).json({ _id: r.insertedId, ...campaign });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.put("/api/campaigns/:id", requireAuth, requireRole("creator", "admin"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await d.collection("campaigns").findOne({ _id: new ObjectId(req.params.id) }); if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.creatorEmail !== req.user!.email && req.user!.role !== "admin") return res.status(403).json({ error: "Not authorized" });
    const u: any = {}; if (req.body.campaignTitle !== undefined) u.campaignTitle = req.body.campaignTitle; if (req.body.campaignStory !== undefined) u.campaignStory = req.body.campaignStory; if (req.body.rewardInfo !== undefined) u.rewardInfo = req.body.rewardInfo;
    await d.collection("campaigns").updateOne({ _id: new ObjectId(req.params.id) }, { $set: u }); res.json({ message: "Updated" });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.delete("/api/campaigns/:id", requireAuth, requireRole("creator", "admin"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await d.collection("campaigns").findOne({ _id: new ObjectId(req.params.id) }); if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.creatorEmail !== req.user!.email && req.user!.role !== "admin") return res.status(403).json({ error: "Not authorized" });
    const approved = await d.collection("contributions").find({ campaignId: req.params.id, status: "approved" }).toArray();
    for (const c of approved) { await d.collection("user").updateOne({ email: c.supporterEmail }, { $inc: { credits: c.contributionAmount } }); await d.collection("contributions").updateOne({ _id: c._id }, { $set: { status: "rejected" } }); }
    await d.collection("campaigns").deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ message: "Deleted" });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/campaigns/admin/all", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const c = await getDb().collection("campaigns").find().sort({ createdAt: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/campaigns/admin/pending", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const c = await getDb().collection("campaigns").find({ status: "pending" }).sort({ createdAt: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/campaigns/:id/approve", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await d.collection("campaigns").findOne({ _id: new ObjectId(req.params.id) }); if (!existing) return res.status(404).json({ error: "Not found" });
    await d.collection("campaigns").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "approved" } });
    await d.collection("notifications").insertOne({ message: `Your campaign "${existing.campaignTitle}" has been approved.`, toEmail: existing.creatorEmail, actionRoute: "/dashboard/my-campaigns", time: new Date(), read: false });
    res.json({ message: "Approved" });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/campaigns/:id/reject", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const existing = await d.collection("campaigns").findOne({ _id: new ObjectId(req.params.id) }); if (!existing) return res.status(404).json({ error: "Not found" });
    await d.collection("campaigns").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "rejected" } });
    await d.collection("notifications").insertOne({ message: `Your campaign "${existing.campaignTitle}" has been rejected.`, toEmail: existing.creatorEmail, actionRoute: "/dashboard/my-campaigns", time: new Date(), read: false });
    res.json({ message: "Rejected" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── CONTRIBUTION ROUTES ─────────────────────────────────────────────
app.post("/api/contributions", requireAuth, requireRole("supporter"), async (req: any, res: any) => {
  try {
    const d = getDb(); const b = req.body;
    if (!b.campaignId || !b.contributionAmount) return res.status(400).json({ error: "Missing fields" });
    if (!ObjectId.isValid(b.campaignId)) return res.status(400).json({ error: "Invalid ID" });
    const campaign = await d.collection("campaigns").findOne({ _id: new ObjectId(b.campaignId) }); if (!campaign) return res.status(404).json({ error: "Not found" });
    if (campaign.status !== "approved") return res.status(400).json({ error: "Campaign not approved" });
    const amount = Number(b.contributionAmount); if (amount < campaign.minimumContribution) return res.status(400).json({ error: `Min ${campaign.minimumContribution}` });
    const user = await d.collection("user").findOne({ email: req.user!.email }); if (!user || user.credits < amount) return res.status(400).json({ error: "Insufficient credits" });
    await d.collection("user").updateOne({ email: req.user!.email }, { $inc: { credits: -amount } });
    const contribution = { campaignId: b.campaignId, campaignTitle: b.campaignTitle || campaign.campaignTitle, contributionAmount: amount, supporterEmail: req.user!.email, supporterName: req.user!.name, creatorEmail: b.creatorEmail || campaign.creatorEmail, creatorName: b.creatorName || campaign.creatorName, currentDate: new Date().toISOString(), status: "pending" as const };
    const r = await d.collection("contributions").insertOne(contribution);
    await d.collection("notifications").insertOne({ message: `${req.user!.name} contributed ${amount} credits to "${campaign.campaignTitle}".`, toEmail: campaign.creatorEmail, actionRoute: "/dashboard/creator-home", time: new Date(), read: false });
    res.status(201).json({ _id: r.insertedId, ...contribution });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/contributions/mine", requireAuth, requireRole("supporter"), async (req: any, res: any) => {
  try {
    const d = getDb(); const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.max(1, Number(req.query.limit) || 5); const skip = (page - 1) * limit;
    const f = { supporterEmail: req.user!.email }; const [items, total] = await Promise.all([d.collection("contributions").find(f).sort({ currentDate: -1 }).skip(skip).limit(limit).toArray(), d.collection("contributions").countDocuments(f)]);
    res.json({ contributions: items, total, page, totalPages: Math.ceil(total / limit) });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/contributions/approved", requireAuth, requireRole("supporter"), async (req: any, res: any) => {
  try { const c = await getDb().collection("contributions").find({ supporterEmail: req.user!.email, status: "approved" }).sort({ currentDate: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/contributions/pending", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try { const c = await getDb().collection("contributions").find({ creatorEmail: req.user!.email, status: "pending" }).sort({ currentDate: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/contributions/by-campaign", requireAuth, async (req: any, res: any) => {
  try { const c = await getDb().collection("contributions").find({ campaignId: req.query.campaignId }).sort({ currentDate: -1 }).toArray(); res.json(c); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/contributions/:id/approve", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const c = await d.collection("contributions").findOne({ _id: new ObjectId(req.params.id) }); if (!c) return res.status(404).json({ error: "Not found" });
    if (c.creatorEmail !== req.user!.email) return res.status(403).json({ error: "Not authorized" });
    await d.collection("contributions").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "approved" } });
    await d.collection("campaigns").updateOne({ _id: new ObjectId(c.campaignId) }, { $inc: { amountRaised: c.contributionAmount } });
    await d.collection("notifications").insertOne({ message: `Your contribution of ${c.contributionAmount} credits to "${c.campaignTitle}" was approved.`, toEmail: c.supporterEmail, actionRoute: "/dashboard/my-contributions", time: new Date(), read: false });
    res.json({ message: "Approved" });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/contributions/:id/reject", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const c = await d.collection("contributions").findOne({ _id: new ObjectId(req.params.id) }); if (!c) return res.status(404).json({ error: "Not found" });
    if (c.creatorEmail !== req.user!.email) return res.status(403).json({ error: "Not authorized" });
    await d.collection("contributions").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "rejected" } });
    await d.collection("user").updateOne({ email: c.supporterEmail }, { $inc: { credits: c.contributionAmount } });
    await d.collection("notifications").insertOne({ message: `Your contribution of ${c.contributionAmount} credits to "${c.campaignTitle}" was rejected. Credits refunded.`, toEmail: c.supporterEmail, actionRoute: "/dashboard/my-contributions", time: new Date(), read: false });
    res.json({ message: "Rejected and refunded" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── WITHDRAWAL ROUTES ───────────────────────────────────────────────
app.get("/api/withdrawals/earnings", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try { const d = getDb(); const campaigns = await d.collection("campaigns").find({ creatorEmail: req.user!.email, status: "approved" }).toArray(); const totalRaised = campaigns.reduce((s: number, c: any) => s + (c.amountRaised || 0), 0); res.json({ totalRaised, withdrawalAmount: totalRaised / 20 }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.post("/api/withdrawals", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try {
    const d = getDb(); const creditAmount = Number(req.body.withdrawalCredit); if (!creditAmount || creditAmount < 200) return res.status(400).json({ error: "Min 200 credits" });
    const campaigns = await d.collection("campaigns").find({ creatorEmail: req.user!.email, status: "approved" }).toArray();
    const totalRaised = campaigns.reduce((s: number, c: any) => s + (c.amountRaised || 0), 0);
    if (creditAmount > totalRaised) return res.status(400).json({ error: "Insufficient raised credits" });
    const w = { creatorEmail: req.user!.email, creatorName: req.user!.name, withdrawalCredit: creditAmount, withdrawalAmount: creditAmount / 20, paymentSystem: req.body.paymentSystem || "Stripe", accountNumber: req.body.accountNumber || "", withdrawDate: new Date().toISOString(), status: "pending" as const };
    const r = await d.collection("withdrawals").insertOne(w); res.status(201).json({ _id: r.insertedId, ...w });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/withdrawals/history", requireAuth, requireRole("creator"), async (req: any, res: any) => {
  try { const w = await getDb().collection("withdrawals").find({ creatorEmail: req.user!.email }).sort({ withdrawDate: -1 }).toArray(); res.json(w); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/withdrawals/pending", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const w = await getDb().collection("withdrawals").find({ status: "pending" }).sort({ withdrawDate: -1 }).toArray(); res.json(w); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/withdrawals/all", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const w = await getDb().collection("withdrawals").find({ status: { $ne: "pending" } }).sort({ withdrawDate: -1 }).toArray(); res.json(w); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/withdrawals/:id/approve", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try {
    const d = getDb(); if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" });
    const w = await d.collection("withdrawals").findOne({ _id: new ObjectId(req.params.id) }); if (!w) return res.status(404).json({ error: "Not found" });
    await d.collection("withdrawals").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "approved" } });
    const campaigns = await d.collection("campaigns").find({ creatorEmail: w.creatorEmail, status: "approved" }).sort({ deadline: -1 }).toArray();
    let remaining = w.withdrawalCredit; for (const c of campaigns) { if (remaining <= 0) break; const deduct = Math.min(c.amountRaised, remaining); await d.collection("campaigns").updateOne({ _id: c._id }, { $inc: { amountRaised: -deduct } }); remaining -= deduct; }
    await d.collection("notifications").insertOne({ message: `Your withdrawal of $${w.withdrawalAmount} has been processed.`, toEmail: w.creatorEmail, actionRoute: "/dashboard/creator-payment-history", time: new Date(), read: false });
    res.json({ message: "Approved" });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── PAYMENT ROUTES ──────────────────────────────────────────────────
app.post("/api/payments/create-checkout-session", requireAuth, async (req: any, res: any) => {
  try {
    const pkg = CREDIT_PACKAGES[Number(req.body.credits)]; if (!pkg) return res.status(400).json({ error: "Invalid package" });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], mode: "payment", customer_email: req.user!.email,
      line_items: [{ price_data: { currency: "usd", product_data: { name: `${pkg.credits} FundRise Credits` }, unit_amount: pkg.amount }, quantity: 1 }],
      metadata: { userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name, credits: pkg.credits.toString() },
      success_url: `${CLIENT_URL}/dashboard/purchase-credit?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${CLIENT_URL}/dashboard/purchase-credit?cancelled=true`,
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/payments/verify-session", requireAuth, async (req: any, res: any) => {
  try {
    const { sessionId } = req.body; if (!sessionId) return res.status(400).json({ error: "Session ID required" });
    const session = await stripe.checkout.sessions.retrieve(sessionId); if (session.payment_status !== "paid") return res.status(400).json({ error: "Not paid" });
    const d = getDb(); const existing = await d.collection("payments").findOne({ stripeSessionId: sessionId }); if (existing) return res.json({ message: "Already processed" });
    const credits = Number(session.metadata?.credits || 0); const userEmail = session.metadata?.userEmail || req.user!.email;
    await d.collection("payments").insertOne({ userEmail, userName: req.user!.name, credits, amount: (session.amount_total || 0) / 100, method: "Stripe", date: new Date().toISOString(), status: "completed", stripeSessionId: sessionId });
    await d.collection("user").updateOne({ email: userEmail }, { $inc: { credits } });
    res.json({ message: "Verified", credits });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/payments", requireAuth, async (req: any, res: any) => {
  try {
    const d = getDb(); const { credits, amount, method } = req.body; if (!credits || !amount) return res.status(400).json({ error: "Missing fields" });
    const payment = { userEmail: req.user!.email, userName: req.user!.name, credits: Number(credits), amount: Number(amount), method: method || "Stripe", date: new Date().toISOString(), status: "completed" as const };
    const r = await d.collection("payments").insertOne(payment); await d.collection("user").updateOne({ email: req.user!.email }, { $inc: { credits: Number(credits) } });
    res.status(201).json({ _id: r.insertedId, ...payment });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/payments/mine", requireAuth, async (req: any, res: any) => {
  try { const p = await getDb().collection("payments").find({ userEmail: req.user!.email }).sort({ date: -1 }).toArray(); res.json(p); } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/payments/all", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const p = await getDb().collection("payments").find().sort({ date: -1 }).toArray(); res.json(p); } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── NOTIFICATION ROUTES ─────────────────────────────────────────────
app.get("/api/notifications", requireAuth, async (req: any, res: any) => {
  try { const n = await getDb().collection("notifications").find({ toEmail: req.user!.email }).sort({ time: -1 }).toArray(); res.json(n); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/notifications/:id/read", requireAuth, async (req: any, res: any) => {
  try { if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); await getDb().collection("notifications").updateOne({ _id: new ObjectId(req.params.id), toEmail: req.user!.email }, { $set: { read: true } }); res.json({ message: "Marked read" }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/notifications/read-all", requireAuth, async (req: any, res: any) => {
  try { await getDb().collection("notifications").updateMany({ toEmail: req.user!.email, read: false }, { $set: { read: true } }); res.json({ message: "All read" }); } catch { res.status(500).json({ error: "Failed" }); }
});
app.delete("/api/notifications/:id", requireAuth, async (req: any, res: any) => {
  try { if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); await getDb().collection("notifications").deleteOne({ _id: new ObjectId(req.params.id), toEmail: req.user!.email }); res.json({ message: "Deleted" }); } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── REPORT ROUTES ───────────────────────────────────────────────────
app.post("/api/reports", requireAuth, async (req: any, res: any) => {
  try {
    const d = getDb(); const { campaignId, campaignTitle, reason } = req.body; if (!campaignId || !reason) return res.status(400).json({ error: "Missing fields" });
    if (!ObjectId.isValid(campaignId)) return res.status(400).json({ error: "Invalid ID" });
    const campaign = await d.collection("campaigns").findOne({ _id: new ObjectId(campaignId) }); if (!campaign) return res.status(404).json({ error: "Not found" });
    const report = { campaignId, campaignTitle: campaignTitle || campaign.campaignTitle, reporterName: req.user!.name, reporterEmail: req.user!.email, reason, date: new Date().toISOString(), status: "open" as const };
    const r = await d.collection("reports").insertOne(report); res.status(201).json({ _id: r.insertedId, ...report });
  } catch { res.status(500).json({ error: "Failed" }); }
});
app.get("/api/reports", requireAuth, requireRole("admin"), async (_: any, res: any) => {
  try { const r = await getDb().collection("reports").find().sort({ date: -1 }).toArray(); res.json(r); } catch { res.status(500).json({ error: "Failed" }); }
});
app.patch("/api/reports/:id/resolve", requireAuth, requireRole("admin"), async (req: any, res: any) => {
  try { if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid ID" }); await getDb().collection("reports").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "resolved" } }); res.json({ message: "Resolved" }); } catch { res.status(500).json({ error: "Failed" }); }
});

// ─── BETTER-AUTH CATCH-ALL (must be last) ───────────────────────────
app.all("/api/auth/*", async (req: any, res: any) => {
  try {
    const url = new URL(req.originalUrl!, `http://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) { if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value)); }
    const webRequest = new Request(url.toString(), { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body) });
    const response = await authProxy.handler(webRequest);
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => { res.setHeader(key, value); });
    res.send(await response.text());
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── VERCEL SERVERLESS HANDLER ───────────────────────────────────────
let connected = false;

export default async function handler(req: any, res: any) {
  try {
    if (!connected) { await connectToDatabase(); connected = true; }
    return app(req, res);
  } catch (err: any) {
    console.error("Handler error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
