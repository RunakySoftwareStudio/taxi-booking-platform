/*
    Admin Chauffeur Invoices route.

    Delegates rendering to the invoice overview component.
    Financial data is loaded server-side.
*/
import AdminChauffeurInvoicesPage from "./AdminChauffeurInvoicesPage";

export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminChauffeurInvoicesPage />;
}