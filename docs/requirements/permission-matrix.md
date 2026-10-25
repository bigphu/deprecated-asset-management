# Permission matrix

Which built-in role may do what. The source of truth is the database (`fw_permissions`, `fw_role_permissions`);
this table was generated from it. Built-in role grants are immutable at runtime (trigger
`fw_role_permissions_system_immutable`): they change only through a migration. Anything else is a custom role,
managed on the Access control page.

| Permission | Description | Admin | Asset Manager | Viewer |
|---|---|---|---|---|
| `assets.archive` | Archive assets | Yes | Yes | No |
| `assets.create` | Create assets | Yes | Yes | No |
| `assets.restore` | Restore archived assets | Yes | Yes | No |
| `assets.update` | Update assets | Yes | Yes | No |
| `assets.view` | View assets and asset reference data | Yes | Yes | Yes |
| **`borrowings.return`** | Record the return of a borrowed asset | Yes | Yes | No |
| **`borrowings.view`** | View the borrowing history and active borrowings | Yes | Yes | No |
| `exportProfiles.create` | Create private export profiles | Yes | Yes | No |
| `exportProfiles.delete` | Delete private export profiles | Yes | Yes | No |
| `exportProfiles.update` | Update private export profiles | Yes | Yes | No |
| `exportProfiles.view` | View private export profiles | Yes | Yes | No |
| `exports.run` | Export asset data | Yes | Yes | No |
| `roles.assign` | Assign roles to users | Yes | No | No |
| `roles.create` | Create roles | Yes | No | No |
| `roles.update` | Update roles | Yes | No | No |
| `roles.view` | View permissions and roles | Yes | No | No |
| `users.view` | View users | Yes | No | No |

## Returning an asset (US-11)

| Role | May return a borrowed asset? | Why |
|---|---|---|
| Admin | Yes | Holds every permission, including `borrowings.return`. |
| Asset Manager | Yes | Granted `borrowings.view` and `borrowings.return` by migration `006_borrowings.sql`. |
| Viewer | No | Read-only role. It is not granted any borrowings permission, because borrower names are personal data. |
| Borrower | n/a | Borrowers are not system users (a loan stores `borrower_name` as text), so there is no Borrower role. |

- The task text's `ASSET_RETURN` authority is the permission key **`borrowings.return`**.
- Endpoint: `POST /api/borrowings/:id/return` is guarded by `requirePermissions('borrowings.return')`
  (`backend/api/routes/borrowings.js`); it also needs a valid session, an approved `Origin` and the CSRF token.
- `borrowings.return` requires `borrowings.view` (a role that can return must be able to see the list). The API rejects a
  custom role without it (`backend/services/rbac.service.js`) and the role editor enforces the same rule
  (`frontend/src/features/access-control/permissionPrerequisites.ts`).
- In the UI the **Return** button is shown only to a session that holds `borrowings.return`; the server check above is what protects the data.
- To let another group return assets, create a custom role with both permissions and assign it to them.
- Viewing the list and history (`GET /api/borrowings/history`) needs `borrowings.view`: Admin and Asset Manager.
- `borrowings.*` are independent of `assets.*`. The history keeps records of archived assets and shows their tag, name,
  type and status to anyone with `borrowings.view`; returning an asset changes its status from On loan to Available
  without `assets.update`. Built-in roles are unaffected; review that when building a custom role.
