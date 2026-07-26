import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendGroupedAssignmentAlertEmail } from "@/lib/email/assignmentAlertEmailNotifications";
import { type AssignmentAlertEmailBooking } from "@/lib/email/emailTypes";

type RouteContext = {  params: Promise<{ chauffeurId: string;  }>;};

export async function PATCH(request: Request, { params }: RouteContext) {
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const {  data: { user },  } = await authSupabase.auth.getUser();

    if (!user) {  return NextResponse.json({ message: "Not logged in." }, { status: 401 });  }

    const { data: profile } = await authSupabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {  return NextResponse.json({ message: "Not allowed." }, { status: 403 });  }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const serviceArea = String(body.serviceArea || "").trim();
    const accountStatus = String(body.accountStatus || "").trim();
    const acceptsPets = Boolean(body.acceptsPets);
    const operationalStatus = String(body.operationalStatus || "").trim();
    const statusReason = String(body.statusReason || "").trim();

    if (!name || !email || !phone || !accountStatus) {
      return NextResponse.json(
        { message: "Please fill in all required fields." },
        { status: 400 }
      );
    }

    const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", {  p_enum_type_name: "chauffeur_account_status",  });
    const statusOptions = (allowedStatuses ?? []) as string[];
    if (!statusOptions.includes(accountStatus)) { return NextResponse.json( { message: "Invalid account status." }, { status: 400 } );  }

    const { data: allowedOperationalStatuses, error: operationalStatusesError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_operational_status",});
    if (operationalStatusesError) {
      console.error( "Could not load chauffeur operational statuses:", operationalStatusesError );
      return NextResponse.json(
        { message: "Could not validate chauffeur operational status." },
        { status: 500 }
      );
    }

    const operationalStatusOptions =  (allowedOperationalStatuses ?? []) as string[];
    if (!operationalStatusOptions.includes(operationalStatus)) {
      return NextResponse.json(
        { message: "Invalid chauffeur operational status." },
        { status: 400 }
      );
    }

    /*
      Loads the current status so an email is sent only after a real status change.
      This prevents another grouped email when the admin only edits the chauffeur’s name, phone or email while the chauffeur is already sick.
    */
    const {
      data: currentChauffeur,
      error: currentChauffeurError,
    } = await supabaseAdmin
      .from("chauffeurs")
      .select("operational_status")
      .eq("id", chauffeurId)
      .maybeSingle();

    if (currentChauffeurError || !currentChauffeur) {
      console.error("Could not load the chauffeur before updating:", currentChauffeurError);

      return NextResponse.json(
        { message: "Could not load the chauffeur." },
        { status: 500 }
      );
    }

    const operationalStatusChanged = currentChauffeur.operational_status !== operationalStatus;

    /* Update chauffeur data. */
    const { error } = await supabaseAdmin
      .from("chauffeurs")
      .update({
        name,
        email,
        phone,
        service_area: serviceArea || null,
        account_status: accountStatus,
        accepts_pets: acceptsPets,
        operational_status: operationalStatus,
        status_reason: operationalStatus === "available" ? null : statusReason || null,
        status_changed_at: new Date().toISOString(),
      })
      .eq("id", chauffeurId);

    if (error) {
        console.error("Could not update chauffeur:", error);
        if (error.code === "23505") { return NextResponse.json( { message: "A chauffeur with this email already exists." }, { status: 409 } );  }
        return NextResponse.json( { message: "Could not update chauffeur." },{ status: 500 } );
    }
    // Rechecks unfinished bookings currently assigned to this chauffeur.
    const {data: affectedBookings, error: affectedBookingsError, } = await supabaseAdmin
      .from("bookings")
      .select("id, pickup_location, destination, pickup_date, pickup_time")
      .eq("chauffeur_id", chauffeurId)
      .not("status", "in", "(completed,cancelled,rejected)");

    if (affectedBookingsError) {
      console.error("Chauffeur updated, but affected bookings could not be loaded:", affectedBookingsError );
    }
    else
    {
      for (const affectedBooking of affectedBookings ?? []) {
        const { error: alertSyncError } = await supabaseAdmin.rpc(
          "sync_booking_assignment_alert",
          {
            p_booking_id: affectedBooking.id,
            p_source_type: "chauffeur",
            p_source_id: chauffeurId,
          }
        );
        if (alertSyncError) {console.error(`Could not synchronize assignment alert for booking ${affectedBooking.id}:`, alertSyncError );}
      }

      /* Sends one grouped email only when the chauffeur becomes unavailable. */
      if (operationalStatusChanged && operationalStatus !== "available" && (affectedBookings ?? []).length > 0)
      {
        const affectedBookingIds = (affectedBookings ?? []).map((affectedBooking) => affectedBooking.id );
        const {data: openAlerts, error: openAlertsError,} = await supabaseAdmin
          .from("assignment_alerts")
          .select("booking_id, issue_summary")
          .eq("alert_status", "open")
          .in("booking_id", affectedBookingIds);

        if (openAlertsError) {console.error("Alerts were synchronized, but the grouped email data could not be loaded:", openAlertsError);}
        else {
          const alertSummaryByBookingId = new Map((openAlerts ?? []).map((alertRow) => [
          alertRow.booking_id,
          alertRow.issue_summary,]));

          const emailBookings: AssignmentAlertEmailBooking[] =(affectedBookings ?? []).flatMap((affectedBooking) => {
            const issueSummary = alertSummaryByBookingId.get(affectedBooking.id);
            if (!issueSummary) {return [];}

            return [{
              bookingId: affectedBooking.id,
              pickupLocation: affectedBooking.pickup_location,
              destination: affectedBooking.destination,
              pickupDate: affectedBooking.pickup_date,
              pickupTime: affectedBooking.pickup_time,
              issueSummary,
            }];
          });

          const emailResult = await sendGroupedAssignmentAlertEmail({
            sourceType: "chauffeur",
            sourceLabel: name,
            operationalStatus,
            statusReason,
            bookings: emailBookings,
          });

          if (!emailResult.success) {console.error("Chauffeur was updated, but the grouped assignment-alert email failed:", emailResult.message); }
        }
      }
    }

    return NextResponse.json({ message: "Chauffeur updated successfully.", });
}