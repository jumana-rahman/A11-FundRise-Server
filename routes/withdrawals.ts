import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as withdrawal from "../controllers/withdrawalController";

const router = Router();

// Creator
router.get("/earnings", requireAuth, requireRole("creator"), withdrawal.getEarnings);
router.post("/", requireAuth, requireRole("creator"), withdrawal.create);
router.get("/history", requireAuth, requireRole("creator"), withdrawal.listByCreator);

// Admin
router.get("/pending", requireAuth, requireRole("admin"), withdrawal.listPending);
router.get("/all", requireAuth, requireRole("admin"), withdrawal.listAll);
router.patch("/:id/approve", requireAuth, requireRole("admin"), withdrawal.approve);

export default router;
