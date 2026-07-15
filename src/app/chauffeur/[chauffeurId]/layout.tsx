/* 
    This file protects everything inside:
        /chauffeur/[chauffeurId]
        /chauffeur/[chauffeurId]/availability
    Rules:
        Admin user: can open any chauffeur dashboard
        Chauffeur user: can open only the dashboard where chauffeur_id matches their profile
        Wrong user: goes back to /login
        Not logged in + /admin → /login
        Chauffeur logged in + /admin → /unauthorized
        Admin logged in + /admin → allowed
        Chauffeur logged in + own /chauffeur/id → allowed
        Chauffeur logged in + other chauffeur id → /unauthorized
    */
    import { type ReactNode } from "react";
    import { redirect } from "next/navigation";
    import { createClient } from "@/lib/supabase/server";
    import PreferredLanguageSync from "@/components/PreferredLanguageSync";
    import { defaultLanguage, isLanguageCode } from "@/lib/i18n/languages";

    type ChauffeurLayoutProps = {
    children: ReactNode;
    params: Promise<{ chauffeurId: string; }>;
};

export default async function ChauffeurLayout({children, params}: ChauffeurLayoutProps) {
    const { chauffeurId } = await params;
    const supabase = await createClient();
    const {data: { user }, } = await supabase.auth.getUser();

    if (!user) { redirect("/login"); }

    // Loads authorization information and the user's saved interface language.
    const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("role, chauffeur_id, preferred_language")
        .eq("user_id", user.id)
        .maybeSingle();
    if (error) { console.error("Chauffeur profile lookup error:", error);  redirect("/unauthorized");}
    if (!profile) { redirect("/unauthorized");}

    // Allows administrators or the chauffeur who owns this route.
    const isAdminUser = profile.role === "admin";
    const isOwnChauffeur = profile.role === "chauffeur" && profile.chauffeur_id === chauffeurId;

    if (!isAdminUser && !isOwnChauffeur) { redirect("/unauthorized"); }

    // Uses English only when the stored database value is missing or invalid.
    const preferredLanguage = profile.preferred_language && isLanguageCode(profile.preferred_language) ? profile.preferred_language : defaultLanguage;

    // Applies the saved preference before rendering the protected chauffeur pages.
    return (
        <>
            <PreferredLanguageSync preferredLanguage={preferredLanguage} />
            {children}
        </>
    );
    
}