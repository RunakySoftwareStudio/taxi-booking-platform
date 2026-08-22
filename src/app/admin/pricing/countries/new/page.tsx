/* ===== New pricing market page delegate ===== */

import AdminNewPricingMarketPage from "./AdminNewPricingMarketPage";

type NewPricingMarketPageProps = {
    searchParams: Promise<{ error?: string }>;
};

export default function Page({ searchParams }: NewPricingMarketPageProps) {
    return <AdminNewPricingMarketPage searchParams={searchParams} />;
}