/* 
    This file protects everything inside:
        /chauffeur/[chauffeurId]
        /chauffeur/[chauffeurId]/availability
    Rules:
        Admin user: can open any chauffeur dashboard
        Chauffeur user: can open only the dashboard where chauffeur_id matches their profile
        Wrong user: goes back to /login
    */
    import { type ReactNode } from "react";
    import { redirect } from "next/navigation";
    import { createClient } from "@/lib/supabase/server";

    type ChauffeurLayoutProps = {
    children: ReactNode;
    params: Promise<{ chauffeurId: string; }>;
};

export default async function ChauffeurLayout({children, params}: ChauffeurLayoutProps) {
    const { chauffeurId } = await params;
    const supabase = await createClient();
    const {data: { user }, } = await supabase.auth.getUser();

    if (!user) { redirect("/login"); }

    const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) { console.error("Chauffeur profile lookup error:", error); redirect("/login");  }
    if (!profile) { redirect("/login"); }
    if (profile.role === "admin") { return <>{children}</>; }
    if (profile.role === "chauffeur" && profile.chauffeur_id === chauffeurId) { return <>{children}</>; }
    redirect("/login");
    
}