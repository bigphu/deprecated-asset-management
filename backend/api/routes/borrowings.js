const express = require('express');
const { asyncHandler, uuidParam } = require('../errors');
const { deny, requireAnyPermission, requirePermissions } = require('../middleware/permissions');
const { parseHistoryQuery, toBorrowingDto } = require('../dto/borrowings.dto');
const borrowings = require('../../repositories/borrowings.repo');

const router = express.Router();

/*
 * Borrowing records (US-11 return, US-12 history). Mirrored by
 * frontend/src/features/borrowings/api/borrowings.api.ts:
 *
 *   GET  /api/borrowings/history      ?page&pageSize&sort&direction&status&search&borrowerUserId
 *                                     -> 200 { items: Borrowing[], total, page, pageSize }   (ADR-0003)
 *                                        borrowings.view sees every record; borrowings.viewOwn only
 *                                        the caller's own, and naming another user is a 403
 *   POST /api/borrowings/:id/return   -> 200 Borrowing | 404 | 409 ALREADY_RETURNED
 *
 * "History" is every record, open ones included; `status=ACTIVE` is the list
 * of assets still out. The return time is the database clock, never the client's.
 */

router.param('id', uuidParam('Borrowing record'));

router.get(
  '/history',
  requireAnyPermission('borrowings.view', 'borrowings.viewOwn'),
  asyncHandler(async (req, res) => {
    const query = parseHistoryQuery(req.query);
    if (!req.auth.permissionSet.has('borrowings.view')) {
      const { borrowerUserId } = query.filters;
      if (borrowerUserId && borrowerUserId !== req.user.id) {
        throw deny(req, { required: ['borrowings.view'] }, 'You can only view your own borrowing history');
      }
      query.filters.borrowerUserId = req.user.id;
    }
    const page = await borrowings.listBorrowingHistory(query);
    res.json({ ...page, items: page.items.map(toBorrowingDto) });
  }),
);

router.post(
  '/:id/return',
  requirePermissions('borrowings.return'),
  asyncHandler(async (req, res) => {
    const borrowing = await borrowings.returnBorrowing(req.params.id, req.user.id);
    res.json(toBorrowingDto(borrowing));
  }),
);

module.exports = router;
