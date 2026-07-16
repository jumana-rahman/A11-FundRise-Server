import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as payment from "../controllers/paymentController";
const router = Router();
// Stripe
router.post("/create-checkout-session", requireAuth, payment.createCheckoutSession);
router.post("/verify-session", requireAuth, payment.verifySession);
// Any authenticated user
router.post("/", requireAuth, payment.create);
router.get("/mine", requireAuth, payment.listByUser);
// Admin
router.get("/all", requireAuth, requireRole("admin"), payment.listAll);
export default router;
