import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as campaign from "../controllers/campaignController";
const router = Router();
// Public
router.get("/top", campaign.getTopFunded);
router.get("/", campaign.listApproved);
router.get("/:id", campaign.getById);
// Creator
router.get("/creator/mine", requireAuth, requireRole("creator"), campaign.listByCreator);
router.post("/", requireAuth, requireRole("creator"), campaign.create);
router.put("/:id", requireAuth, requireRole("creator", "admin"), campaign.update);
router.delete("/:id", requireAuth, requireRole("creator", "admin"), campaign.remove);
// Admin
router.get("/admin/all", requireAuth, requireRole("admin"), campaign.listAll);
router.get("/admin/pending", requireAuth, requireRole("admin"), campaign.listPending);
router.patch("/:id/approve", requireAuth, requireRole("admin"), campaign.approve);
router.patch("/:id/reject", requireAuth, requireRole("admin"), campaign.reject);
export default router;
