import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

//export const dynamic = "force-dynamic";  //Keep dynamic only in: src/app/admin/chauffeurs/page.tsx 
/*=====================================================================
pending_approval → chauffeur applied / waiting for approval
approved         → active chauffeur, can appear on homepage and assignment lists
suspended        → temporarily blocked
inactive         → removed/deactivated from normal use
=========================================================================*/

type AdminChauffeursPageProps = {  searchParams: Promise<{ success?: string;  error?: string; }>;};

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
async function changeChauffeurActiveStatus(formData: FormData) {
    "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const nextAccountStatus = String(formData.get("nextAccountStatus") || "");

    if (!chauffeurId || !nextAccountStatus) { redirect("/admin/chauffeurs?error=missing-fields");  }
    if (nextAccountStatus !== "approved" && nextAccountStatus !== "inactive") { redirect("/admin/chauffeurs?error=invalid-status");  }

    const { error } = await supabaseAdmin
        .from("chauffeurs")
        .update({account_status: nextAccountStatus,})
        .eq("id", chauffeurId);

    if (error) {
        console.error("Could not change chauffeur active status:", error);
        redirect("/admin/chauffeurs?error=chauffeur-status-change-failed");
    }

    revalidatePath("/admin/chauffeurs");
    if (nextAccountStatus === "approved") {redirect("/admin/chauffeurs?success=chauffeur-activated");  }
    redirect("/admin/chauffeurs?success=chauffeur-deactivated");
}

async function addChauffeur(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const phone = String(formData.get("phone") || "").trim();
    const companyName = String(formData.get("companyName") || "").trim();
    const licenseNumber = String(formData.get("licenseNumber") || "").trim();
    const serviceArea = String(formData.get("serviceArea") || "").trim();

    if (!name || !email || !phone) {  redirect("/admin/chauffeurs?error=missing-fields");}

    const { error } = await supabaseAdmin.from("chauffeurs").insert({
        name,
        email,
        phone,
        company_name: companyName || null,
        license_number: licenseNumber || null,
        service_area: serviceArea || null,
        account_status: "pending_approval",
    });

    if (error) {
        console.error("Could not add chauffeur:", error);
        if (error.code === "23505") { redirect("/admin/chauffeurs?error=duplicate-email");  }
        redirect("/admin/chauffeurs?error=add-chauffeur-failed");
    }

    //So after you add/update/delete a chauffeur, the page should show fresh data.
    revalidatePath("/admin/chauffeurs"); 

    /*================================================
        //This is useful because server actions cannot use useState directly. So we pass the result through the URL.
        This also sends the user back to the chauffeurs page, but with an extra query parameter:
        /admin/chauffeurs?success=chauffeur-added
        The browser becomes:http://localhost:3000/admin/chauffeurs?success=chauffeur-added
        This part: ?success=chauffeur-added
        can be used to show a success message. For example: {success === "chauffeur-added" && ( <p >  Chauffeur added successfully. </p>)}
    =============================================*/
    redirect("/admin/chauffeurs?success=chauffeur-added");
}

async function updateChauffeurStatus(formData: FormData) {
  "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const accountStatus = String(formData.get("accountStatus") || "");

    if (!chauffeurId || !accountStatus) { redirect("/admin/chauffeurs?error=missing-fields");}

    const { error } = await supabaseAdmin
    .from("chauffeurs")
    .update({ account_status: accountStatus })
    .eq("id", chauffeurId);

    if (error) { 
        console.error("Could not update chauffeur status:", error);
        redirect("/admin/chauffeurs?error=status-update-failed");
    }

    revalidatePath("/admin/chauffeurs");
    redirect("/admin/chauffeurs?success=status-updated");
}

export default async function AdminChauffeursPage({ searchParams}: AdminChauffeursPageProps) {
    const pageMessage = await searchParams;
    
    const { data: chauffeurs, error } = await supabaseAdmin
        .from("chauffeurs")
        .select( ` id, name, email, phone, company_name, license_number, service_area, account_status, rating, created_at `)
        .order("created_at", { ascending: false });

    const chauffeurRows = (chauffeurs ?? []) as unknown as ChauffeurRow[];

    /*=============================================
        If first chauffeur is inactive, move it down.
        If second chauffeur is inactive, keep first one above.
        If both have same kind of status, sort by name.
    =============================================*/
    const sortedChauffeurRows = (chauffeurRows ?? []).sort((firstChauffeur, secondChauffeur) => {
        if (firstChauffeur.account_status === "inactive" && secondChauffeur.account_status !== "inactive" ) { return 1; }
        if (firstChauffeur.account_status !== "inactive" && secondChauffeur.account_status === "inactive" ) { return -1; }
        return firstChauffeur.name.localeCompare(secondChauffeur.name);
    });
      
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
                {pageMessage.success === "chauffeur-added" && (<p className={pageStyles.successMsgPage}> Chauffeur added successfully. </p> )}
                {pageMessage.success === "status-updated" && ( <p className={pageStyles.successMsgPage}> Chauffeur status updated successfully. </p>)}
                {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}>  Please fill in all required chauffeur fields.</p> )}
                {pageMessage.error === "duplicate-email" && ( <p className={pageStyles.errorMsgPage}> A chauffeur with this email address already exists. </p> )}
                {pageMessage.error === "add-chauffeur-failed" && (<p className={pageStyles.errorMsgPage}> Could not add chauffeur. Please try again. </p> )}
                {pageMessage.error === "status-update-failed" && (<p className={pageStyles.errorMsgPage}> Could not update chauffeur status.</p> )}
                {pageMessage.success === "chauffeur-activated" && (<p className={pageStyles.successMsgPage}> Chauffeur activated successfully. </p>)}
                {pageMessage.error === "deactivate-chauffeur-failed" && (<p className={pageStyles.errorMsgPage}> Could not deactivate chauffeur. Please try again. </p>)}
                {pageMessage.success === "chauffeur-deactivated" && (<p className={pageStyles.successMsgPage}> Chauffeur deactivated successfully.</p>)}
                {pageMessage.error === "chauffeur-status-change-failed" && ( <p className={pageStyles.errorMsgPage}> Could not change chauffeur status. Please try again. </p>)}

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

                {error && (<p className={pageStyles.errorMsgPage}> Could not load chauffeurs. </p> )}
                
                <h3 className={tableStyles.headerTableSmall}>List of chauffeurs:</h3>
                {/*================= Mobile chauffeur cards ======================*/}
                <div className="mt-6 grid gap-4 lg:hidden">
                {sortedChauffeurRows.map((chauffeur) => (
                    <article key={chauffeur.id}
                    className={ chauffeur.account_status === "inactive" ? formStyles.deActivateButtonPhone : formStyles.deActivateButtonPhone   } >
                    <div className="border-b border-white/10 pb-4">
                        <p className="mt-1">
                            <span className= "text-sm tracking-tight text-white">Name: </span>
                            <span className= "text-cyan-300" >{chauffeur.name}</span>
                        </p>
                        <p className="mt-1">
                            <span className= "text-sm tracking-tight text-white">Email: </span>
                            <span className= "text-cyan-200" >{chauffeur.email}</span>
                        </p>
                        <p className="mt-1">
                            <span className= "text-sm tracking-tight text-white">Phone: </span>
                            <span className= "text-cyan-200" >{chauffeur.phone}</span>
                        </p>
                    </div>

                    <div className="mt-4 grid gap-3">
                        <div>
                            <p className="mt-1">
                                <span className= "text-sm tracking-tight text-white">Service area: </span>
                                <span className= "text-cyan-300" >{chauffeur.service_area || "- - -"}</span>
                            </p>

                            <p className="mt-1">
                                <span className= "text-sm tracking-tight text-white">Rating: </span>
                                <span className= "text-cyan-300" >{chauffeur.rating}</span>
                            </p>
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="text-sm tracking-tight text-white"> Status </p>
                        <form action={updateChauffeurStatus} className="mt-2 grid gap-3">
                        <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                        <select name="accountStatus" defaultValue={chauffeur.account_status} className={`${formStyles.selectForm} w-full`} >
                            {chauffeurStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                        </select>
                        <button type="submit" className={formStyles.smallButton}>
                            Save
                        </button>
                        </form>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>
                            Details
                        </Link>

                        <form action={changeChauffeurActiveStatus}>
                        <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                        <input type="hidden" name="nextAccountStatus" value={chauffeur.account_status === "inactive" ? "approved" : "inactive"} />
                        <button type="submit" className={ chauffeur.account_status === "inactive" ? formStyles.activateButton : formStyles.deActiveDeleteButton } >
                            {chauffeur.account_status === "inactive" ? "Activate" : "Deactivate"}
                        </button>
                        </form>
                    </div>
                    </article>
                ))}

                {chauffeurRows.length === 0 && ( <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 text-sm text-white"> No chauffeurs found yet.</div> )}
                </div>

                {/* =================Desktop chauffeur table ==========================*/}
                <div className={`${tableStyles.DivCyanList} hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Name</th>
                                <th className={tableStyles.cellCaption}>Email</th>
                                <th className={tableStyles.cellCaption}>Phone</th>
                                <th className={tableStyles.cellCaption}>Service area</th>
                                <th className={tableStyles.cellCaption}>Rating</th>
                                <th className={tableStyles.cellCaption}>Status</th>
                                <th className={tableStyles.cellCaption}>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {sortedChauffeurRows.map((chauffeur) => (
                                <tr key={chauffeur.id}  className={ chauffeur.account_status === "inactive" ? `${tableStyles.rowCyan} opacity-50` : tableStyles.rowCyan } >
                                <td className="p-4 font-medium text-white"> {chauffeur.name} </td>
                                    <td className={tableStyles.cell}>{chauffeur.email}</td>
                                    <td className={tableStyles.cell}>{chauffeur.phone}</td>
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
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>
                                                Details
                                            </Link>
                                            <form action={changeChauffeurActiveStatus}>
                                                <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                                                <input type="hidden" name="nextAccountStatus" value={chauffeur.account_status === "inactive" ? "approved" : "inactive"} />
                                                <button type="submit" 
                                                    className={chauffeur.account_status === "inactive" ? formStyles.activateButton : formStyles.deActiveDeleteButton } >
                                                    {chauffeur.account_status === "inactive" ? "Activate" : "Deactivate" }
                                                </button>
                                            </form>
                                        </div>
                                    </td>                                   
                                </tr>
                            ))}

                            {chauffeurRows.length === 0 && ( <tr> <td className={tableStyles.cell} colSpan={7}> No chauffeurs found yet. </td> </tr> )}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}