import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/chauffeurs/[chauffeurid]/Availability/page.tsx 

type AvailabilityRow = {id: string;  available_date: string;  start_time: string;  end_time: string;  status: string;  created_at: string; notes: string;};
type ChauffeurRow = {id: string;  name: string;};
type ChauffeurAvailabilityPageProps = {
    params: Promise<{chauffeurId: string;}>; 
    searchParams: Promise<{ 
                  success?: string; error?: string; 
                  availableDate?: string;  startTime?: string; endTime?: string;
                  status?: string;  notes?: string; }>;
};
async function addAvailability(formData: FormData) 
{  "use server";

    // read data from user input on form
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const availableDate = String(formData.get("availableDate") || "");
    const startTime = String(formData.get("startTime") || "");
    const endTime = String(formData.get("endTime") || "");
    const status = String(formData.get("status") || "available");
    const notes = String(formData.get("notes") || "");
    
    // missing-fields check
    const previousFormValues = new URLSearchParams({availableDate, startTime, endTime, status, notes});
    const previousFormQuery = previousFormValues.toString();
    if (!chauffeurId || !availableDate || !startTime || !endTime || !status) { redirect(`/chauffeur/${chauffeurId}/availability?error=missing-fields&${previousFormQuery}`); }

  //Time check
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;
  if (startTotalMinutes >= endTotalMinutes) { redirect(`/chauffeur/${chauffeurId}/availability?error=incorrect-time&${previousFormQuery}` ); }

  // insert data
  const { error } = await supabaseAdmin
    .from("chauffeur_availability")
    .insert({chauffeur_id: chauffeurId, available_date: availableDate, start_time: startTime, end_time: endTime, status, notes });

  // insert data check
  if (error) {
    console.error("Could not add availability:", error);
    redirect(`/chauffeur/${chauffeurId}/availability?error=add-availability-failed&${previousFormQuery}`);
  }

  // refresh and redirect 
  revalidatePath(`/chauffeur/${chauffeurId}/availability`);
  redirect(`/chauffeur/${chauffeurId}/availability?success=availability-added`);
}

export default async function ChauffeurAvailabilityPage({params, searchParams}: ChauffeurAvailabilityPageProps) {
  const pageMessage = await searchParams;
  const { chauffeurId } = await params;
  const formValues = {
      availableDate: pageMessage.availableDate ?? "",
      startTime: pageMessage.startTime ?? "",
      endTime: pageMessage.endTime ?? "",
      status: pageMessage.status ?? "",
      notes: pageMessage.notes ?? "",
    };
  const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
    .from("chauffeurs")
    .select("id, name")
    .eq("id", chauffeurId)
    .single();

  const { data: availabilityRecords, error: availabilityError } = await supabaseAdmin
      .from("chauffeur_availability")
      .select("id, available_date, start_time,  end_time, status, notes, created_at, notes")
      .eq("chauffeur_id", chauffeurId)
      .order("available_date", { ascending: true })
      .order("start_time", { ascending: true });

  const { data: availabilityStatuses, error: availabilityStatusError } = await supabaseAdmin
      .rpc("get_enum_values", { p_enum_type_name: "availability_status"});

  if (chauffeurError || !chauffeur) 
  { console.error("Could not load chauffeur:", chauffeurError);
    return (
      <main className={pageStyles.main}>
        <div className={pageStyles.containerMedium}>
          <h1 className={pageStyles.pageTitle}>Availability</h1>
          <p className={pageStyles.errorMsg}> Could not load chauffeur. </p>
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
        {pageMessage.error === "incorrect-time" && (<p className={pageStyles.errorMsgPage}> Start time must be earlier than end time.  </p>)}

        <form action={addAvailability}  className={formStyles.form} >
          <input type="hidden" name="chauffeurId" value={chauffeurId} />
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className={formStyles.span}>Date </span>
              <input name="availableDate" type="date"  defaultValue={formValues.availableDate} required min="2026-01-01" max="2099-12-31" className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}> Start time </span>
              <input  name="startTime"  type="time"  required defaultValue={formValues.startTime} className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}>End time </span>
              <input name="endTime"  type="time"  required defaultValue={formValues.endTime}  className={formStyles.inputWFull} />
            </label>

            <label className="block">
              <span className={formStyles.span}>Status </span>
              <select name="status" required defaultValue={formValues.status} className={formStyles.selectWFull} >
                {availabilityStatusOptions.map((status) => (<option key={status} value={status}> {status} </option> ))}
              </select>
            </label>
          </div>

          <label className="block">
              <span className={`mt-6 ${formStyles.span}}`} >Notes</span>             
              <input name="notes"  type="string"  required defaultValue={formValues.notes}  className={formStyles.inputWFull} />
          </label>

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
                <th className="p-4">Notes</th>
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
                                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`} > {availability.status} </span>
                                        {availability.status === "available" && (<span className="text-sm font-bold text-green-300" aria-hidden="true"> ✓ </span>)}
                                    </div>
                                </td>
                                <td className={tableStyles.cell}> {availability.notes || "—"} </td>
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