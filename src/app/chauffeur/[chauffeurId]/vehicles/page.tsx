import Link from "next/link";
import { TranslatedText } from "@/components/TranslatedText";
import { formStyles, pageStyles } from "@/styles/classNames";

// Defines the chauffeur ID received from the dynamic URL.
type ChauffeurVehiclesPageProps = { params: Promise<{ chauffeurId: string }> };

// Shows the chauffeur vehicles page shell. The vehicle list will be moved here later.
export default async function ChauffeurVehiclesPage({ params }: ChauffeurVehiclesPageProps) {
    // Reads the chauffeur ID for the dashboard back link.
    const { chauffeurId } = await params;

    // Displays the translated page introduction.
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/chauffeur/${chauffeurId}`} className={formStyles.link}><TranslatedText sectionName="chauffeurDashboardPage" textKey="backToDashboard" /></Link>
                <p className={pageStyles.pageLabelUpper}><TranslatedText sectionName="chauffeurDashboardPage" textKey="chauffeurLabel" /></p>
                <h1 className={pageStyles.pageTitle}><TranslatedText sectionName="chauffeurDashboardPage" textKey="viewMyVehiclesButton" /></h1>
                <p className={pageStyles.pageDescription}><TranslatedText sectionName="chauffeurDashboardPage" textKey="viewMyVehiclesDescription" /></p>
            </div>
        </main>
    );
}