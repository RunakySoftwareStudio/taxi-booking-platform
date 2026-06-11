import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

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
                    <p className={pageStyles.errorMessage}> Could not load chauffeur availability. </p>
                </div>
            </main>
        );
    }
    const availabilityRows = (availabilityRecords ?? []) as unknown as AvailabilityRow[];

    return (
        <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
            <Link  href="/admin" className={formStyles.link}  > ← Back to admin dashboard </Link>
            <p className={pageStyles.pageLabel}> Admin </p>
            <h1 className={pageStyles.pageTitle}>Chauffeur availability</h1>
            <p className={pageStyles.pageDescription}>  View availability records added by chauffeurs.  </p>
            <div className={tableStyles.tableDiv}>
            <table className={tableStyles.table1000}>
                <thead className={tableStyles.tableHeaderCyan}>
                <tr>
                    <th className="p-4">Chauffeur</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Start time</th>
                    <th className="p-4">End time</th>
                    <th className="p-4">Status</th>
                </tr>
                </thead>
                <tbody>
                    {
                        availabilityRows.map((availability) => 
                        {
                            //available → green, busy→ red,  offline → yellow, holiday → yellow
                            let statusColorClasses = tableStyles.statusRedClasses // "bg-yellow-600/25 text-yellow-50 ring-1 ring-yellow-500/40";
                            if (availability.status === "available") {statusColorClasses = tableStyles.statusGreenClasses; }
                            if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses; }

                            return (
                                <tr key={availability.id} className="border-b border-white/10">
                                    <td className="p-4 font-medium text-white">  {availability.chauffeurs?.name || "Unknown chauffeur"} </td>
                                    <td className={tableStyles.cell}> {availability.chauffeurs?.email || "-"} </td>
                                    <td className={tableStyles.cell}> {availability.chauffeurs?.phone || "-"} </td>
                                    <td className={tableStyles.cell}>{availability.available_date} </td>
                                    <td className={tableStyles.cell}> {availability.start_time} </td>
                                    <td className={tableStyles.cell}> {availability.end_time} </td>
                                    <td className="p-4">
                                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`}> {availability.status} </span>
                                    </td>
                                </tr>  
                            );
                        })
                    }

                    {availabilityRows.length === 0 && ( <tr> <td className={tableStyles.cellEmpty} colSpan={7}> No availability records found yet. </td> </tr> )}
                </tbody>
            </table>
            </div>
        </div>
        </main>
    );
}