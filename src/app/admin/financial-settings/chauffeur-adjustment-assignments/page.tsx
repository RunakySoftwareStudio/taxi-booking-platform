/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS PAGE

   Server entry point for centralized management of
   chauffeur service-fee discount and surcharge assignments.
============================================================ */

import AdminChauffeurAdjustmentAssignmentsPage from "./AdminChauffeurAdjustmentAssignmentsPage";

export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminChauffeurAdjustmentAssignmentsPage />;
}