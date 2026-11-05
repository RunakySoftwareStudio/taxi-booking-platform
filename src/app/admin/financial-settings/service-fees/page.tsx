import AdminServiceFeeRatesPage from "./AdminServiceFeeRatesPage";

/*
    Service Fee Rates route wrapper.
    Keeps route configuration separate from page content.
*/
export const dynamic = "force-dynamic";

export default function Page() {
    return <AdminServiceFeeRatesPage />;
}