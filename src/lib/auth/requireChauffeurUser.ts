import "server-only";

import {createClient} from "@/lib/supabase/server";

/* ============================================================
   REQUIRE CHAUFFEUR USER
   Verifies that the authenticated user is a chauffeur and
   owns the chauffeur account they are trying to modify.

   Must be called before privileged chauffeur database writes.
============================================================ */
export async function requireChauffeurUser(chauffeurId: string) {
    /* Authenticate the current user using their session. */
    const supabase = await createClient();
    const {data: {user}, error: authError} = await supabase.auth.getUser();

    if (authError || !user) {
        throw new Error("Unauthorized: Please log in.");
    }

    /* Check the user's role and linked chauffeur account. */
    const {data: profile, error: profileError} = await supabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) {
        throw new Error("Forbidden: You cannot modify this chauffeur's availability.");
    }

    return user;
}
