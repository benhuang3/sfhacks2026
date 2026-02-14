import { Request, Response, NextFunction } from "express";
import { insertScanSchema, similarSearchSchema, resolveSchema } from "../validation/scan";
import * as scanService from "../services/scan";

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

// POST /scans/resolve — cache-aware resolve
export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = resolveSchema.parse(req.body);
    const result = await scanService.resolveScan(body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
