/*
  AuthMenuLinks controls which account links are shown in the top menu.

  Better behavior:
    Not logged in       → show Login
    Admin logged in     → show Admin + Logout
    Chauffeur logged in → show Dashboard + Logout

  Mobile note:
  On small screens, Admin + Logout can take too much space.
  So logged-in users get one compact "Account" dropdown on mobile.
*/

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/LogoutButton";
import { pageStyles } from "@/styles/classNames";

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

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

  if (isLoading) {
    return null;
  }

  if (!profile) {
    return (
      <Link href="/login" className={pageStyles.loginButtonHome}>
        Login
      </Link>
    );
  }

  if (profile.role === "admin") {
    return (
      <>
        {/* Mobile account menu: saves space in the top menu. */}
        <details className="relative sm:hidden">
        <summary
          className="cursor-pointer list-none rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white sm:text-sm"
          aria-label="Open account menu"
        >
          User
        </summary>

          <div className="absolute right-0 mt-2 flex min-w-36 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-xl">
            <Link href="/admin" className={pageStyles.adminButtonHome}>
              Admin
            </Link>

            <LogoutButton />
          </div>
        </details>

        {/* Desktop account links: show Admin and Logout separately. */}
        <div className={`hidden sm:flex ${pageStyles.authMenuGroup}`}>
          <Link href="/admin" className={pageStyles.adminButtonHome}>
            Admin
          </Link>

          <LogoutButton />
        </div>
      </>
    );
  }

  if (profile.role === "chauffeur" && profile.chauffeur_id) {
    return (
      <>
        {/* Mobile account menu: saves space in the top menu. */}
        <details className="relative sm:hidden">
        <summary
          className="cursor-pointer list-none rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white sm:text-sm"
          aria-label="Open account menu">
          User
        </summary>

          <div className="absolute right-0 mt-2 flex min-w-40 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-xl">
            <Link
              href={`/chauffeur/${profile.chauffeur_id}`}
              className={pageStyles.adminButtonHome}
            >
              Dashboard
            </Link>

            <LogoutButton />
          </div>
        </details>

        {/* Desktop account links: show Dashboard and Logout separately. */}
        <div className={`hidden sm:flex ${pageStyles.authMenuGroup}`}>
          <Link
            href={`/chauffeur/${profile.chauffeur_id}`}
            className={pageStyles.adminButtonHome}
          >
            Dashboard
          </Link>

          <LogoutButton />
        </div>
      </>
    );
  }

  return null;
}