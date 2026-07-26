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
import Link from "next/link";
import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
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

    // Counts all assignment problems that still require admin attention.
    // head: true means Supabase returns only the count and does not download all alert records.
    const { count: openAlertCount, error: alertCountError } =  await supabaseAdmin
        .from("assignment_alerts")
        .select("id", { count: "exact", head: true })
        .eq("alert_status", "open");
    if (alertCountError) { console.error("Could not load assignment alert count:", alertCountError); }

    {/*
        When open alerts exist, it appears red:
        ⚠ Assignment alerts: 7
        When there are no open alerts, it becomes neutral:
        ⚠ Assignment alerts: 0
    */}
    return (
    <>
        {openAlertCount && openAlertCount > 0 ? (
        <div className="border-b border-red-400/30 bg-slate-950 px-4 py-2">
            <div className="mx-auto flex max-w-7xl justify-center">
            <Link href="/admin/assignment-alerts"
                className="flex items-center gap-2 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/20" >
                <span aria-hidden="true" className="text-lg font-bold text-red-400"> ⚠</span>
                <span>Assignment alerts: {openAlertCount}</span>
            </Link>
            </div>
        </div>
        ) : null}

        {children}
    </>
    );
}