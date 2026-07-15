import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectToDatabase } from "./lib/db";
import { auth } from "./lib/auth";
import { signJWT } from "./lib/jwt";
import campaignRoutes from "./routes/campaigns";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Better Auth handler — cast to any to bypass strict typing
app.all("/api/auth/*", async (req: any, res: any) => {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const response = await auth.handler({
      method: req.method,
      url: url.toString(),
      headers: req.headers,
      body: req.body,
      query: Object.fromEntries(url.searchParams),
    });

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

app.get("/api/health", (_: any, res: any) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/campaigns", campaignRoutes);

async function start() {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
