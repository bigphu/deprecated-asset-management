# Permission matrix

Which built-in role may do what. The source of truth is the database (`fw_permissions`, `fw_role_permissions`);
this table was generated from it. Built-in role grants are immutable at runtime (trigger
`fw_role_permissions_system_immutable`): they change only through a migration. Anything else is a custom role,
managed on the Access control page.

| Permission | Description | Admin | Asset Manager | Viewer | Borrower |
|---|---|---|---|---|---|
| **`activity.view`** | View the asset activity log | Yes | Yes | No | No |
| `assets.archive` | Archive assets | Yes | Yes | No | No |
| `assets.create` | Create assets | Yes | Yes | No | No |
| `assets.restore` | Restore archived assets | Yes | Yes | No | No |
| `assets.update` | Update assets | Yes | Yes | No | No |
| `assets.view` | View assets and asset reference data | Yes | Yes | Yes | No |
| **`borrowings.return`** | Record the return of a borrowed asset | Yes | Yes | No | No |
| **`borrowings.view`** | View the borrowing history and active borrowings | Yes | Yes | No | No |
| **`borrowings.viewOwn`** | View your own borrowing history | Yes | No | No | Yes |
| `exportProfiles.create` | Create private export profiles | Yes | Yes | No | No |
| `exportProfiles.delete` | Delete private export profiles | Yes | Yes | No | No |
| `exportProfiles.update` | Update private export profiles | Yes | Yes | No | No |
| `exportProfiles.view` | View private export profiles | Yes | Yes | No | No |
| `exports.run` | Export asset data | Yes | Yes | No | No |
| `roles.assign` | Assign roles to users | Yes | No | No | No |
| `roles.create` | Create roles | Yes | No | No | No |
| `roles.update` | Update roles | Yes | No | No | No |
| `roles.view` | View permissions and roles | Yes | No | No | No |
| `users.view` | View users | Yes | No | No | No |

## Returning an asset (US-11)

| Role | May return a borrowed asset? | Why |
|---|---|---|
| Admin | Yes | Holds every permission, including `borrowings.return`. |
| Asset Manager | Yes | Granted `borrowings.view` and `borrowings.return` by migration `006_borrowings.sql`. |
| Viewer | No | Read-only role; no borrowings permission. |
| Borrower | No | Built-in role (migration `007`) that holds only `borrowings.viewOwn`: it can look at its own history, not change anything. |

- The task text's `ASSET_RETURN` authority is the permission key **`borrowings.return`**.
- `POST /api/borrowings/:id/return` is guarded by `requirePermissions('borrowings.return')`
  (`backend/api/routes/borrowings.js`); it also needs a valid session, an approved `Origin` and the CSRF token.
- `borrowings.return` requires `borrowings.view` in a custom role: the API rejects a role without it
  (`backend/services/rbac.service.js`) and the role editor enforces the same rule
  (`frontend/src/features/access-control/permissionPrerequisites.ts`).
- In the UI the **Return** button is shown only to a session that holds `borrowings.return`; the server check is what protects the data.

## Who sees which borrowing history (US-12)

| Role | Sees | How it is enforced |
|---|---|---|
| Admin, Asset Manager | Every record (`borrowings.view`); may narrow the list to one user with `borrowerUserId`. | `GET /api/borrowings/history` needs `borrowings.view` **or** `borrowings.viewOwn`. |
| Borrower | Only the records linked to their own account (`borrowings.viewOwn`). | The API pins the list to the caller's user id. Naming another user in `borrowerUserId` is a **403** and is recorded as a security event. |
| Viewer | Nothing. | No borrowings permission. |

- A record that carries only a borrower name (no `borrower_user_id`) is visible to staff only.
- Today only the demo seed (`docs/api/borrowings-demo-seed.sql`) links a loan to an account: there is no checkout endpoint yet.
- The page title tells which view it is: **Borrowings** for staff, **My borrowings** for a borrower.

## Activity log (US-11-T5)

`GET /api/activity` and the Activity page need `activity.view`: Admin and Asset Manager. Borrower and Viewer cannot read it.

## Notes

- `borrowings.*` and `activity.view` are independent of `assets.*`. The history keeps records of archived assets and shows their tag, name,
  type and status to anyone with `borrowings.view`; returning an asset changes its status from On loan to Available
  without `assets.update`. Built-in roles are unaffected; review that when building a custom role.
