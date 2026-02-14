import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { lookupPowerProfile, seedCategoryDefaults } from "../services/powerProfile";

const powerProfileSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  name: z.string().min(1),
  region: z.string().default("US"),
});

// POST /power-profile — estimate power consumption via Gemini + cache
export async function getPowerProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = powerProfileSchema.parse(req.body);
    const result = await lookupPowerProfile(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// POST /power-profile/seed-defaults — seed category defaults into MongoDB
export async function seedDefaults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await seedCategoryDefaults();
    res.json({ success: true, data: { seeded: count } });
  } catch (err) {
    next(err);
  }
}
