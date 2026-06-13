import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

//export const dynamic = "force-dynamic";  //Keep dynamic only in: src/app/admin/chauffeurs/page.tsx 

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

        <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
          <Link  href="/admin" className={formStyles.link} > ← Back to admin dashboard </Link>
          <p className={pageStyles.pageLabelUpper}> Admin </p>
          <h1 className={pageStyles.pageTitle}>Chauffeurs</h1>
          <p className={pageStyles.pageDescription}> Add chauffeurs and view chauffeur accounts registered in the platform. </p>

                <form action={addChauffeur} className={formStyles.form}>
                    <div className={formStyles.formDivGridCol3}>
                        <label className="block">
                            <span className={formStyles.span}> Name </span>
                            <input name="name" required placeholder="Name" className={formStyles.selectWFull}/>
                        </label>
                        <label className="block">
                            <span className={formStyles.span}> Email </span>
                            <input name="email" type="email" required placeholder="Email" className={formStyles.selectWFull}/>
                        </label>
                        <label className="block">
                            <span className={formStyles.span}> Phone </span>
                            <input name="phone" required placeholder="Phone" className={formStyles.selectWFull}/>
                        </label>
                        <label className="block">
                            <span className={formStyles.span}> Company name </span>
                            <input name="companyName" placeholder="Company name" className={formStyles.selectWFull}/>
                        </label>
                        <label className="block">
                            <span className={formStyles.span}> License number </span>
                            <input name="licenseNumber" placeholder="License number" className={formStyles.selectWFull}/>
                        </label>                       
                        <label className="block">
                            <span className={formStyles.span}> Service area </span>
                            <input name="serviceArea" placeholder="Service area" className={formStyles.selectWFull}/>
                        </label>
                    </div>
                    <button type="submit" className={`mt-8 ${formStyles.primaryButtonDP}`}> 
                        Add chauffeur 
                    </button>
                </form>

                {error && (<p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load chauffeurs. </p> )}
                
                <h3 className={tableStyles.headerTableSmall}>List of chauffeurs:</h3>
                <div className={tableStyles.tableDiv}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Name</th>
                                <th className={tableStyles.cellCaption}>Email</th>
                                <th className={tableStyles.cellCaption}>Phone</th>
                                <th className={tableStyles.cellCaption}>Company</th>
                                <th className={tableStyles.cellCaption}>Service area</th>
                                <th className={tableStyles.cellCaption}>Rating</th>
                                <th className={tableStyles.cellCaption}>Status</th>
                                <th className={tableStyles.cellCaption}>Dashboard</th>
                            </tr>
                        </thead>

                        <tbody>
                            {chauffeurRows.map((chauffeur) => (
                                <tr key={chauffeur.id} className={tableStyles.rowCyan}>
                                    <td className="p-4 font-medium text-white"> {chauffeur.name} </td>
                                    <td className={tableStyles.cell}>{chauffeur.email}</td>
                                    <td className={tableStyles.cell}>{chauffeur.phone}</td>
                                    <td className={tableStyles.cell}> {chauffeur.company_name || "-"} </td>
                                    <td className={tableStyles.cell}> {chauffeur.service_area || "-"} </td>
                                    <td className={tableStyles.cell}>{chauffeur.rating}</td>
                                    <td className={tableStyles.cellCaption}>
                                        <form action={updateChauffeurStatus} className="flex items-center gap-2">
                                            <input type="hidden" name="chauffeurId" value={chauffeur.id} />

                                            <select name="accountStatus" defaultValue={chauffeur.account_status} className={formStyles.selectForm}>
                                                 {/* This is normal selection of status options
                                                    <option value="pending_approval">pending_approval</option> 
                                                    <option value="approved">approved</option>
                                                    <option value="suspended">suspended</option>
                                                    <option value="inactive">inactive</option>
                                                */} 
                                                {chauffeurStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                                            </select>

                                            <button type="submit" className={formStyles.smallButton}>
                                                Save
                                            </button>
                                        </form>
                                    </td>

                                    
                                    <td className={tableStyles.cellCaption}>
                                        <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>
                                            Open chauffeur details
                                        </Link>
                                    </td>
                                </tr>
                            ))}

                            {chauffeurRows.length === 0 && ( <tr> <td className={tableStyles.cell} colSpan={8}> No chauffeurs found yet. </td> </tr> )}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}