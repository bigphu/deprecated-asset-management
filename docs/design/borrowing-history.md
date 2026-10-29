# Borrowing history: list, record details and activity log (US-12, US-11-T5)

Design of the **Borrowings** page (`/borrowings`, needs `borrowings.view` or `borrowings.viewOwn`). It is implemented, so this
document describes the real screens (the Active tab, the History tab and the record details dialog),
not a mock-up. Load `borrowings-demo-seed.sql` from `docs/api/` to see them with data.

## Layout

One page, two views over the same endpoint (`GET /api/borrowings/history`), switched by a segmented control
(`Active` / `History`, exposed as toggle buttons with `aria-pressed`) with a search field on the right.

| View | Rows | Sort | Columns |
|---|---|---|---|
| Active | `status=ACTIVE` | due date, soonest first (records without one last) | Asset, Borrower, Borrow date, Due date, Status, action |
| History | every record | borrowed date, newest first | Asset, Borrower, Borrow date, Due date, Actual return date, Status, action |

- **Borrower** is the name on the record; **Asset** is its name and tag; the three dates are the borrow date, the due date
  and the actual return date (an em dash while not returned).
- **Asset** cell: name over the asset tag (monospace). It is a button that opens the record details.
- **Status** badge: `Borrowed` (warning), `Overdue` (critical: open and past its due date, also shown by a red due
  date), `Returned` (good), `Returned late` (warning, i.e. `OVERDUE_RETURNED`).
- **Action** cell: a `Return` button on open records, only for users with `borrowings.return`; it opens a confirmation
  dialog (asset, borrower, due date) before anything is sent.
- Footer: "Showing x–y of N records" and numbered pagination (25 per page).
- Search matches asset tag, asset name or borrower name, case-insensitively, after a 300 ms pause; it restarts at page 1.

## Record details

A dialog titled "Borrowing details" with one label/value row per field, reusing the list row (no second request):
asset, asset tag, type, current asset status, borrower, status, borrow date, due date, actual return date, recorded by,
returned to, note. Missing values show an em dash. An archived asset is marked "(archived)"; its records stay in the history.

## Who sees what (US-12-T4)

The same page serves two audiences; the API decides what comes back, the UI only adapts the wording.

| Session | Title | Records |
|---|---|---|
| `borrowings.view` (Admin, Asset Manager) | **Borrowings** | every record; `Return` for those who also hold `borrowings.return` |
| `borrowings.viewOwn` only (Borrower) | **My borrowings** | only records linked to their own account; never a `Return` button |

The menu shows **Borrowings** for either permission. A borrower's list is limited by the server, so editing the URL or
the request cannot reach another person's records (asking for another user's id is a 403).

## Activity log (US-11-T5)

**Activity** (`/activity`, needs `activity.view`) is a read-only, paged table of the asset timeline, newest first:

| Column | Content |
|---|---|
| Time | local date and time down to the second |
| Action | `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_ARCHIVED`, `ASSET_RESTORED`, `ASSET_LOANED` or `ASSET_RETURNED` |
| User | display name over the user's id; "System" when nobody performed it |
| Asset | name over tag (archived assets stay listed) |
| Description | for example `Asset LAP-1002 returned` |

A filter above the table narrows it to one action. Borrower names and e-mail addresses are not part of the log.

## States

| State | What is shown |
|---|---|
| Loading | "Loading borrowings…" inside the table; later pages keep the previous rows, dimmed |
| Error | "Couldn't load borrowings" |
| Nothing out on loan | "No assets are out on loan" |
| No activity | "No activity yet" (or "No activity matches this filter") |
| No history | "No borrowing records yet" |
| No search match | "No records match your search" |
| Return fails (for example already returned) | the server message in the dialog, which stays open; the list refreshes |

## Accessibility and styling

- Every interactive element is a real button or link. Accessible names contain the visible text: the asset button is
  `<asset name> <tag>, view details`, the action is `Return <tag>`.
- Times on screen are shown in the browser's local time zone; the API returns UTC timestamps.
- Colour is never the only signal: statuses are words, and overdue also has the badge text.
- Styling uses the Material Design 3 tokens only; `npm run check` (M3, contrast, a11y gates) passes.

## Not included

Sorting by clicking column headers (the API supports `sort`/`direction`; the UI picks a fixed sensible order per view),
a per-asset history page, and creating a borrowing (no checkout endpoint exists yet; `docs/api/borrowings-demo-seed.sql`
loads demo records with SQL).
