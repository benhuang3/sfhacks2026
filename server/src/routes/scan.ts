import { Router } from "express";
import { createScan, similarSearch, resolve } from "../controllers/scan";

const router = Router();

router.post("/", createScan);
router.post("/similar", similarSearch);
router.post("/resolve", resolve);

export default router;
