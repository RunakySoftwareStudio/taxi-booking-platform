
import AdminRoundingRuleDetailPage from "./AdminRoundingRuleDetailPage";

type RoundingRuleDetailPageProps = {
    params: Promise<{ roundingRuleId: string }>;
    searchParams: Promise<{ country?: string; error?: string }>;
};

export default function Page({ params, searchParams }: RoundingRuleDetailPageProps) {
    return <AdminRoundingRuleDetailPage params={params} searchParams={searchParams}/>;
}