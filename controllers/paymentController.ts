import { type Response } from "express";
import Stripe from "stripe";
import { getDb } from "../lib/db";
import type { AuthRequest } from "../middleware/auth";
import type { Payment } from "../types";

const COLLECTION = "payments";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia" as any,
});

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const CREDIT_PACKAGES: Record<number, { credits: number; priceId: string; amount: number }> = {
  100: { credits: 100, priceId: "price_100_credits", amount: 1000 },
  300: { credits: 300, priceId: "price_300_credits", amount: 2500 },
  800: { credits: 800, priceId: "price_800_credits", amount: 6000 },
  1500: { credits: 1500, priceId: "price_1500_credits", amount: 11000 },
};

// Create Stripe Checkout Session
export async function createCheckoutSession(req: AuthRequest, res: Response) {
  try {
    const { credits } = req.body;
    const pkg = CREDIT_PACKAGES[Number(credits)];

    if (!pkg) {
      return res.status(400).json({ error: "Invalid credit package" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: req.user!.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${pkg.credits} FundRise Credits`,
              description: `Purchase ${pkg.credits} credits for ${pkg.amount / 100} USD`,
            },
            unit_amount: pkg.amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.user!.id,
        userEmail: req.user!.email,
        userName: req.user!.name,
        credits: pkg.credits.toString(),
      },
      success_url: `${CLIENT_URL}/dashboard/purchase-credit?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/dashboard/purchase-credit?cancelled=true`,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
}

// Verify session and add credits
export async function verifySession(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const credits = Number(session.metadata?.credits || 0);
    const userEmail = session.metadata?.userEmail || req.user!.email;

    // Check if already processed
    const db = getDb();
    const existing = await db.collection(COLLECTION).findOne({
      stripeSessionId: sessionId,
    });
    if (existing) {
      return res.json({ message: "Payment already processed", credits });
    }

    // Record payment
    const payment: Payment = {
      userEmail,
      userName: req.user!.name,
      credits,
      amount: (session.amount_total || 0) / 100,
      method: "Stripe",
      date: new Date().toISOString(),
      status: "completed",
      stripeSessionId: sessionId,
    };

    await db.collection(COLLECTION).insertOne(payment);

    // Add credits to user
    await db.collection("users").updateOne(
      { email: userEmail },
      { $inc: { credits } }
    );

    res.json({ message: "Payment verified and credits added", credits });
  } catch (error: any) {
    console.error("Stripe verify error:", error);
    res.status(500).json({ error: error.message || "Failed to verify payment" });
  }
}

// Record a payment (fallback for non-Stripe)
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

    // Add credits to user
    await db.collection("users").updateOne(
      { email: req.user!.email },
      { $inc: { credits: Number(credits) } }
    );

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
