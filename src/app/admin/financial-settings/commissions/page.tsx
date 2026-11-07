import AdminCommissionsPage from "./AdminCommissionsPage";

/*
    Admin Commissions Route

    Loads the chauffeur commission management page.
    Dynamic rendering ensures financial data is not cached.
*/
export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminCommissionsPage />;
}