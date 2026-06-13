import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ChauffeurLayoutProps = { children: ReactNode;};

export default async function ChauffeurLayout({children}: ChauffeurLayoutProps) {
    const supabase = await createClient();
    const { data: { user }  } = await supabase.auth.getUser();
    if (!user) { redirect("/login"); }

    return <>{children}</>;
}