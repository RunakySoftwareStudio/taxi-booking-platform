/*-=========================================================
  page.tsx keeps the route /chauffeur-status working.
  src/app/chauffeur-status/ChauffeurStatusPage.tsx contains
  the real page code and form logic.
=============================================================*/

import ChauffeurStatusPage from "./ChauffeurStatusPage";

type PageProps = {
  searchParams: Promise<{ registrationId?: string }>;
};

/**
 * Page
 *
 * This server component reads the optional registrationId from the URL.
 *
 * Example:
 * /chauffeur-status?registrationId=123
 *
 * Then it sends that value to ChauffeurStatusPage so the input can be prefilled.
 */
export default async function Page({ searchParams }: PageProps) {
  const pageSearchParams = await searchParams;

  return (
    <ChauffeurStatusPage
      initialRegistrationId={pageSearchParams.registrationId ?? ""}
    />
  );
}