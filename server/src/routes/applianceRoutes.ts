import { Router, Request, Response } from 'express';
import {
  searchAppliances,
  getApplianceByBrandModel,
  getAppliancesByCategory,
} from '../services/applianceService';

const router = Router();

/** Search appliances by brand and/or model */
router.get('/search', (req: Request, res: Response) => {
  const { brand, model, q } = req.query;

  // Free-text search
  if (typeof q === 'string' && q.length > 0) {
    const results = searchAppliances(q);
    res.json({ success: true, data: results });
    return;
  }

  // Brand + model lookup
  if (typeof brand === 'string') {
    const result = getApplianceByBrandModel(
      brand,
      typeof model === 'string' ? model : undefined
    );
    res.json({ success: true, data: result });
    return;
  }

  res.status(400).json({
    success: false,
    error: 'Provide ?q=search_term or ?brand=X&model=Y',
  });
});

/** Get all appliances in a category */
router.get('/category/:category', (req: Request, res: Response) => {
  const { category } = req.params;
  const results = getAppliancesByCategory(category);
  res.json({ success: true, data: results });
});

export default router;
