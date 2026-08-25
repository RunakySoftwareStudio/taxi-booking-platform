import Link from "next/link";
import { notFound } from "next/navigation";
import ChauffeurAvailabilityEditForm from "@/components/ChauffeurAvailabilityEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { TranslatedText } from "@/components/TranslatedText";

export const dynamic = "force-dynamic";

type ChauffeurAvailabilityEditPageProps = { params: Promise<{ chauffeurId: string; availabilityId: string;}>;};

export default async function ChauffeurAvailabilityEditPage({ params}: ChauffeurAvailabilityEditPageProps) {
  const { chauffeurId, availabilityId } = await params;

  const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin
    .from("chauffeurs")
    .select("id, name")
    .eq("id", chauffeurId)
    .maybeSingle();

  /* ===== Handle chauffeur lookup result ===== */
  if (chauffeurError) {
    console.error("Could not load chauffeur for availability edit:", {
      chauffeurId,
      chauffeurError,
    });

    throw new Error("Could not load chauffeur for availability edit.");
  }

  if (!chauffeurRow) { notFound(); }

  const { data: availabilityRow, error: availabilityError } =
    await supabaseAdmin
      .from("chauffeur_availability")
      .select("id, chauffeur_id, available_date, start_time, end_time, status, notes")
      .eq("id", availabilityId)
      .eq("chauffeur_id", chauffeurId)
      .maybeSingle();

  /* ===== Handle availability lookup result ===== */
  if (availabilityError) {
    console.error("Could not load chauffeur availability for edit:", {
      chauffeurId,
      availabilityId,
      availabilityError,
    });

    throw new Error("Could not load chauffeur availability for edit.");
  }

  if (!availabilityRow) { notFound(); }

  const { data: availabilityStatuses, error: statusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "availability_status", });

  if (statusError) { console.error("Could not load availability statuses:", statusError); }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containerMedium}>
        <Link href={`/chauffeur/${chauffeurId}/availability`} className={formStyles.link}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="backToAvailability" /> </Link>
        <p className={pageStyles.pageLabelUpper}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="chauffeurLabel" /> </p>
        <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="editTitlePrefix" /> {chauffeurRow.name} </h1>
        <p className={pageStyles.pageDescription}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="editDescription" /> </p>

        <ChauffeurAvailabilityEditForm chauffeurId={chauffeurId} availability={availabilityRow} statusOptions={(availabilityStatuses ?? []) as string[]} />
      </div>
    </main>
  );
}