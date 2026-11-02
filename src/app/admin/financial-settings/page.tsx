/*
    Financial Settings route wrapper.
    Keeps route configuration separate from page content.
*/
import AdminFinancialSettingsPage from "./AdminFinancialSettingsPage";

export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminFinancialSettingsPage />;
}