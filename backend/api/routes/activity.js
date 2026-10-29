const express = require('express');
const { asyncHandler } = require('../errors');
const { requirePermissions } = require('../middleware/permissions');
const { parseActivityQuery, toActivityDto } = require('../dto/activity.dto');
const activity = require('../../repositories/activity.repo');

const router = express.Router();

/*
 * Activity log (US-11-T5), read-only. Mirrored by frontend/src/features/activity/api/activity.api.ts:
 *
 *   GET /api/activity      ?page&pageSize&action
 *                          -> 200 { items: ActivityEntry[], total, page, pageSize }   (ADR-0003)
 */

router.get(
  '/',
  requirePermissions('activity.view'),
  asyncHandler(async (req, res) => {
    const page = await activity.listActivity(parseActivityQuery(req.query));
    res.json({ ...page, items: page.items.map(toActivityDto) });
  }),
);

module.exports = router;
