import { Request, Response } from 'express';
import {
  searchAppliances,
  getApplianceByBrandModel,
} from '../services/applianceService';

export function handleSearch(req: Request, res: Response): void {
  const { brand, model, q } = req.query;

  if (typeof q === 'string' && q.length > 0) {
    const results = searchAppliances(q);
    res.json({ success: true, data: results });
    return;
  }

  if (typeof brand === 'string') {
    const results = getApplianceByBrandModel(
      brand,
      typeof model === 'string' ? model : undefined
    );
    res.json({ success: true, data: results });
    return;
  }

  res.status(400).json({
    success: false,
    error: 'Provide ?q=search_term or ?brand=X&model=Y',
  });
}
