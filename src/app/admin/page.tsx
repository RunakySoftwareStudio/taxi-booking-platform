/*-=========================================================
  page.tsx keeps the route /admin working
  AdminDashboardPage.tsx contains the real page code
=============================================================*/

import AdminDashboardPage from "./AdminDashboardPage";

export const dynamic = "force-dynamic"; //This makes sure the admin dashboard does not show old cached statistics.

export default function AdminPage() {
  return <AdminDashboardPage />;
}