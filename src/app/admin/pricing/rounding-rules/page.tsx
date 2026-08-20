import AdminRoundingRulesPage from "./AdminRoundingRulesPage";

type RoundingRulesPageProps = {
    searchParams: Promise<{ country?: string; error?: string }>;
};

export default function Page({ searchParams }: RoundingRulesPageProps) {
    return <AdminRoundingRulesPage searchParams={searchParams}/>;
}