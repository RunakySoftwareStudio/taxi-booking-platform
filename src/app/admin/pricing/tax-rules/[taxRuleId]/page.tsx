import AdminTaxRuleDetailPage from "./AdminTaxRuleDetailPage";

type TaxRuleDetailPageProps = {
    params: Promise<{ taxRuleId: string }>;
    searchParams: Promise<{ country?: string }>;
};

export default function Page({ params, searchParams }: TaxRuleDetailPageProps) {
    return <AdminTaxRuleDetailPage params={params} searchParams={searchParams}/>;
}
