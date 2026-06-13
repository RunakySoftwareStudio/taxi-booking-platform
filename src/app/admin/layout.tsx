import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AdminLayoutProps = { children: ReactNode;};

export default async function AdminLayout({ children }: AdminLayoutProps) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { redirect("/login"); }

    return <>{children}</>;
}