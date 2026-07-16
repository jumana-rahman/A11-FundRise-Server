import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as user from "../controllers/userController";
const router = Router();
// Profile
router.get("/me", requireAuth, user.getProfile);
router.put("/me", requireAuth, user.updateProfile);
router.get("/credits", requireAuth, user.getCredits);
router.post("/credits", requireAuth, user.addCredits);
// Admin
router.get("/admin/all", requireAuth, requireRole("admin"), user.listAll);
router.get("/admin/stats", requireAuth, requireRole("admin"), user.getStats);
router.patch("/admin/:id/role", requireAuth, requireRole("admin"), user.updateRole);
router.delete("/admin/:id", requireAuth, requireRole("admin"), user.remove);
export default router;
