import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type ChauffeurRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string | null;
  license_number: string | null;
  service_area: string | null;
  account_status: string;
  rating: number;
  created_at: string;
};

async function addChauffeur(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const companyName = String(formData.get("companyName") || "").trim();
    const licenseNumber = String(formData.get("licenseNumber") || "").trim();
    const serviceArea = String(formData.get("serviceArea") || "").trim();

    if (!name || !email || !phone) { return; }

    const { error } = await supabaseAdmin.from("chauffeurs").insert({
        name,
        email,
        phone,
        company_name: companyName || null,
        license_number: licenseNumber || null,
        service_area: serviceArea || null,
        account_status: "pending_approval",
    });

    if (error) { console.error("Could not add chauffeur:", error); return; }

    revalidatePath("/admin/chauffeurs");
    redirect("/admin/chauffeurs");
}

async function updateChauffeurStatus(formData: FormData) {
  "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const accountStatus = String(formData.get("accountStatus") || "");

    if (!chauffeurId || !accountStatus) { return; }

    const { error } = await supabaseAdmin
    .from("chauffeurs")
    .update({ account_status: accountStatus })
    .eq("id", chauffeurId);

    if (error) { console.error("Could not update chauffeur status:", error); return; }

    revalidatePath("/admin/chauffeurs");
    redirect("/admin/chauffeurs");
}

export default async function AdminChauffeursPage() {
    
    const { data: chauffeurs, error } = await supabaseAdmin
        .from("chauffeurs")
        .select( ` id, name, email, phone, company_name, license_number, service_area, account_status, rating, created_at `)
        .order("created_at", { ascending: false });

    const chauffeurRows = (chauffeurs ?? []) as unknown as ChauffeurRow[];
    
    const { data: chauffeurStatuses, error: chauffeurStatusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_account_status",  });
    if (chauffeurStatusError) { console.error("Could not load chauffeur statuses:", chauffeurStatusError); }
    const chauffeurStatusOptions = (chauffeurStatuses ?? []) as string[];

    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
                Admin
                </p>
                    <h1 className="mt-3 text-3xl font-bold">Chauffeurs</h1>
                    <p className="mt-4 max-w-2xl text-slate-300"> Add chauffeurs and view chauffeur accounts registered in the platform.</p>

                    <form action={addChauffeur} className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
                        <h2 className="text-xl font-semibold">Add chauffeur</h2>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            <input name="name" required placeholder="Name" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                            <input name="email" type="email" required placeholder="Email" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                            <input name="phone" required placeholder="Phone" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white"/>
                            <input name="companyName" placeholder="Company name" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                            <input name="licenseNumber" placeholder="License number" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white"/>
                            <input name="serviceArea" placeholder="Service area" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white"/>
                        </div>

                        <button type="submit"  className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"> Add chauffeur </button>
                    </form>

                    {error && (<p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load chauffeurs. </p> )}

                    <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-white/10 bg-white/10 text-slate-300">
                            <tr>
                                <th className="p-4">Name</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Company</th>
                                <th className="p-4">Service area</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Rating</th>
                                <th className="p-4">Dashboard</th>
                            </tr>
                        </thead>

                        <tbody>
                            {chauffeurRows.map((chauffeur) => (
                                <tr key={chauffeur.id} className="border-b border-white/10">
                                    <td className="p-4 font-medium text-white"> {chauffeur.name} </td>
                                    <td className="p-4 text-slate-300">{chauffeur.email}</td>
                                    <td className="p-4 text-slate-300">{chauffeur.phone}</td>
                                    <td className="p-4 text-slate-300"> {chauffeur.company_name || "-"} </td>
                                    <td className="p-4 text-slate-300"> {chauffeur.service_area || "-"} </td>
                                    <td className="p-4">
                                        <form action={updateChauffeurStatus} className="flex items-center gap-2">
                                            <input type="hidden" name="chauffeurId" value={chauffeur.id} />

                                            <select
                                                name="accountStatus"
                                                defaultValue={chauffeur.account_status}
                                                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                                                 {/* This is normal selection of status options
                                                    <option value="pending_approval">pending_approval</option> 
                                                    <option value="approved">approved</option>
                                                    <option value="suspended">suspended</option>
                                                    <option value="inactive">inactive</option>
                                                */} 
                                                {chauffeurStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                                            </select>

                                            <button type="submit" className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                                                Save
                                            </button>
                                        </form>
                                    </td>

                                    <td className="p-4 text-slate-300">{chauffeur.rating}</td>
                                    <td className="p-4">
                                        <Link href={`/chauffeur/${chauffeur.id}`} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                                            Open
                                        </Link>
                                    </td>
                                </tr>
                            ))}

                            {chauffeurRows.length === 0 && ( <tr> <td className="p-4 text-slate-300" colSpan={8}> No chauffeurs found yet. </td> </tr> )}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}