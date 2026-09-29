/* ============================================================
   ADMIN NEW CHAUFFEUR ROUTE

   Keeps the route file small and delegates the page UI to
   AdminChauffeurNewPage.tsx.
============================================================ */

import AdminChauffeurNewPage from "./AdminChauffeurNewPage";

export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminChauffeurNewPage />;
}