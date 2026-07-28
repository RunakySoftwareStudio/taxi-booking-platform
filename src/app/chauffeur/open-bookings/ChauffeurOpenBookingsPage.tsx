import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import { TranslatedText } from "@/components/TranslatedText";
import { formStyles, pageStyles } from "@/styles/classNames";
import OpenBookingsList from "./OpenBookingsList";

/*
  ChauffeurOpenBookingsPage protects the visible page before
  the interactive booking list is loaded.

  Important:
  - the chauffeur ID is read from user_profiles;
  - it is not accepted through the URL;
  - administrators and other users are redirected;
  - the API routes still repeat all important authorization checks.
*/
export default async function ChauffeurOpenBookingsPage() {
  const authSupabase = await createAuthClient();

  /*
    Verify the current Supabase Auth session.
  */
  const {
    data: { user },
    error: userError,
  } = await authSupabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  /*
    Find the chauffeur profile belonging to the logged-in user.
  */
  const { data: profile, error: profileError } = await authSupabase
    .from("user_profiles")
    .select("role, chauffeur_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "chauffeur" ||
    !profile.chauffeur_id
  ) {
    redirect("/unauthorized");
  }

  const chauffeurId = profile.chauffeur_id;

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.container}>
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/chauffeur/${chauffeurId}`}
            className={formStyles.link}
          >
            <TranslatedText
              sectionName="chauffeurOpenBookingsPage"
              textKey="backToDashboard"
            />
          </Link>

          <LogoutButton />
        </div>

        <p className={pageStyles.pageLabelUpper}>
          <TranslatedText
            sectionName="chauffeurOpenBookingsPage"
            textKey="label"
          />
        </p>

        <h1 className={pageStyles.pageTitle}>
          <TranslatedText
            sectionName="chauffeurOpenBookingsPage"
            textKey="title"
          />
        </h1>

        <p className={pageStyles.pageDescription}>
          <TranslatedText
            sectionName="chauffeurOpenBookingsPage"
            textKey="description"
          />
        </p>

        {/* The interactive open-bookings */}
        <OpenBookingsList />
     </div>
    </main>
  );
}