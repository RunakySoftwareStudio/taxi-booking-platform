
import AdminPricingMarketsPage from "./AdminPricingMarketsPage";

type PricingMarketsPageProps = {
    searchParams: Promise<{ error?: string }>;
};

export default function Page({ searchParams }: PricingMarketsPageProps) {
    return <AdminPricingMarketsPage searchParams={searchParams} />;
}