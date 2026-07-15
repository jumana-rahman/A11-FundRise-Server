import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as report from "../controllers/reportController";

const router = Router();

// Any authenticated user can report
router.post("/", requireAuth, report.create);

// Admin
router.get("/", requireAuth, requireRole("admin"), report.listAll);
router.patch("/:id/resolve", requireAuth, requireRole("admin"), report.resolve);

export default router;
