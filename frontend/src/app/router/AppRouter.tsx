import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/app/layout'
import {
  BootstrapLoading,
  ForbiddenPage,
  PublicOnlyRoute,
  RequireAuth,
  RequirePermission,
  SignInPage,
  firstPermittedRoute,
  useCurrentSessionQuery,
} from '@/features/auth'

const InventoryPage = lazy(() =>
  import('@/features/assets').then((module) => ({ default: module.InventoryPage })),
)
const BorrowingsPage = lazy(() =>
  import('@/features/borrowings').then((module) => ({ default: module.BorrowingsPage })),
)
const ActivityPage = lazy(() =>
  import('@/features/activity').then((module) => ({ default: module.ActivityPage })),
)
const ExportProfilesPage = lazy(() =>
  import('@/features/export-profiles').then((module) => ({ default: module.ExportProfilesPage })),
)
const AssetTypesPage = lazy(() =>
  import('@/features/asset-types').then((module) => ({ default: module.AssetTypesPage })),
)
const AccessControlPage = lazy(() =>
  import('@/features/access-control').then((module) => ({ default: module.AccessControlPage })),
)

function FirstPermittedRoute() {
  const { data: session } = useCurrentSessionQuery()
  return <Navigate to={firstPermittedRoute(session)} replace />
}

export function AppRouter() {
  return (
    <Suspense fallback={<BootstrapLoading />}>
      <Routes>
        <Route
          path="/sign-in"
          element={
            <PublicOnlyRoute>
              <SignInPage />
            </PublicOnlyRoute>
          }
        />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<FirstPermittedRoute />} />
            <Route
              path="/inventory"
              element={
                <RequirePermission permission="assets.view">
                  <InventoryPage />
                </RequirePermission>
              }
            />
            <Route
              path="/borrowings"
              element={
                <RequirePermission permissions={['borrowings.view', 'borrowings.viewOwn']} mode="any">
                  <BorrowingsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/activity"
              element={
                <RequirePermission permission="activity.view">
                  <ActivityPage />
                </RequirePermission>
              }
            />
            <Route
              path="/export-profiles"
              element={
                <RequirePermission permission="exportProfiles.view">
                  <ExportProfilesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/asset-types"
              element={
                <RequirePermission permission="assets.view">
                  <AssetTypesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/admin/access"
              element={
                <RequirePermission permissions={['roles.view', 'users.view']} mode="any">
                  <AccessControlPage />
                </RequirePermission>
              }
            />
            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<FirstPermittedRoute />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
