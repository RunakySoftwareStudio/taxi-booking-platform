"use client";

/*
  LoginPage shows the public login form.

  Admin users are redirected to:
    /admin

  Chauffeur users are redirected to:
    /chauffeur/[chauffeurId]

  In Version 5, the visible login page text uses the language system
  so it can switch between English and Dutch.
*/

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { languageCode } = useLanguage();

  // getLoginText returns translated text for the login page.
  // This keeps the JSX shorter and easier to read.
  function getLoginText(textKey: string) { return getTranslation("loginPage", textKey, languageCode); }

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    setIsLoading(true);
    setErrorMessage("");

    /*
      Admin logs in     → /admin
      Chauffeur logs in → /chauffeur/their-id
      Wrong setup       → translated error message
    */
    const { data: loginData, error } = await supabase.auth.signInWithPassword({email, password});
    if (error) { setErrorMessage(getLoginText("loginFailedMessage")); setIsLoading(false); return; }

    const userId = loginData.user?.id;
    if (!userId) { setErrorMessage(getLoginText("userNotFoundMessage")); setIsLoading(false); return; }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, chauffeur_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) { setErrorMessage(getLoginText("profileNotFoundMessage")); setIsLoading(false); return; }
    if (profile.role === "admin") { router.push("/admin"); router.refresh(); return; }
    if (profile.role === "chauffeur" && profile.chauffeur_id) { router.push(`/chauffeur/${profile.chauffeur_id}`); router.refresh(); return; }

    setErrorMessage(getLoginText("roleNotConfiguredMessage"));
    setIsLoading(false);
  }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containersmall}>
        <Link href="/" className={formStyles.formInfoCell}> {getLoginText("backToHomepage")} </Link>
        <p className={`mt-8 ${formStyles.captionUpTracking03Yellow}`}> {getLoginText("label")} </p>
        <h1 className={pageStyles.pageTitle}> {getLoginText("title")} </h1>
        <p className={pageStyles.pageDescription}> {getLoginText("description")} </p>

        <form onSubmit={handleLogin} className={formStyles.formMt10}>
          <div className="grid gap-6">
                <label className="block">
                    <span className={formStyles.span}> {getLoginText("emailLabel")} </span>
                    <input name="email" type="email" required placeholder={getLoginText("emailPlaceholder")} className={formStyles.inputWFullYellow} />
                </label>

                <label className="block">
                    <span className={formStyles.span}> {getLoginText("passwordLabel")} </span>
                    <input name="password" type="password" required placeholder={getLoginText("passwordPlaceholder")} className={formStyles.inputWFullYellow} />
                </label>
          </div>

          <button type="submit" disabled={isLoading} className={`mt-6 ${formStyles.submitSmallButtonUserPage}`}>
            {isLoading ? getLoginText("signingInButton") : getLoginText("signInButton")}
          </button>

          {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
        </form>
      </div>
    </main>
  );
}