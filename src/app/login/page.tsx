/*=============================================
Right now, if someone is already logged in and opens:
http://localhost:3000/login
they may still see the login form. Better behavior:
  1. Logged out → /login shows login form
  2. Logged in as admin → /login redirects to /admin
  3. Logged in as chauffeur → /login redirects to chauffeur dashboard
==============================================*/
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginPage from "./LoginPage";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { return <LoginPage />; }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, chauffeur_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") { redirect("/admin");  }
  if (profile?.role === "chauffeur" && profile.chauffeur_id) { redirect(`/chauffeur/${profile.chauffeur_id}`); }

  return <LoginPage />;
}