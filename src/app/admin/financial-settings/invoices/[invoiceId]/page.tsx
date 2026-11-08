/* Admin Chauffeur Invoice Details route.
   Loads the read-only invoice details component. */

import AdminChauffeurInvoiceDetailPage from "./AdminChauffeurInvoiceDetailPage";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
    return <AdminChauffeurInvoiceDetailPage params={params} />;
}