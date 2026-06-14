"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "@/components/LogoutButton";
import { pageStyles} from "@/styles/classNames";

type UserProfile = {
  role: "admin" | "chauffeur";
  chauffeur_id: string | null;
};

export default function AuthMenuLinks() {
  const supabase = createClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
        async function loadProfile() {
        const {data: { user }} = await supabase.auth.getUser();

        if (!user) { setProfile(null);  setIsLoading(false);  return; }

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
    <Link href="/login" className={pageStyles.loginButtonHome} >
        Login
    </Link>
    );
  }

  if (profile.role === "admin") {
    return (
      <div className={pageStyles.divFlex}>
        <Link href="/admin" className={pageStyles.logButton}> Admin </Link>
        <LogoutButton />
      </div>
    );
  }

  if (profile.role === "chauffeur" && profile.chauffeur_id) {
    return (
      <div className={pageStyles.divFlex}>
        <Link href={`/chauffeur/${profile.chauffeur_id}`} className={pageStyles.logButton}> Dashboard </Link>
        <LogoutButton />
      </div>
    );
  }

  return null;
}