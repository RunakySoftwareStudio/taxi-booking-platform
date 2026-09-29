/* ============================================================
   ADMIN CHAUFFEUR COMPLIANCE ROUTE

   Keeps the route file small and delegates the real page UI to
   AdminChauffeurCompliancePage.tsx.
============================================================ */

import AdminChauffeurCompliancePage from "./AdminChauffeurCompliancePage";

export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminChauffeurCompliancePage />;
}