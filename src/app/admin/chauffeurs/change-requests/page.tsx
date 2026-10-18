/* ============================================================
   ADMIN CHAUFFEUR CHANGE REQUESTS ROUTE

   Keeps the route file small and delegates the real page UI to
   AdminChauffeurChangeRequestsPage.tsx.
============================================================ */

import AdminChauffeurChangeRequestsPage from "./AdminChauffeurChangeRequestsPage";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams: Promise<{ success?: string; error?: string;}>;
};

/* Passes review-result messages to the real Admin page component. */
export default async function Page({ searchParams }: PageProps) {
    const pageMessage = await searchParams;

    return <AdminChauffeurChangeRequestsPage pageMessage={pageMessage} />;
}
