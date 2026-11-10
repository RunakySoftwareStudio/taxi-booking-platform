/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT OVERLAP CHECK

   Detect overlapping reusable adjustment definitions.
   Returns warnings only; does not prevent saving.
============================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request: Request) {
    try {
        /* SECTION 1: Require administrator authentication. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ message: "Not logged in." }, { status: 401 });

        const { data: profile, error: profileError } = await supabase.from("user_profiles")
            .select("role").eq("user_id", user.id).maybeSingle();
        if (profileError || profile?.role !== "admin")
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });

        /* SECTION 2: Validate the request and retrieve matching definitions. */
        const body = await request.json();
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const type = body.adjustment_type;
        const from = body.effective_from;
        const until = body.effective_until || null;
        const excludeId = body.id;

        if (!name || !["discount", "surcharge"].includes(type) || typeof from !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
            (until !== null && (typeof until !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(until))) ||
            (until !== null && until < from))
            return NextResponse.json({ message: "Invalid adjustment period." }, { status: 400 });

        const { data, error } = await supabaseAdmin.from("client_adjustment_definitions")
            .select("id, name, adjustment_type, effective_from, effective_until, is_active")
            .eq("adjustment_type", type).lte("effective_from", until ?? "9999-12-31");

        if (error) throw error;

        /* SECTION 3: Check date intersections and exclude the record being edited. */
        const matches = (data ?? []).filter((item) =>
            item.id !== excludeId && (!item.effective_until || item.effective_until >= from)
        );

        const warnings = matches.map((item) => ({
            name: item.name, is_active: item.is_active,
            duplicate: item.name.trim().toLowerCase() === name.toLowerCase(),
            effective_from: item.effective_from, effective_until: item.effective_until,
        }));

        /* SECTION 4: Reject overlapping periods for the same adjustment type. */
        if (warnings.length > 0) {
            return NextResponse.json({
                conflict: true,
                message: `Cannot save: overlapping ${type} period detected.`,
                warnings,
            }, { status: 409 });
        }

        return NextResponse.json({ conflict: false, warnings: [] });
    } catch (error) {
        console.error("Could not check client adjustment overlaps:", error);
        return NextResponse.json({ message: "Unable to check adjustment overlaps." }, { status: 500 });
    }
}