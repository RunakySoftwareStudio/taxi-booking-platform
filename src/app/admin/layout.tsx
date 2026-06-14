/*======================================================
wraps/protects all pages inside /admin:
    /admin,  /admin/bookings,    /admin/chauffeurs,    /admin/clients,    /admin/vehicles,    /admin/availability
So it works like a security door:
User opens /admin => layout.tsx checks: is user logged in? => layout.tsx checks: does user have admin role? => yes → show admin page no  => redirect to /login
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