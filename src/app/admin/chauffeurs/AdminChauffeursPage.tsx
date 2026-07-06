import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";

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
    accepts_pets: boolean; 
    created_at: string;
};

/**
 * getChauffeurStatusSortPriority
 *
 * This helper decides the display order of chauffeur statuses.
 *
 * pending_approval should be first because admin needs to review it.
 * approved chauffeurs come after that.
 * suspended and inactive chauffeurs are less urgent.
 */
function getChauffeurStatusSortPriority(accountStatus: string) {
    if (accountStatus === "pending_approval") {   return 0;  }
    if (accountStatus === "approved") {  return 1; }
    if (accountStatus === "suspended") { return 2; }
    if (accountStatus === "inactive") { return 3; }

    return 4;
}

/**
 * getNextQuickAccountStatus
 *
 * This helper decides what the quick action button should do.
 *
 * pending_approval, inactive, and suspended can be moved to approved.
 * approved can be moved to inactive.
 */
function getNextQuickAccountStatus(accountStatus: string) {
    if (accountStatus === "approved") {  return "inactive"; }
    return "approved";
}

/**
 * getQuickAccountStatusButtonText
 *
 * This helper decides the text on the quick action button.
 */
function getQuickAccountStatusButtonText(accountStatus: string) {
    if (accountStatus === "pending_approval") { return "Approve"; }
    if (accountStatus === "approved") { return "Deactivate"; }
    return "Activate";
}

async function changeChauffeurActiveStatus(formData: FormData) {
    "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const nextAccountStatus = String(formData.get("nextAccountStatus") || "");
    const currentAccountStatus = String(formData.get("currentAccountStatus") || "");

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
    if ( nextAccountStatus === "approved" && currentAccountStatus === "pending_approval") { redirect("/admin/chauffeurs?success=chauffeur-approved");}
    if (nextAccountStatus === "approved") { redirect("/admin/chauffeurs?success=chauffeur-activated");}
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
    const acceptsPets = formData.get("acceptsPets") === "on";

    if (!name || !email || !phone) {  redirect("/admin/chauffeurs?error=missing-fields");}

    const { error } = await supabaseAdmin.from("chauffeurs").insert({
        name,
        email,
        phone,
        company_name: companyName || null,
        license_number: licenseNumber || null,
        service_area: serviceArea || null,
        account_status: "pending_approval",
        accepts_pets: acceptsPets
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
        .select( ` id, name, email, phone, company_name, license_number, service_area, account_status, rating, accepts_pets, created_at`)
        .order("created_at", { ascending: false });

    const chauffeurRows = (chauffeurs ?? []) as unknown as ChauffeurRow[];

    /*=============================================
        If first chauffeur is inactive, move it down.
        If second chauffeur is inactive, keep first one above.
        If both have same kind of status, sort by name.
    =============================================*/
    const sortedChauffeurRows = [...chauffeurRows].sort(
        (firstChauffeur, secondChauffeur) => { const firstPriority = getChauffeurStatusSortPriority( firstChauffeur.account_status );
            const secondPriority = getChauffeurStatusSortPriority(secondChauffeur.account_status );
            if (firstPriority !== secondPriority) { return firstPriority - secondPriority; }
            if (firstChauffeur.account_status === "pending_approval") {
                return (
                    new Date(secondChauffeur.created_at).getTime() -
                    new Date(firstChauffeur.created_at).getTime()
                );
            }

            return firstChauffeur.name.localeCompare(secondChauffeur.name);
        }
    );
      
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
                {pageMessage.success === "chauffeur-approved" && (<p className={pageStyles.successMsgPage}> Chauffeur approved successfully. </p>)} 
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
                        <label className="flex items-center gap-3 text-sm text-white">                       
                                <span className="h-5 w-5"> <input type="checkbox" name="acceptsPets"  />  </span> 
                                Accepts pets     
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
                    <article key={chauffeur.id}  className={formStyles.deActivateButtonPhone } >
                        <div className={ chauffeur.account_status === "inactive" ? `${formStyles.inactiveDivNoBorder} opacity-50` : formStyles.ativeDivNoBorder } >
                            <div className="border-b border-white/10 pb-4">
                                <p className="mt-1">
                                    <span className= {mobileStyle.inforCaption}>{chauffeur.account_status === "inactive" ? "Not active:" : "Name:" }  </span>
                                    <span className= {mobileStyle.infoValue} >{chauffeur.name}</span>
                                </p>
                                <p className="mt-1">
                                    <span className= {mobileStyle.inforCaption}>Email: </span>
                                    <span className= {mobileStyle.infoValue} >{chauffeur.email}</span>
                                </p>
                                <p className="mt-1">
                                    <span className= {mobileStyle.inforCaption}>Phone: </span>
                                    <span className= {mobileStyle.infoValue} >{chauffeur.phone}</span>
                                </p>
                            </div>
                            <p className="mt-1">
                                <span className= {mobileStyle.inforCaption}>Service area: </span>
                                <span className= {mobileStyle.infoValue} >{chauffeur.service_area || "- - -"}</span>
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                <div className="">
                                    <span className= {mobileStyle.inforCaption}>Rating: </span>
                                    <span className= {mobileStyle.infoValue} >{chauffeur.rating}</span>
                                </div>
                                <div className="">
                                    <span className={mobileStyle.inforCaption}>  Pets:  </span>
                                    <span  className={chauffeur.accepts_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed } >
                                        {chauffeur.accepts_pets ? " Yes ✓ " : " No ✕ "}
                                    </span>
                                </div>        
                                <form  id={`status-form-${chauffeur.id}`} action={updateChauffeurStatus}  className="mt-1">
                                    <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                                    <div className="grid grid-cols-2">
                                        <span>
                                            <label htmlFor={`status-${chauffeur.id}`} className={mobileStyle.inforCaption}> Status: </label>
                                        </span>
                                        <span>
                                            <select  id={`status-${chauffeur.id}`}  name="accountStatus"  defaultValue={chauffeur.account_status} className={mobileStyle.selectOption} >
                                                {chauffeurStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                                            </select>
                                        </span>
                                    </div>
                                </form>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">  
                            <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>  Details  </Link>

                            {/*explanation: save button submits this form: <form id={`status-form-${chauffeur.id}`} action={updateChauffeurStatus}>*/}
                            <button  type="submit" form={`status-form-${chauffeur.id}`} className={formStyles.smallButton} >  Save  </button>
                            <form action={changeChauffeurActiveStatus}>
                                <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                                <input type="hidden" name="currentAccountStatus"  value={chauffeur.account_status} />
                                <input type="hidden" name="nextAccountStatus"  value={getNextQuickAccountStatus(chauffeur.account_status)}  />
                                <button type="submit"  className={ chauffeur.account_status === "approved" ? formStyles.deActiveDeleteButton : formStyles.activateButton  }  >
                                {getQuickAccountStatusButtonText(chauffeur.account_status)}
                                </button>
                            </form>
                        </div>
                    </article>
                ))}

                {chauffeurRows.length === 0 && ( <div className={tableStyles.cellEmpty}> No chauffeurs found yet.</div> )}
                </div>

                {/* =================Desktop chauffeur table ==========================*/}
                <div className={`${tableStyles.DivCyanList} hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Name</th>
                               
                                <th className={tableStyles.cellCaption}>Phone</th>
                                <th className={tableStyles.cellCaption}>Service area</th>
                                <th className={tableStyles.cellCaption}>Rating</th>
                                <th className ={tableStyles.cellCaption}> pet </th>
                                <th className={tableStyles.cellCaption}>Status</th>
                                <th className={tableStyles.cellCaption}>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {sortedChauffeurRows.map((chauffeur) => (
                                <tr key={chauffeur.id}  className={ chauffeur.account_status === "inactive" ? `${tableStyles.rowCyan} opacity-50` : tableStyles.rowCyan } >
                                    <td className="p-4 align-top">
                                        <span className="block font-medium text-white"> {chauffeur.name} </span>
                                        <span className="mt-1 block text-sm text-slate-400 break-all"> {chauffeur.email} </span>
                                    </td>
                                    <td className={tableStyles.cell}>{chauffeur.phone}</td>
                                    <td className={tableStyles.cell}> {chauffeur.service_area || "-"} </td>
                                    <td className={tableStyles.cell}>{chauffeur.rating}</td>                                   
                                    <td className={tableStyles.cell}>
                                        <span  className={  chauffeur.accepts_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {chauffeur.accepts_pets ? "✓" : "X"}
                                        </span>
                                    </td>

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
                                                <input type="hidden" name="currentAccountStatus"  value={chauffeur.account_status} />
                                                <input type="hidden" name="nextAccountStatus"  value={getNextQuickAccountStatus(chauffeur.account_status)}  />
                                                <button type="submit"  className={ chauffeur.account_status === "approved" ? formStyles.deActiveDeleteButton : formStyles.activateButton  }  >
                                                {getQuickAccountStatusButtonText(chauffeur.account_status)}
                                                </button>
                                            </form>
                                        </div>
                                    </td>                                   
                                </tr>
                            ))}

                            {chauffeurRows.length === 0 && (<tr><td className={tableStyles.cell} colSpan={7}> No chauffeurs found yet. </td></tr>)}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}