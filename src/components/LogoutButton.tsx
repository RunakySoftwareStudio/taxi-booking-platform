"use client";

/*
  LogoutButton signs the current user out of Supabase Auth.

  In Version 5, the button text uses the language system so it can switch
  between English and Dutch.
*/

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pageStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const { languageCode } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);

  // getLogoutButtonText returns translated text for this button.
  function getLogoutButtonText(textKey: string) { return getTranslation("logoutButton", textKey, languageCode); }

  async function handleLogout() {
        setIsLoading(true);
        await supabase.auth.signOut();

        router.push("/login");
        router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} disabled={isLoading} className={pageStyles.logoutButtonHome}>
        {isLoading ? getLogoutButtonText("signingOut") : getLogoutButtonText("logout")}
    </button>
  );
}