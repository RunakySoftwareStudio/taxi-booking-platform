import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import { formatShortDate, formatShortTime } from "@/lib/formatDateTime";
import { TranslatedText } from "@/components/TranslatedText";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/chauffeurs/[chauffeurid]/Availability/page.tsx 
type AvailabilityRow = {
    id: string; available_date: string; start_time: string; end_time: string;
    status: string; created_at: string; notes: string; booking_id: string | null;
};
type ChauffeurRow = {id: string;  name: string;};
type ChauffeurAvailabilityPageProps = {
    params: Promise<{chauffeurId: string;}>; 
    searchParams: Promise<{ 
                  success?: string; error?: string; 
                  availableDate?: string;  startTime?: string; endTime?: string;
                  status?: string;  notes?: string; }>;
};

function getTodayDateInputValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/*
  getAvailabilityStatusTextKey converts the database availability status
  into a translation key for readable page text.
*/
function getAvailabilityStatusTextKey(statusValue: string) {
    if (statusValue === "available") { return "statusAvailable"; }
    if (statusValue === "busy") { return "statusBusy"; }
    if (statusValue === "offline") { return "statusOffline"; }
    if (statusValue === "holiday") { return "statusHoliday"; }

    return "";
}

async function addAvailability(formData: FormData) {  
    "use server";
    // read data from user input on form
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const availableDate = String(formData.get("availableDate") || "");
    const startTime = String(formData.get("startTime") || "");
    const endTime = String(formData.get("endTime") || "");
    const status = String(formData.get("status") || "available");
    const notes = String(formData.get("notes") || "");
    
    // missing-fields check
    const previousFormValues = new URLSearchParams({availableDate, startTime, endTime, notes});
    const previousFormQuery = previousFormValues.toString();
    if (!chauffeurId || !availableDate || !startTime || !endTime) { redirect(`/chauffeur/${chauffeurId}/availability?error=missing-fields&${previousFormQuery}`); }

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

async function deleteAvailability(formData: FormData) {
    "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const availabilityId = String(formData.get("availabilityId") || "");

    if (!availabilityId) {redirect(`/chauffeur/${chauffeurId}/availability?error=missing-fields`); }
    
    // Checks whether the availability record was created from a booking.
    const { data: availabilityRecord, error: availabilityCheckError } = await supabaseAdmin
        .from("chauffeur_availability")
        .select("id, booking_id")
        .eq("id", availabilityId)
        .eq("chauffeur_id", chauffeurId)
        .maybeSingle();

    if (availabilityCheckError || !availabilityRecord) {
        console.error("Could not verify availability record:", availabilityCheckError);
        redirect(`/chauffeur/${chauffeurId}/availability?error=delete-availability-failed`);
    }

    if (availabilityRecord.booking_id) {
        redirect(`/chauffeur/${chauffeurId}/availability?error=booking-period-protected`);
    }

    const { error } = await supabaseAdmin
      .from("chauffeur_availability")
      .delete()
      .eq("id", availabilityId)
      .eq("chauffeur_id", chauffeurId);

    /*
    redirect(`/chauffeur/${chauffeurId}/availability?error=booking-period-protected`);
    means:reload the same ChauffeurAvailabilityPage, now with an error parameter so it can show the message.
    This stops the delete action and sends the user back to the availability page with this error in the URL:
      pageMessage.error === "booking-period-protected"

        booking_id is NULL
        → manual availability
        → deletion allowed

        booking_id contains a booking UUID
        → automatically created busy period
        → redirect with error
        → deletion prevented
    */
    if (error) {
      console.error("Could not delete availability:", error);
      redirect(`/chauffeur/${chauffeurId}/availability?error=delete-availability-failed` );
    }


    revalidatePath(`/chauffeur/${chauffeurId}/availability`);
    redirect(`/chauffeur/${chauffeurId}/availability?success=availability-deleted`);
}

export default async function ChauffeurAvailabilityPage({params, searchParams}: ChauffeurAvailabilityPageProps) {
    const pageMessage = await searchParams;
    const { chauffeurId } = await params;
    const formValues = {
        availableDate: pageMessage.availableDate ?? "",
        startTime: pageMessage.startTime ?? "",
        endTime: pageMessage.endTime ?? "",
        notes: pageMessage.notes ?? "",
      };
    const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
      .from("chauffeurs")
      .select("id, name")
      .eq("id", chauffeurId)
      .single();

    const { data: availabilityRecords, error: availabilityError } = await supabaseAdmin
        .from("chauffeur_availability")
        .select("id, available_date, start_time, end_time, status, notes, created_at, booking_id")
        .eq("chauffeur_id", chauffeurId)
        .order("available_date", { ascending: true })
        .order("start_time", { ascending: true });


    if (chauffeurError || !chauffeur) 
    { console.error("Could not load chauffeur:", chauffeurError);
      return (
        <main className={pageStyles.main}>
          <div className={pageStyles.containerMedium}>
            <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="availabilityTitle" /> </h1>
            <p className={pageStyles.errorMsg}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="couldNotLoadChauffeur" /> </p>
          </div>
        </main>
      );
    }

    if (availabilityError) {console.error("Could not load availability:", availabilityError);}

    const chauffeurRow = chauffeur as ChauffeurRow;
    const availabilityRows = (availabilityRecords ?? []) as AvailabilityRow[];
    const todayDate = getTodayDateInputValue();
   
    return (
      <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
          <Link href={`/chauffeur/${chauffeurId}`} className="text-sm text-cyan-300 hover:text-cyan-200"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="backToDashboard" /> </Link>
          <p className={pageStyles.pageLabelUpper}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="chauffeurLabel" /> </p>
          <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="titlePrefix" /> {chauffeurRow.name} </h1>
          <p className={pageStyles.pageDescription}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="description" /> </p>
          
          {pageMessage.success === "availability-added" && (<p className={pageStyles.successMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="addedSuccess" /> </p>)}
          {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="missingFieldsError" /> </p>)}
          {pageMessage.error === "add-availability-failed" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="addFailedError" /> </p>)}
          {pageMessage.error === "incorrect-time" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="incorrectTimeError" /> </p>)}
          {pageMessage.success === "availability-deleted" && (<p className={pageStyles.successMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="deletedSuccess" /> </p>)}
          {pageMessage.error === "delete-availability-failed" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="deleteFailedError" /> </p>)}
          {pageMessage.error === "booking-period-protected" && ( <p className={pageStyles.errorMsgPage}>  <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="bookingPeriodProtectedError" /> </p> )}
         
          <form action={addAvailability}  className={formStyles.form} >
            <input type="hidden" name="chauffeurId" value={chauffeurId} />
            <div className="grid gap-5 md:grid-cols-2">
                  <div className="flex flex-wrap items-end gap-2 grid-cols-2">
                      <div className="block">
                           <span className={formStyles.label}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="dateLabel" /> </span>
                          <input name="availableDate" type="date"  defaultValue={formValues.availableDate} required min={todayDate} max="2099-12-31" className={formStyles.inputWFullCyan} />
                      </div>
                      <div className="block">
                          <span className={formStyles.label}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="startTimeLabel" /> </span>
                          <input  name="startTime"  type="time"  required defaultValue={formValues.startTime} className={formStyles.inputWFullCyan} />
                      </div>

                      <div className="block">
                          <span className={formStyles.label}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="endTimeLabel" /> </span>
                          <input name="endTime"  type="time"  required defaultValue={formValues.endTime}  className={formStyles.inputWFullCyan} />
                      </div>
                      <input type="hidden" name="status" value="offline" />
                  </div>

                  <div className="md:col-span-2"> 
                        <span className={`mt-6 ${formStyles.span}`}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="notesLabel" /> </span>
                      <textarea name="notes"  defaultValue={formValues.notes}  className={formStyles.textarea} />
                  </div>
                </div>
                  <button  type="submit"  className={`mt-8 ${formStyles.primaryButtonDP}`}>  
                      <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="addAvailabilityButton" />
                  </button>
          </form>

          <h2 className={tableStyles.headerTableSmall}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="recordsTitle" /> </h2>
          {/* Mobile availability cards */}
          <div className="mt-6 grid gap-4 lg:hidden">
            {availabilityRows.map((availability) => { let statusColorClasses = tableStyles.statusRedClasses;
              const isBookingBusyPeriod = Boolean(availability.booking_id);
              if (availability.status === "available") { statusColorClasses = tableStyles.statusGreenClasses;}
              if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses;  }

              return (
                <article  key={availability.id} className={mobileStyle.article}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-sm tracking-tight text-white"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="dateLabel" />: </span>
                      <span className="mt-1  text-cyan-300">{formatShortDate(availability.available_date)}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tracking-tight text-white"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="statusLabel" />: </span>
                        <span  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`}> 
                          {getAvailabilityStatusTextKey(availability.status) ? <TranslatedText sectionName="chauffeurAvailabilityPage" 
                          textKey={getAvailabilityStatusTextKey(availability.status)} /> : availability.status} 
                        </span>
                         {availability.status === "available" && (<span className={tableStyles.okCheckSign} aria-hidden="true">  ✓  </span> )}
                      </div>
                    </div>

                    <div>
                      <span className="text-sm tracking-tight text-white"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="startTimeLabel" />: </span>
                      <span className="mt-1 text-cyan-300">{formatShortTime(availability.start_time)}</span>
                    </div>

                    <div>
                      <span className="text-sm tracking-tight text-white"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="endTimeLabel" />: </span>
                      <span className="mt-1 text-cyan-300">{formatShortTime(availability.end_time)}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <span className="text-sm tracking-tight text-white"> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="notesLabel" />: </span>
                    <span className="mt-1 text-cyan-300 wrap-break-word">{availability.notes || "----"}</span>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                      {isBookingBusyPeriod ? (
                          <p className="text-sm text-yellow-200">
                              <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="bookingBusyPeriodReadOnly" />
                          </p>
                      ) : (
                          <>
                              <Link href={`/chauffeur/${chauffeurId}/availability/${availability.id}`} className={formStyles.smallButton}>
                                  <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="editButton" />
                              </Link>

                              <form action={deleteAvailability}>
                                  <input type="hidden" name="chauffeurId" value={chauffeurId} />
                                  <input type="hidden" name="availabilityId" value={availability.id} />
                                  <button type="submit" className={formStyles.smallButton}>
                                      <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="deleteButton" />
                                  </button>
                              </form>
                          </>
                      )}
                  </div>

                </article>
              );
            })}

            {availabilityRows.length === 0 && ( <div className={tableStyles.cellEmpty}>  No availability records found yet. </div> )}
          </div>
          {/* Desktop availability table */}
          <div className={`${tableStyles.tableDiv} hidden lg:block`}>
            <table className={tableStyles.table1000}>
              <thead className={tableStyles.tableHeaderCyan}>
                <tr>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="dateLabel" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="startTimeLabel" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="endTimeLabel" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="statusLabel" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="notesLabel" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="editButton" /> </th>
                  <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="deleteButton" /> </th>
                </tr>
              </thead>

              <tbody>
                  {
                      availabilityRows.map((availability) =>  {
                          const isBookingBusyPeriod = Boolean(availability.booking_id);
                          //available → green, busy→ red,  offline → yellow, holiday → yellow
                          let statusColorClasses = tableStyles.statusRedClasses // "bg-yellow-600/25 text-yellow-50 ring-1 ring-yellow-500/40";
                          if (availability.status === "available") {statusColorClasses = tableStyles.statusGreenClasses; }
                          if (availability.status === "busy") { statusColorClasses = tableStyles.statusYellowClasses; }

                          return (
                              <tr key={availability.id} className="border-b border-white/10">
                                  <td className={tableStyles.cell}>{availability.available_date} </td>
                                  <td className={tableStyles.cell}> {availability.start_time} </td>
                                  <td className={tableStyles.cell}> {availability.end_time} </td>
                                  <td className={tableStyles.cellCaption}>
                                      <div className="flex items-center gap-2">
                                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`} > 
                                            {getAvailabilityStatusTextKey(availability.status) ? <TranslatedText sectionName="chauffeurAvailabilityPage" 
                                            textKey={getAvailabilityStatusTextKey(availability.status)} /> : availability.status} 
                                          </span>
                                          {availability.status === "available" && (<span className={tableStyles.okCheckSign} aria-hidden="true"> ✓ </span>)}
                                      </div>
                                  </td>
                                  <td className={tableStyles.cell}> {availability.notes || "—"} </td>
                                  <td className={tableStyles.cell}>
                                      {isBookingBusyPeriod ? (
                                          <span className="text-sm text-yellow-200">
                                              <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="bookingBusyPeriodReadOnly" />
                                          </span>
                                      ) : (
                                          <Link href={`/chauffeur/${chauffeurId}/availability/${availability.id}`} className={formStyles.smallButton}>
                                              <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="editButton" />
                                          </Link>
                                      )}
                                  </td>

                                  <td className={tableStyles.cell}>
                                      {isBookingBusyPeriod ? (
                                          <span>—</span>
                                      ) : (
                                          <form action={deleteAvailability}>
                                              <input type="hidden" name="chauffeurId" value={chauffeurId} />
                                              <input type="hidden" name="availabilityId" value={availability.id} />
                                              <button type="submit" className={formStyles.smallButton}>
                                                  <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="deleteButton" />
                                              </button>
                                          </form>
                                      )}
                                  </td>
                              </tr>  
                          );
                      })
                  }

                  {availabilityRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={7}> <TranslatedText sectionName="chauffeurAvailabilityPage" textKey="noRecordsMessage" /></td></tr> )}
              </tbody>
            </table>
          </div>  
        </div>
      </main>
    );
}