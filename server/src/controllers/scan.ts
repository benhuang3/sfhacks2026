import { Request, Response, NextFunction } from "express";
import { insertScanSchema, similarSearchSchema, resolveSchema } from "../validation/scan";
import * as scanService from "../services/scan";
import { fetchPowerProfile } from "../services/powerProfile";

// POST /scans — insert a new scan document
export async function createScan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = insertScanSchema.parse(req.body);
    const insertedId = await scanService.insertScan(body);
    res.status(201).json({ success: true, data: { insertedId } });
  } catch (err) {
    next(err);
  }
}

// POST /scans/similar — vector similarity search
export async function similarSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, embedding, k } = similarSearchSchema.parse(req.body);
    const result = await scanService.findSimilarScans(userId, embedding, k);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// POST /scans/resolve — cache-aware resolve + power profile from be/
export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = resolveSchema.parse(req.body);
    const result = await scanService.resolveScan(body);

    // After resolving the scan, call the Python Power Agent for energy data
    const powerProfile = await fetchPowerProfile(result.result.label);

    res.json({
      success: true,
      data: {
        ...result,
        powerProfile: powerProfile?.profile ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
