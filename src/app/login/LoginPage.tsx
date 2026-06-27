"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    setIsLoading(true);
    setErrorMessage("");
    /*===============================
    Admin logs in     → /admin
    Chauffeur logs in → /chauffeur/their-id
    Wrong setup       → error message
    =================================*/
    const { data: loginData, error } = await supabase.auth.signInWithPassword({email, password});
    if (error) {setErrorMessage("Login failed. Please check your email and password."); setIsLoading(false); return; }
    
    const userId = loginData.user?.id;
    if (!userId) {setErrorMessage("Login failed. User could not be found."); setIsLoading(false); return; }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, chauffeur_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {setErrorMessage("Login failed. No user profile was found."); setIsLoading(false); return; }
    if (profile.role === "admin") {router.push("/admin"); router.refresh(); return; }
    if (profile.role === "chauffeur" && profile.chauffeur_id) {router.push(`/chauffeur/${profile.chauffeur_id}`); router.refresh(); return;}

    setErrorMessage("Login failed. Your account role is not configured correctly.");
    setIsLoading(false);
  }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containersmall}>
        <Link href="./" className={formStyles.formInfoCell} > ← Back to homepage </Link>
        <p className={`mt-8 ${formStyles.captionUpTracking03Yellow}`} >  Login </p>
        <h1 className={pageStyles.pageTitle}>Sign in</h1>
        <p className={pageStyles.pageDescription}> Sign in to manage bookings, chauffeurs, clients, and vehicles. </p>

        <form onSubmit={handleLogin}  className={formStyles.formMt10} >
          <div className="grid gap-6">
                <label className="block">
                    <span className={formStyles.span}>Email address</span>
                    <input name="email"  type="email"  required  placeholder="admin@example.com" className={formStyles.inputWFullYellow}  />
                </label>
                <label className="block">
                    <span className={formStyles.span}>Password</span>
                    <input name="password"  type="password"  required placeholder="Your password" className={formStyles.inputWFullYellow} />
                </label>
          </div>
          <button
            type="submit"  disabled={isLoading}  className={`mt-6 ${formStyles.submitSmallButtonUserPage}`} >  {isLoading ? "Signing in..." : "Sign in"}
          </button>
          {errorMessage && ( <p className={tableStyles.errorCell}>  {errorMessage}  </p>  )}
        </form>
      </div>
    </main>
  );
}