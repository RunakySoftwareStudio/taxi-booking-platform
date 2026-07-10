/*
  AuthMenuLinks controls which account links are shown in the top menu.

  Better behavior:
    Not logged in       → show Login
    Admin logged in     → show Admin + Logout
    Chauffeur logged in → show Dashboard + Logout

  Mobile note:
  On small screens, Admin + Logout can take too much space.
  So logged-in users get one compact "User" dropdown on mobile.
*/

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/LogoutButton";
import { authMenuStyles, pageStyles } from "@/styles/classNames";
import { TranslatedText } from "@/components/TranslatedText";

// UserProfile describes the account role connected to the logged-in user.
// Admin users go to /admin. Chauffeur users go to their own dashboard.
type UserProfile = {
  role: "admin" | "chauffeur";
  chauffeur_id: string | null;
};

export default function AuthMenuLinks() {
  const supabase = createClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // loadProfile checks the logged-in user and loads their role from user_profiles.
    async function loadProfile() {
      const { data: { user }} = await supabase.auth.getUser();
      if (!user) { setProfile(null); setIsLoading(false); return; }
      const { data } = await supabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

      setProfile(data as UserProfile | null);
      setIsLoading(false);
    }

    loadProfile();
  }, [supabase]);

  if (isLoading) { return null; }
  if (!profile) {
    return (
      <Link href="/login" className={pageStyles.loginButtonHome}>
        <TranslatedText sectionName="navigation" textKey="login" />
      </Link>
    );
}

  if (profile.role === "admin") {
    return (
      <>
        {/* Mobile account menu: saves space in the top menu. */}
        <details className={authMenuStyles.mobileDetails}>
          <summary className={authMenuStyles.mobileSummary} aria-label="Open account menu">
            <TranslatedText sectionName="navigation" textKey="user" />
          </summary>
          <div className={`${authMenuStyles.mobileDropdown} ${authMenuStyles.adminDropdownWidth}`}  >
            <Link href="/admin" className={pageStyles.adminButtonHome}>
              <TranslatedText sectionName="navigation" textKey="admin" />
            </Link>
            <LogoutButton />
          </div>
        </details>

        {/* Desktop account links: show Admin and Logout separately. */}
        <div className={`${authMenuStyles.desktopGroup} ${pageStyles.authMenuGroup}`} >
          <Link href="/admin" className={pageStyles.adminButtonHome}> 
            <TranslatedText sectionName="navigation" textKey="admin" /> 
          </Link>
          <LogoutButton />
        </div>
      </>
    );
  }

  if (profile.role === "chauffeur" && profile.chauffeur_id) {
    return (
      <> {/* <> means:  Group these elements for React,but do not create an extra HTML element in the browser. */}
        {/* Mobile account menu: saves space in the top menu. */}
        <details className={authMenuStyles.mobileDetails}>
          <summary className={authMenuStyles.mobileSummary} aria-label="Open account menu" > <TranslatedText sectionName="navigation" textKey="user" /></summary>
          <div className={`${authMenuStyles.mobileDropdown} ${authMenuStyles.chauffeurDropdownWidth}`} >
            <Link href={`/chauffeur/${profile.chauffeur_id}`}  className={pageStyles.adminButtonHome} > <TranslatedText sectionName="navigation" textKey="dashboard" /> </Link>
            <LogoutButton />
          </div>
        </details>

        {/* Desktop account links: show Dashboard and Logout separately. */}
        <div className={`${authMenuStyles.desktopGroup} ${pageStyles.authMenuGroup}`} >
          <Link href={`/chauffeur/${profile.chauffeur_id}`}  className={pageStyles.adminButtonHome}> <TranslatedText sectionName="navigation" textKey="dashboard" /> </Link>
          <LogoutButton />
        </div>
      </>
    );
  }

  return null;
}