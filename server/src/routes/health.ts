import { Router, Request, Response } from "express";
import { isDBConnected } from "../db";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const dbConnected = await isDBConnected();
  res.json({ status: "ok", dbConnected });
});

export default router;
