import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/chauffeurs/[chauffeurid]/Availability/page.tsx 

type AvailabilityRow = {id: string;  available_date: string;  start_time: string;  end_time: string;  status: string;  created_at: string;};
type ChauffeurRow = {id: string;  name: string;};
type ChauffeurAvailabilityPageProps = {params: Promise<{chauffeurId: string;}>; searchParams: Promise<{ success?: string; error?: string; }>;};

async function addAvailability(formData: FormData) 
{  "use server";

  const chauffeurId = String(formData.get("chauffeurId") || "");
  const availableDate = String(formData.get("availableDate") || "");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const status = String(formData.get("status") || "available");

  if (!chauffeurId || !availableDate || !startTime || !endTime || !status) {
    redirect(`/chauffeur/${chauffeurId}/availability?error=missing-fields`);
  }
  const { error } = await supabaseAdmin
    .from("chauffeur_availability")
    .insert({chauffeur_id: chauffeurId, available_date: availableDate, start_time: startTime, end_time: endTime, status, });

  if (error) {
    console.error("Could not add availability:", error);
    redirect(`/chauffeur/${chauffeurId}/availability?error=add-availability-failed`);
  }

  revalidatePath(`/chauffeur/${chauffeurId}/availability`);
  redirect(`/chauffeur/${chauffeurId}/availability?success=availability-added`);
}

export default async function ChauffeurAvailabilityPage({params, searchParams}: ChauffeurAvailabilityPageProps) {
  const pageMessage = await searchParams;
  const { chauffeurId } = await params;
  const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
    .from("chauffeurs")
    .select("id, name")
    .eq("id", chauffeurId)
    .single();

  const { data: availabilityRecords, error: availabilityError } = await supabaseAdmin
      .from("chauffeur_availability")
      .select("id, available_date, start_time, end_time, status, created_at")
      .eq("chauffeur_id", chauffeurId)
      .order("available_date", { ascending: true })
      .order("start_time", { ascending: true });

  const { data: availabilityStatuses, error: availabilityStatusError } = await supabaseAdmin
      .rpc("get_enum_values", { p_enum_type_name: "availability_status"});

  if (chauffeurError || !chauffeur) 
  { console.error("Could not load chauffeur:", chauffeurError);
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-bold">Availability</h1>
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load chauffeur. </p>
        </div>
      </main>
    );
  }

  if (availabilityError) {console.error("Could not load availability:", availabilityError);}
  if (availabilityStatusError) {console.error("Could not load availability statuses:", availabilityStatusError); }

  const chauffeurRow = chauffeur as ChauffeurRow;
  const availabilityRows = (availabilityRecords ?? []) as AvailabilityRow[];
  const availabilityStatusOptions = (availabilityStatuses ?? []) as string[];

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.container}> 
        <Link  href={`/chauffeur/${chauffeurId}`} className="text-sm text-cyan-300 hover:text-cyan-200" >  ← Back to dashboard </Link>
        <p className={pageStyles.pageLabelUpper}> Chauffeur </p>
        <h1 className={pageStyles.pageTitle}>  Availability for {chauffeurRow.name} </h1>
        <p className={pageStyles.pageDescription}> Add the times when you are available, busy, offline, or on holiday. </p>
        
        {pageMessage.success === "availability-added" && (<p className={pageStyles.successMsgPage}> Availability added successfully. </p>)}
        {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> Please fill in all required availability fields. </p>)}
        {pageMessage.error === "add-availability-failed" && (<p className={pageStyles.errorMsgPage}> Could not add availability. Please try again.</p>)}

        <form action={addAvailability}  className={formStyles.form} >
          <input type="hidden" name="chauffeurId" value={chauffeurId} />
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className={formStyles.span}>Date </span>
              <input name="availableDate" type="date" required className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}> Start time </span>
              <input  name="startTime"  type="time"  required className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}>End time </span>
              <input name="endTime"  type="time"  required className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}>Status </span>
              <select name="status" required className={formStyles.selectWFull} >
                {availabilityStatusOptions.map((status) => (<option key={status} value={status}> {status} </option> ))}
              </select>
            </label>
          </div>

          <button  type="submit"  className={`mt-8 ${formStyles.primaryButtonDP}`}>  
              Add availability 
          </button>
        </form>

        <h2 className={tableStyles.headerTableSmall}>Availability records</h2>
        <div className={tableStyles.tableDiv}>
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
                {
                    availabilityRows.map((availability) =>  {
                        //available → green, busy→ red,  offline → yellow, holiday → yellow
                        let statusColorClasses = tableStyles.statusRedClasses // "bg-yellow-600/25 text-yellow-50 ring-1 ring-yellow-500/40";
                        if (availability.status === "available") {statusColorClasses = tableStyles.statusGreenClasses; }
                        if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses; }

                        return (
                            <tr key={availability.id} className="border-b border-white/10">
                                <td className={tableStyles.cell}>{availability.available_date} </td>
                                <td className={tableStyles.cell}> {availability.start_time} </td>
                                <td className={tableStyles.cell}> {availability.end_time} </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <span
                                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`} > {availability.status} </span>
                                        {availability.status === "available" && (<span className="text-sm font-bold text-green-300" aria-hidden="true"> ✓ </span>)}
                                    </div>
                                </td>
                            </tr>  
                        );
                    })
                }

                {availabilityRows.length === 0 && ( <tr> <td className={tableStyles.cellEmpty} colSpan={4}> No availability records found yet. </td> </tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}