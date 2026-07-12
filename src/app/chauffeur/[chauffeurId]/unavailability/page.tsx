import Link from "next/link";
import { TranslatedText } from "@/components/TranslatedText";
import { formStyles, pageStyles } from "@/styles/classNames";

// Defines the chauffeur ID received from the dynamic URL.
type ChauffeurUnavailabilityPageProps = { params: Promise<{ chauffeurId: string }> };

// Shows the unavailable-times page shell. The form and database records will be added later.
export default async function ChauffeurUnavailabilityPage({ params }: ChauffeurUnavailabilityPageProps) {
    // Reads the chauffeur ID for the dashboard back link.
    const { chauffeurId } = await params;

    // Displays the translated page introduction.
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/chauffeur/${chauffeurId}`} className={formStyles.link}><TranslatedText sectionName="chauffeurDashboardPage" textKey="backToDashboard" /></Link>
                <p className={pageStyles.pageLabelUpper}><TranslatedText sectionName="chauffeurDashboardPage" textKey="chauffeurLabel" /></p>
                <h1 className={pageStyles.pageTitle}><TranslatedText sectionName="chauffeurDashboardPage" textKey="manageUnavailabilityButton" /></h1>
                <p className={pageStyles.pageDescription}><TranslatedText sectionName="chauffeurDashboardPage" textKey="manageUnavailabilityDescription" /></p>
            </div>
        </main>
    );
}