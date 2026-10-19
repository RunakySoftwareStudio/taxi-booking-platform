import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import ChauffeurFilters from "./ChauffeurFilters";

//export const dynamic = "force-dynamic";  //Keep dynamic only in: src/app/admin/chauffeurs/page.tsx 

/**=====================================================================
 * These will mean:
    name                 → partial chauffeur-name search
    serviceArea          → partial service-area search
    pets                 → all / yes / no
    wheelchairCapacity   → any / 1 / 2 / 3 / 4
    extraLargeLuggage    → all / yes / no
 =====================================================================*/
type AdminChauffeursPageProps = {
    searchParams: Promise<{
        success?: string;
        error?: string;

        /* Admin chauffeur-list filters. */
        name?: string;
        serviceArea?: string;
        pets?: string;
        wheelchairCapacity?: string;
        extraLargeLuggage?: string;
    }>;
};

/*=====================================================================
pending_approval → chauffeur applied / waiting for approval
approved         → active chauffeur, can appear on homepage and assignment lists
suspended        → temporarily blocked
inactive         → removed/deactivated from normal use
=========================================================================*/
type ChauffeurVehicleOption = {
    id: string;
    is_default_vehicle: boolean;
    vehicle_status: string;
    wheelchair_capacity: number;
    extra_large_luggage: boolean;
};
type ChauffeurRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    company_name: string | null;
    operator_id: string | null;
    taxi_operators: {
        company_name: string;
        verification_status: string;
    } | null;
    license_number: string | null;
    service_area: string | null;
    account_status: string;
    compliance_monitoring_status?: string;
    operational_status: string;
    status_reason: string | null;
    rating: number;
    accepts_pets: boolean; 
    created_at: string;
    /* Vehicle capabilities used by the Admin chauffeur filters. */
    vehicles: ChauffeurVehicleOption[];
};

type ChauffeurComplianceMonitoringRow = {
    chauffeur_id: string;
    monitoring_status: string;
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
    getDefaultVehicle

    Returns the chauffeur's default vehicle.
    Vehicle capability filters use this vehicle only.
*/
function getDefaultVehicle(chauffeur: ChauffeurRow) {
    return (chauffeur.vehicles ?? []).find(
        (vehicle) => vehicle.is_default_vehicle
    ) ?? null;
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

/**
 * formatShortChauffeurReference
 *
 * This shows a short version of the chauffeur ID in the admin list.
 * The full chauffeur ID is shown on the edit chauffeur page.
 */
function formatShortChauffeurReference(chauffeurId: string) {
    if (!chauffeurId) { return "-"; }
    return chauffeurId.slice(0, 8);
}

/* Returns red styling when a chauffeur is operationally unavailable. */
function getChauffeurOperationalContainerClass( operationalStatus: string) {
    return operationalStatus === "available"
        ? ""
        : "border-red-400/50 bg-red-400/10";
}

/* Returns the text color for the operational status. */
function getChauffeurOperationalTextClass(operationalStatus: string) {
    return operationalStatus === "available"
        ? "text-green-300"
        : "text-red-300";
}

/**
 * canUseQuickAccountAction
 *
 * Approved chauffeurs can always be deactivated.
 * Pending, inactive or suspended chauffeurs can only move to
 * approved when their compliance is currently valid.
 */
function canUseQuickAccountAction(chauffeur: ChauffeurRow) {
    if (chauffeur.account_status === "approved") { return true; }

    return chauffeur.compliance_monitoring_status === "ok"
        || chauffeur.compliance_monitoring_status === "warning";
}

/* ============================================================
    SYNC CHAUFFEUR BOOKING ALERTS
    This is a Server helper that is why we do not put "use server";  Called only by server-side code:

   Rechecks every unfinished booking assigned to one chauffeur.
   This is needed after changing the chauffeur's account status.
============================================================ */
async function syncChauffeurBookingAlerts(chauffeurId: string) {
    const { data: bookingRows, error: bookingLoadError, } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("chauffeur_id", chauffeurId)
        .not("status", "in", "(completed,cancelled,rejected)");

    if (bookingLoadError) {
        console.error("Could not load chauffeur bookings for alert synchronization:", bookingLoadError );
        return;
    }

    for (const bookingRow of bookingRows ?? []) {
        const { error: alertSyncError } = await supabaseAdmin.rpc("sync_booking_assignment_alert",
                {
                    p_booking_id: bookingRow.id,
                    p_source_type: "chauffeur",
                    p_source_id: chauffeurId,
                }
            );

        if (alertSyncError) {console.error(`Could not synchronize assignment alert for booking ${bookingRow.id}:`, alertSyncError ); }
    }
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

    /* Rechecks assignments affected by the chauffeur account change. */
    await syncChauffeurBookingAlerts(chauffeurId);

    revalidatePath("/admin/chauffeurs");
    if ( nextAccountStatus === "approved" && currentAccountStatus === "pending_approval") { redirect("/admin/chauffeurs?success=chauffeur-approved");}
    if (nextAccountStatus === "approved") { redirect("/admin/chauffeurs?success=chauffeur-activated");}
    redirect("/admin/chauffeurs?success=chauffeur-deactivated");
}

export default async function AdminChauffeursPage({ searchParams}: AdminChauffeursPageProps) {
    const pageMessage = await searchParams;
    /* Reads the Admin chauffeur filters from the URL. */
    const nameFilter = pageMessage.name?.trim() ?? "";
    const serviceAreaFilter = pageMessage.serviceArea?.trim() ?? "";
    const petsFilter =
        pageMessage.pets === "yes" || pageMessage.pets === "no"
            ? pageMessage.pets
            : "all";
    const wheelchairCapacityFilter =
        ["1", "2", "3", "4"].includes(pageMessage.wheelchairCapacity ?? "")
            ? Number(pageMessage.wheelchairCapacity)
            : 0;
    const extraLargeLuggageFilter =
        pageMessage.extraLargeLuggage === "yes" ||
        pageMessage.extraLargeLuggage === "no"
            ? pageMessage.extraLargeLuggage
            : "all";
    const { data: chauffeurs, error } = await supabaseAdmin
        .from("chauffeurs")
        .select(`id, name, email, phone, company_name, operator_id, license_number,
            operational_status, status_reason, service_area, account_status,
            rating, accepts_pets, created_at,
            taxi_operators (company_name, verification_status),
            vehicles (
                id,
                is_default_vehicle,
                vehicle_status,
                wheelchair_capacity,
                extra_large_luggage
            )`)
        .order("created_at", { ascending: false });

    const baseChauffeurRows = (chauffeurs ?? []) as unknown as ChauffeurRow[];

    /* Load the current compliance monitoring state for the chauffeur action buttons. */
    const { data: complianceMonitoring, error: complianceMonitoringError } = await supabaseAdmin
        .from("chauffeur_compliance_monitoring")
        .select("chauffeur_id, monitoring_status");

    if (complianceMonitoringError) {
        console.error("Could not load chauffeur compliance monitoring:", complianceMonitoringError);
    }

    /* Match each chauffeur with the current compliance monitoring status.
    Missing monitoring information is treated as critical for safety. */
    const monitoringRows = (complianceMonitoring ?? []) as ChauffeurComplianceMonitoringRow[];
    const complianceMonitoringByChauffeurId = new Map();
    monitoringRows.forEach((row) => {
        complianceMonitoringByChauffeurId.set(
            row.chauffeur_id,
            row.monitoring_status,
        );
    });

    /**
     * For every chauffeur in baseChauffeurRows:
        create a new chauffeur object
        copy all existing chauffeur information
        add compliance_monitoring_status
        find that status using the chauffeur ID
        if no status can be found, treat the chauffeur as critical
     */
    const chauffeurRows = baseChauffeurRows.map((chauffeur) => {
        //If we find a monitoring status use that status otherwise  use "critical"
        //We deliberately choose "critical" as the fallback because this is a safety-sensitive situation.
        const monitoringStatus =  complianceMonitoringByChauffeurId.get(chauffeur.id) ?? "critical";

        return {
            ...chauffeur,
            compliance_monitoring_status: monitoringStatus,
        };
    });

    /*
        Filters the Admin chauffeur list.

        Name and service area use partial, case-insensitive matching.
        Vehicle capability filters use the chauffeur's default vehicle.
    */
    const filteredChauffeurRows = chauffeurRows.filter((chauffeur) => {
        const defaultVehicle = getDefaultVehicle(chauffeur);

        /* Filter by chauffeur name. */
        if ( nameFilter && !chauffeur.name.toLowerCase().includes(nameFilter.toLowerCase())) {
            return false;
        }

        /* Filter by service area. */
        if (
            serviceAreaFilter &&
            !(chauffeur.service_area ?? "")
                .toLowerCase()
                .includes(serviceAreaFilter.toLowerCase())
        ) {
            return false;
        }

        /* Filter by whether the chauffeur accepts pets. */
        if (petsFilter === "yes" && !chauffeur.accepts_pets) {
            return false;
        }

        if (petsFilter === "no" && chauffeur.accepts_pets) {
            return false;
        }

        /* Filter by minimum wheelchair capacity of the default vehicle. */
        if (wheelchairCapacityFilter > 0 && (!defaultVehicle || defaultVehicle.wheelchair_capacity < wheelchairCapacityFilter)) {
            return false;
        }

        /* Filter by extra-large-luggage support of the default vehicle. */
        if (extraLargeLuggageFilter === "yes" && (!defaultVehicle || !defaultVehicle.extra_large_luggage)) {
            return false;
        }

        if (extraLargeLuggageFilter === "no" && defaultVehicle?.extra_large_luggage === true ) {
            return false;
        }

        return true;
    });

    /* Count pending chauffeur profile-change requests for the Admin alert badge. */
    const { count: pendingChangeRequestCount, error: changeRequestCountError } = await supabaseAdmin
        .from("chauffeur_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

    if (changeRequestCountError) {
        console.error("Could not count pending chauffeur change requests:", changeRequestCountError);
    }

    const pendingChangeRequests = pendingChangeRequestCount ?? 0;

    /*=============================================
    Sort chauffeur rows for the admin list.
    const sortedChauffeurRows = [...chauffeurRows] means:
        1. Copy chauffeurRows
        2. Sort the copy
        3. Keep the original chauffeurRows unchanged

    firstPriority and secondPriority are numbers created from chauffeur statuses.
    They help sort() place important statuses like pending_approval at the top.

    Sorting rules:
        1. Different status priority: sort by priority number.
        2. Same status and pending_approval: newest registration first.
        3. Same status but not pending_approval: sort by chauffeur name.

        They help .sort() place important statuses like pending_approval at the top of the admin list, instead of sorting statuses alphabetically.
        sortedChauffeurRows = [...filteredChauffeurRows]  Create a new array and copy all items from filteredChauffeurRows into it.
        .sort() is using your custom chauffeur priority rules, not simply alphabetical sorting.
    =============================================*/
    const sortedChauffeurRows = [...filteredChauffeurRows].sort(
        (firstChauffeur, secondChauffeur) => { 
            const firstPriority = getChauffeurStatusSortPriority( firstChauffeur.account_status );
            const secondPriority = getChauffeurStatusSortPriority(secondChauffeur.account_status );
            if (firstPriority !== secondPriority) { return firstPriority - secondPriority; }
            if (firstChauffeur.account_status === "pending_approval") {
                return ( new Date(secondChauffeur.created_at).getTime() - new Date(firstChauffeur.created_at).getTime() );
            }
            return firstChauffeur.name.localeCompare(secondChauffeur.name);
        }
    );

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}> 
                <Link  href="/admin" className={formStyles.link} > ← Back to admin dashboard </Link>
                <p className={pageStyles.pageLabelUpper}> Admin </p>
                <h1 className={pageStyles.pageTitle}>Chauffeurs</h1>
                <p className={pageStyles.pageDescription}> Add chauffeurs and view chauffeur accounts registered in the platform. </p>

                {/* Opens the separate create and compliance-monitoring pages. */}
                <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/admin/chauffeurs/new" className={`inline-flex items-center justify-center ${formStyles.primaryButtonDP}`} >
                        Add chauffeur
                    </Link>

                    {/* Opens the chauffeur compliance expiry and verification monitoring page. */}
                    <Link href="/admin/chauffeurs/compliance" className={`inline-flex items-center justify-center ${formStyles.primaryButtonDP}`} >
                        Compliance monitoring
                    </Link>

                    {/* Opens chauffeur profile-change requests and alerts Admin when requests are pending. */}
                    <Link href="/admin/chauffeurs/change-requests" className={`inline-flex items-center justify-center ${formStyles.primaryButtonDP}`}>
                        <span>Change requests</span>

                        {pendingChangeRequests > 0 && (
                            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                                {pendingChangeRequests}
                            </span>
                        )}
                    </Link>
                </div>

                {/* Admin chauffeur search and capability filters. */}
                <ChauffeurFilters
                    nameFilter={nameFilter}
                    serviceAreaFilter={serviceAreaFilter}
                    petsFilter={petsFilter}
                    wheelchairCapacityFilter={wheelchairCapacityFilter}
                    extraLargeLuggageFilter={extraLargeLuggageFilter}
                />

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

                {error && (<p className={pageStyles.errorMsgPage}> Could not load chauffeurs. </p> )}
                
                <h3 className={tableStyles.headerTableSmall}>List of chauffeurs:</h3>
                {/*================= Mobile chauffeur cards ======================*/}
                <div className="mt-6 grid gap-4 lg:hidden">
                {sortedChauffeurRows.map((chauffeur) => (
                    <article key={chauffeur.id}
                        className={`${formStyles.deActivateButtonPhone} ${getChauffeurOperationalContainerClass(chauffeur.operational_status)}`}
                    >
                        <div className={ chauffeur.account_status === "inactive" ? `${formStyles.inactiveDivNoBorder} opacity-50` : formStyles.ativeDivNoBorder } >
                            <div className="border-b border-white/10 pb-4">
                                <p className="mt-1">
                                    <span className={mobileStyle.inforCaption}>Ref: </span>
                                    <span className={`${mobileStyle.infoValue} break-all`}>{formatShortChauffeurReference(chauffeur.id)}</span>
                                </p>
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
                                <p className="mt-1">
                                    <span className={mobileStyle.inforCaption}>Taxi operator: </span>
                                    <span className={mobileStyle.infoValue}>
                                        {chauffeur.taxi_operators?.company_name || "Not assigned"}
                                    </span>

                                    {chauffeur.taxi_operators && (
                                        <span className="ml-2 text-xs text-slate-400">
                                            ({chauffeur.taxi_operators.verification_status})
                                        </span>
                                    )}
                                </p>
                                <div className="mt-2">
                                    <span className={mobileStyle.inforCaption}>
                                        Operational status:{" "}
                                    </span>
                                    <span className={`font-semibold ${getChauffeurOperationalTextClass(chauffeur.operational_status )}`}>
                                        {chauffeur.operational_status}
                                    </span>
                                    {chauffeur.status_reason && (
                                        <p className="mt-1 text-xs text-slate-400">
                                            Reason: {chauffeur.status_reason}
                                        </p> )
                                    }
                                </div>
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
                                <div className="col-span-2 mt-1">
                                    <span className={mobileStyle.inforCaption}>Account status: </span>
                                    <span className={mobileStyle.infoValue}>
                                        {chauffeur.account_status}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">  
                            <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>  Details  </Link>

                            {/* Only allow approval/reactivation when chauffeur compliance is currently valid. */}
                            {canUseQuickAccountAction(chauffeur) ? (
                                <form action={changeChauffeurActiveStatus}>
                                    <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                                    <input type="hidden" name="currentAccountStatus" value={chauffeur.account_status} />
                                    <input type="hidden" name="nextAccountStatus" value={getNextQuickAccountStatus(chauffeur.account_status)} />
                                    <button type="submit" className={chauffeur.account_status === "approved" ? formStyles.deActiveDeleteButton : formStyles.activateButton}>
                                        {getQuickAccountStatusButtonText(chauffeur.account_status)}
                                    </button>
                                </form>
                            ) : (
                                <button type="button" disabled className={`${formStyles.activateButton} cursor-not-allowed opacity-50`}>
                                    Compliance required
                                </button>
                            )}
                        </div>
                    </article>
                ))}

                {sortedChauffeurRows.length === 0 && ( <div className={tableStyles.cellEmpty}> No chauffeurs found yet.</div> )}
                </div>

                {/* =================Desktop chauffeur table ==========================*/}
                <div className={`${tableStyles.DivCyanList} hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        {/*These add up to 100% and deliberately give more room to: Name,Taxi operator,Actions*/}
                        {/* Desktop column widths: Name, Phone, Taxi operator, Service area, Rating, Pet, Status, Actions */}
                        <colgroup><col className="w-[20%]" />
                        <col className="w-[11%]" />
                        <col className="w-[17%]" />
                        <col className="w-[10%]" />
                        <col className="w-[6%]" />
                        <col className="w-[6%]" />
                        <col className="w-[12%]" />
                        <col className="w-[18%]" />
                        </colgroup>

                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Name</th>
                                <th className={tableStyles.cellCaption}>Phone</th>
                                <th className={tableStyles.cellCaption}>Taxi operator</th>
                                <th className={tableStyles.cellCaption}>Service area</th>
                                <th className={tableStyles.cellCaption}>Rating</th>
                                <th className ={tableStyles.cellCaption}> pet </th>
                                <th className={tableStyles.cellCaption}>Status</th>
                                <th className={tableStyles.cellCaption}>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {sortedChauffeurRows.map((chauffeur) => (
                                <tr key={chauffeur.id}
                                    className={`${tableStyles.rowCyan} ${chauffeur.account_status === "inactive" ? "opacity-50" : "" }
                                    ${getChauffeurOperationalContainerClass(chauffeur.operational_status )}`}
                                >
                                    <td className="p-4 align-top text-start">
                                        <span className="block font-medium text-white"> {chauffeur.name} </span>
                                        <span className="mt-1 block text-xs text-cyan-300"> Ref: {formatShortChauffeurReference(chauffeur.id)} </span>
                                        <span className="mt-1 block text-sm text-slate-400 break-all"> {chauffeur.email} </span>
                                        <span className={`mt-2 block text-xs font-semibold ${getChauffeurOperationalTextClass(chauffeur.operational_status )}`}>
                                            Operational: {chauffeur.operational_status}
                                        </span>

                                    {chauffeur.status_reason && (
                                        <span className="mt-1 block text-xs text-slate-400">
                                            Reason: {chauffeur.status_reason}
                                        </span> )
                                    }
                                    </td>
                                    <td className={tableStyles.cell}>{chauffeur.phone}</td>
                                    <td className={tableStyles.cell}>
                                        <div>{chauffeur.taxi_operators?.company_name || "Not assigned"}</div>

                                        {chauffeur.taxi_operators && (
                                            <div className="mt-1 text-xs text-slate-400">
                                                {chauffeur.taxi_operators.verification_status}
                                            </div>
                                        )}
                                    </td>
                                    <td className={tableStyles.cell}> {chauffeur.service_area || "-"} </td>
                                    <td className={tableStyles.cell}>{chauffeur.rating}</td>                                   
                                    <td className={tableStyles.cell}>
                                        <span  className={  chauffeur.accepts_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {chauffeur.accepts_pets ? "✓" : "X"}
                                        </span>
                                    </td>

                                    <td className={tableStyles.cell}>
                                        <span className="font-semibold text-slate-200">
                                            {chauffeur.account_status}
                                        </span>
                                    </td>   
                                    
                                    <td className={tableStyles.cellCaption}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Link href={`/chauffeur/${chauffeur.id}`} className={formStyles.smallButton}>
                                                Details
                                            </Link>
                                            {/* Only allow approval/reactivation when chauffeur compliance is currently valid. */}
                                            {canUseQuickAccountAction(chauffeur) ? (
                                                <form action={changeChauffeurActiveStatus}>
                                                    <input type="hidden" name="chauffeurId" value={chauffeur.id} />
                                                    <input type="hidden" name="currentAccountStatus" value={chauffeur.account_status} />
                                                    <input type="hidden" name="nextAccountStatus" value={getNextQuickAccountStatus(chauffeur.account_status)} />
                                                    <button type="submit" className={chauffeur.account_status === "approved" ? formStyles.deActiveDeleteButton : formStyles.activateButton}>
                                                        {getQuickAccountStatusButtonText(chauffeur.account_status)}
                                                    </button>
                                                </form>
                                            ) : (
                                                <button type="button" disabled className={`${formStyles.activateButton} cursor-not-allowed opacity-50`}>
                                                    Compliance required
                                                </button>
                                            )}
                                        </div>
                                    </td>                                   
                                </tr>
                            ))}

                            {sortedChauffeurRows.length === 0 && (<tr><td className={tableStyles.cell} colSpan={8}> No chauffeurs found yet. </td></tr>)}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}