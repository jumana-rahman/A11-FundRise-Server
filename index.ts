import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectToDatabase, getDb } from "./lib/db";
import { auth } from "./lib/auth";
import { signJWT } from "./lib/jwt";
import campaignRoutes from "./routes/campaigns";
import contributionRoutes from "./routes/contributions";
import userRoutes from "./routes/users";
import withdrawalRoutes from "./routes/withdrawals";
import paymentRoutes from "./routes/payments";
import notificationRoutes from "./routes/notifications";
import reportRoutes from "./routes/reports";
import { grantRegistrationCredits } from "./controllers/userController";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}) as any);
app.use(express.json());
app.use(cookieParser());

// Better Auth handler — build a Web API Request for better-auth
app.all("/api/auth/*", async (req: any, res: any) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // Build a proper Web API Headers object from Express headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
      }
    }

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const response = await auth.handler(webRequest);

    res.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.send(body);
  } catch (error) {
    console.error("Auth handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// JWT endpoint — called by frontend after successful better-auth sign-in/sign-up
app.post("/api/auth/jwt", async (req: any, res: any) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return res.status(401).json({ error: "No active session" });
    }

    const token = await signJWT({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as any).role ?? "supporter",
      credits: (session.user as any).credits ?? 0,
      photoUrl: (session.user as any).photoUrl ?? "",
    });

    res.json({ token });
  } catch (error) {
    console.error("JWT generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.get("/api/health", async (_: any, res: any) => {
  try {
    const db = getDb();
    await db.command({ ping: 1 });
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: "ok", database: "disconnected", timestamp: new Date().toISOString() });
  }
});

// Routes
app.use("/api/campaigns", campaignRoutes);
app.use("/api/contributions", contributionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);

// Grant registration credits (called by frontend after sign-up)
app.post("/api/auth/register-credits", async (req: any, res: any) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return res.status(401).json({ error: "No active session" });
    }
    const role = (session.user as any).role ?? req.body.role ?? "supporter";
    await grantRegistrationCredits(session.user.email, role);
    res.json({ message: "Credits granted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to grant credits" });
  }
});

async function start() {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
