import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import { formatShortDate, formatShortTime } from "@/lib/formatDateTime";
//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/availability/page.tsx 

type AvailabilityRow = {
  id: string;
  chauffeur_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
  chauffeurs: { name: string; email: string; phone: string; } | null;
};

export default async function AdminAvailabilityPage() 
{
    const { data: availabilityRecords, error } = await supabaseAdmin
        .from("chauffeur_availability")
        .select( `id, chauffeur_id, available_date, start_time, end_time, status, created_at, chauffeurs (name,email, phone) ` )
        .order("available_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) 
    {
        console.error("Could not load chauffeur availability:", error);
        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <h1 className={pageStyles.pageTitle}> Chauffeur availability</h1>
                    <p className={pageStyles.errorMsg}> Could not load chauffeur availability. </p>
                </div>
            </main>
        );
    }
    const availabilityRows = (availabilityRecords ?? []) as unknown as AvailabilityRow[];
    const availabilityGroups = availabilityRows.reduce< 
    { groupKey: string; chauffeurName: string; chauffeurEmail: string; chauffeurPhone: string; records: AvailabilityRow[]; }[] >((groups, availability) => {
        const chauffeurName = availability.chauffeurs?.name || "Unknown chauffeur";
        const chauffeurEmail = availability.chauffeurs?.email || "-";
        const chauffeurPhone = availability.chauffeurs?.phone || "-";
        const groupKey = `${chauffeurName}-${chauffeurEmail}-${chauffeurPhone}`;
        const existingGroup = groups.find((group) => group.groupKey === groupKey);

        if (existingGroup) {  existingGroup.records.push(availability); } 
        else { groups.push({ groupKey, chauffeurName, chauffeurEmail, chauffeurPhone, records: [availability],  }); }
        return groups;
    }, []);

    return (
        <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
            <Link  href="/admin" className={formStyles.link}  > ← Back to admin dashboard </Link>
            <p className={pageStyles.pageLabelUpper}> Admin </p>
            <h1 className={pageStyles.pageTitle}>Chauffeur availability</h1>
            <p className={pageStyles.pageDescription}>  View availability records added by chauffeurs.  </p>
            <div >

            <div className="mt-6 space-y-8">
                {availabilityGroups.map((group) => (
                    <section key={group.groupKey} className={formStyles.sectionCardBorder4}>
                    <div className="mb-5">
                        <h2 className="text-lg font-bold text-white"> Chauffeur: {group.chauffeurName}</h2>
                        <p className="wrap-break-word text-sm text-slate-300"> Email: {group.chauffeurEmail} </p>
                        <p className="text-sm text-slate-300">  Phone: {group.chauffeurPhone} </p>
                        {group.records.length ===0  && ( <p className="mt-2 text-sm font-semibold text-red-500"> No availability records! </p>)}
                        {group.records.length > 1 && ( <p className="mt-2 text-sm font-semibold text-cyan-200"> Availability records: {group.records.length} </p>)}
                        
                    </div>

                    {/* Mobile availability cards */}
                    <div className="grid gap-4 lg:hidden">
                        {group.records.map((availability, index) => {
                            let statusColorClasses = tableStyles.statusRedClasses;
                            if (availability.status === "available") { statusColorClasses = tableStyles.statusGreenClasses; }
                            if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses;}

                            return ( <article key={availability.id}  >                                  
                                    <div className={index === 0 ? "pt-0" : mobileStyle.line} >                                       
                                        <div className="grid grid-cols-2 gap-3">                                       
                                            <div>
                                                <span className={mobileStyle.inforCaption}> Date: </span>
                                                <span className={mobileStyle.infoValue}>{formatShortDate(availability.available_date)}</span>
                                            </div>
        
                                            <div className="flex items-center gap-2">
                                                <span  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`}  > {availability.status} </span>
                                                {availability.status === "available" && ( <span className={tableStyles.okCheckSign} aria-hidden="true">  ✓  </span>)}
                                            </div>

                                            <div>
                                                <span  className={mobileStyle.inforCaption}>  Start time:  </span>
                                                <span className={mobileStyle.infoValue}>{formatShortTime(availability.start_time)}</span>
                                            </div>
                                            
                                            <div>
                                                <span  className={mobileStyle.inforCaption}>  End time:  </span>
                                                <span className={mobileStyle.infoValue}>{formatShortTime(availability.end_time)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </article>  );
                            })}
                    </div>

                    {/* Desktop availability table */}
                    <div className={`${tableStyles.tableDiv} hidden lg:block`}>
                        <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Start time</th>
                            <th className="p-4">End time</th>
                            <th className="p-4">Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            {group.records.map((availability) => {let statusColorClasses = tableStyles.statusRedClasses;
                            if (availability.status === "available") { statusColorClasses = tableStyles.statusGreenClasses; }
                            if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses;}

                            return (
                                <tr key={availability.id} className="border-b border-white/10">
                                <td className={tableStyles.cell}> {availability.available_date} </td>
                                <td className={tableStyles.cell}> {availability.start_time}  </td>
                                <td className={tableStyles.cell}> {availability.end_time}  </td>

                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                    <span  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`}  >  {availability.status}  </span>
                                    {availability.status === "available" && ( <span className={tableStyles.okCheckSign} aria-hidden="true">  ✓ </span>  )}
                                    </div>
                                </td>
                                </tr>); })}
                        </tbody>
                        </table>
                    </div>
                    </section>
                ))}

                {availabilityGroups.length === 0 && ( <p className={tableStyles.cellEmpty}> No availability records found yet. </p>  )}
                </div>
            </div>
        </div>
        </main>
    );
}