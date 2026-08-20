import AdminTaxRulesPage from "./AdminTaxRulesPage";

type TaxRulesPageProps = {
    searchParams: Promise<{ country?: string; error?: string }>;
};

export default function Page({ searchParams }: TaxRulesPageProps) {
    return <AdminTaxRulesPage searchParams={searchParams} />;
}