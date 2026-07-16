import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as notification from "../controllers/notificationController";
const router = Router();
router.get("/", requireAuth, notification.listByUser);
router.patch("/:id/read", requireAuth, notification.markRead);
router.patch("/read-all", requireAuth, notification.markAllRead);
router.delete("/:id", requireAuth, notification.remove);
export default router;
