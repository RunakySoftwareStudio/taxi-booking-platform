import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type AvailabilityRow = {id: string;  available_date: string;  start_time: string;  end_time: string;  status: string;  created_at: string;};
type ChauffeurRow = {id: string;  name: string;};
type ChauffeurAvailabilityPageProps = {params: Promise<{chauffeurId: string;}>;};

async function addAvailability(formData: FormData) 
{  "use server";

  const chauffeurId = String(formData.get("chauffeurId") || "");
  const availableDate = String(formData.get("availableDate") || "");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const status = String(formData.get("status") || "available");

  if (!chauffeurId || !availableDate || !startTime || !endTime || !status) { return; }

  const { error } = await supabaseAdmin
    .from("chauffeur_availability")
    .insert({chauffeur_id: chauffeurId, available_date: availableDate, start_time: startTime, end_time: endTime, status, });

  if (error) {console.error("Could not add availability:", error); return; }

  revalidatePath(`/chauffeur/${chauffeurId}/availability`);
  redirect(`/chauffeur/${chauffeurId}/availability`);
}

export default async function ChauffeurAvailabilityPage({params}: ChauffeurAvailabilityPageProps) 
{
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
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-6xl">
        <Link  href={`/chauffeur/${chauffeurId}`} className="text-sm text-cyan-300 hover:text-cyan-200" >  ← Back to dashboard </Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Chauffeur </p>
        <h1 className="mt-3 text-3xl font-bold">  Availability for {chauffeurRow.name} </h1>
        <p className="mt-4 max-w-2xl text-slate-300"> Add the times when you are available, busy, offline, or on holiday. </p>

        <form action={addAvailability}  className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6" >
          <input type="hidden" name="chauffeurId" value={chauffeurId} />
          <h2 className="text-xl font-semibold">Add availability</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300"> Date </span>
              <input name="availableDate" type="date" required className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300"> Start time </span>
              <input  name="startTime"  type="time"  required className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300"> End time </span>
              <input name="endTime"  type="time"  required className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300"> Status </span>
              <select name="status" required className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" >
                {availabilityStatusOptions.map((status) => (<option key={status} value={status}> {status} </option> ))}
              </select>
            </label>
          </div>

          <button  type="submit"  className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300" >  Add availability </button>
        </form>

        <h2 className="mt-12 text-2xl font-bold">Availability records</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-175 text-left text-sm">
            <thead className="border-b border-white/10 bg-white/10 text-slate-300">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Start time</th>
                <th className="p-4">End time</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>

            <tbody>
              {availabilityRows.map((availability) => (
                <tr key={availability.id} className="border-b border-white/10">
                  <td className="p-4 text-slate-300"> {availability.available_date} </td>
                  <td className="p-4 text-slate-300"> {availability.start_time} </td>
                  <td className="p-4 text-slate-300"> {availability.end_time} </td>
                  <td className="p-4"> <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200"> {availability.status} </span> </td>
                </tr>
              ))}

              {availabilityRows.length === 0 && ( <tr> <td className="p-4 text-slate-300" colSpan={4}> No availability records found yet. </td>  </tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}