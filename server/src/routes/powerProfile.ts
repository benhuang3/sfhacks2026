import { Router } from "express";
import { getPowerProfile, seedDefaults } from "../controllers/powerProfile";

const router = Router();

router.post("/", getPowerProfile);
router.post("/seed-defaults", seedDefaults);

export default router;
