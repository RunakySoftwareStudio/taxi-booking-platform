
/* ===== Pricing market detail page delegate ===== */

import AdminPricingMarketDetailPage from "./AdminPricingMarketDetailPage";

type PricingMarketDetailPageProps = {
    params: Promise<{ countryCode: string }>;
    searchParams: Promise<{ error?: string }>;
};

export default function Page({ params, searchParams }: PricingMarketDetailPageProps) {
    return <AdminPricingMarketDetailPage params={params} searchParams={searchParams}/>;
}