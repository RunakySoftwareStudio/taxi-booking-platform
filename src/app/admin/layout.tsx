/*======================================================
wraps/protects all pages inside /admin:
    /admin,  /admin/bookings,    /admin/chauffeurs,    /admin/clients,    /admin/vehicles,    /admin/availability
So it works like a security door:

Not logged in + /admin → /login
Chauffeur logged in + /admin → /unauthorized
Admin logged in + /admin → allowed
Chauffeur logged in + own /chauffeur/id → allowed
Chauffeur logged in + other chauffeur id → /unauthorized
================================================*/
import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AdminLayoutProps = {children: ReactNode;};

export default async function AdminLayout({ children }: AdminLayoutProps) {
    const supabase = await createClient();
    const {data: { user }, } = await supabase.auth.getUser();

    if (!user) { redirect("/login"); }

    const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {console.error("Admin profile lookup error:", error); redirect("/unauthorized");}
    if (profile?.role !== "admin") { redirect("/unauthorized");}
    return <>{children}</>;
}