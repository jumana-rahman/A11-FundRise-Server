import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as contribution from "../controllers/contributionController";
const router = Router();
// Supporter
router.post("/", requireAuth, requireRole("supporter"), contribution.create);
router.get("/mine", requireAuth, requireRole("supporter"), contribution.listBySupporter);
router.get("/approved", requireAuth, requireRole("supporter"), contribution.listApprovedForSupporter);
// Creator
router.get("/pending", requireAuth, requireRole("creator"), contribution.listPendingForCreator);
router.get("/by-campaign", requireAuth, contribution.listByCampaign);
router.patch("/:id/approve", requireAuth, requireRole("creator"), contribution.approve);
router.patch("/:id/reject", requireAuth, requireRole("creator"), contribution.reject);
export default router;
