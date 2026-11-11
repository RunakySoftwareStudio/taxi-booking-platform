    /* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS

   Loads chauffeurs, reusable adjustment definitions,
   and existing assignments for centralized management.
============================================================ */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import ChauffeurAdjustmentAssignmentsManager from "./ChauffeurAdjustmentAssignmentsManager";

export default async function AdminChauffeurAdjustmentAssignmentsPage() {
    /* SECTION 1: Load chauffeurs for the assignment selector. */
    const { data: chauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email")
        .order("name", { ascending: true });

    /* SECTION 2: Load reusable chauffeur adjustment definitions. */
    const { data: definitions, error: definitionsError } = await supabaseAdmin
        .from("chauffeur_adjustment_definitions")
        .select("id, name, adjustment_type, value_type, value, currency_code, effective_from, effective_until, is_active")
        .order("name", { ascending: true });

    /* SECTION 3: Load existing assignments with chauffeur and definition details. */
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
        .from("chauffeur_adjustment_assignments")
        .select(`
            id, chauffeur_id, adjustment_definition_id,
            effective_from, effective_until, is_active,
            chauffeurs!chauffeur_adjustment_assignments_chauffeur_id_fkey (
                name, email
            ),
            chauffeur_adjustment_definitions!chauffeur_adjustment_assignments_adjustment_definition_id_fkey (
                name, adjustment_type, value_type, value, currency_code
            )
        `)
        .order("effective_from", { ascending: false });

    const hasError = Boolean(chauffeursError || definitionsError || assignmentsError);

    if (hasError) {
        console.error("Could not load chauffeur adjustment assignments:", {
            chauffeursError, definitionsError, assignmentsError,
        });
    }

    /* SECTION 4: Render the initial management page. */
    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/financial-settings" className="text-sm text-cyan-400 hover:text-cyan-300">
                    ← Back to Financial Settings
                </Link>

                <h1 className="mt-6 text-3xl font-bold">Chauffeur Adjustment Assignments</h1>
                <p className="mt-3 text-slate-300">
                    Assign discounts and surcharges to individual chauffeurs.
                </p>

                {hasError 
                    ? (<p role="alert" className="mt-6 text-sm text-red-300"> Could not load chauffeur adjustment assignment data. </p> ) 
                    : (
                        <>
                            {/* Centralized Create/Edit form and existing assignment management. */}
                            <ChauffeurAdjustmentAssignmentsManager
                                chauffeurs={(chauffeurs ?? []).map((item) => ({id: item.id, name: item.name, email: item.email,}))}
                                definitions={(definitions ?? [])
                                    .filter((item) => item.is_active)
                                    .map((item) => ({
                                        id: item.id,
                                        name: item.name,
                                        adjustment_type: item.adjustment_type as "discount" | "surcharge",
                                        effective_from: item.effective_from,
                                        effective_until: item.effective_until,
                                    }))}
                                assignments={(assignments ?? []).map((item) => {
                                    const chauffeurRelation = item.chauffeurs;
                                    const definitionRelation = item.chauffeur_adjustment_definitions;
                                    const chauffeur = Array.isArray(chauffeurRelation) ? chauffeurRelation[0] : chauffeurRelation;
                                    const definition = Array.isArray(definitionRelation) ? definitionRelation[0] : definitionRelation;

                                    return {
                                        id: item.id,
                                        chauffeur_id: item.chauffeur_id,
                                        adjustment_definition_id: item.adjustment_definition_id,
                                        effective_from: item.effective_from,
                                        effective_until: item.effective_until,
                                        is_active: item.is_active,
                                        chauffeur_name: chauffeur?.name ?? "Unknown chauffeur",
                                        adjustment_name: definition?.name ?? "Unknown adjustment",
                                        adjustment_type: definition?.adjustment_type ?? "",
                                        value_type: definition?.value_type ?? "",
                                        value: Number(definition?.value ?? 0),
                                        currency_code: definition?.currency_code ?? null,
                                    };
                                })}
                            />
                        </>
                    )
                }
            </div>
        </main>
    );
}