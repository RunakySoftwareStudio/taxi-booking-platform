"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pageStyles } from "@/styles/classNames";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
        setIsLoading(true);
        await supabase.auth.signOut();

        router.push("/login");
        router.refresh();
  }

  return (
    <button  type="button" onClick={handleLogout} disabled={isLoading} className={pageStyles.logButton} >
        {isLoading ? "Signing out..." : "Logout"}
    </button>
  );
}