import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as payment from "../controllers/paymentController";

const router = Router();

// Any authenticated user
router.post("/", requireAuth, payment.create);
router.get("/mine", requireAuth, payment.listByUser);

// Admin
router.get("/all", requireAuth, requireRole("admin"), payment.listAll);

export default router;
