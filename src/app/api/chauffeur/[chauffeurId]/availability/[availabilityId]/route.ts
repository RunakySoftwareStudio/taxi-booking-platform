import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = {
  params: Promise<{
    chauffeurId: string;
    availabilityId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { chauffeurId, availabilityId } = await params;
  const authSupabase = await createClient();
  const {data: {user},} = await authSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Not logged in." }, { status: 401 });
  }

  const { data: profile } = await authSupabase
    .from("user_profiles")
    .select("role, chauffeur_id")
    .eq("user_id", user.id)
    .maybeSingle();

  /* Only the chauffeur who owns this account may use this endpoint.
    Admin changes use the separate audited Admin Support operation. */
  const isOwnChauffeurPage = profile?.role === "chauffeur" && profile.chauffeur_id === chauffeurId;

  if (!isOwnChauffeurPage) {
    return NextResponse.json({message: "Not allowed."}, {status: 403});
  }

  const body = await request.json();

  const availableDate = String(body.availableDate || "").trim();
  const startTime = String(body.startTime || "").trim();
  const endTime = String(body.endTime || "").trim();
  const status = String(body.status || "").trim();
  const notes = String(body.notes || "").trim();

  if (!availableDate || !startTime || !endTime || !status) {
    return NextResponse.json(
      { message: "Please fill in all required fields." },
      { status: 400 }
    );
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;

  if (startTotalMinutes >= endTotalMinutes) {
    return NextResponse.json(
      { message: "Start time must be earlier than end time." },
      { status: 400 }
    );
  }

  const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", {
    p_enum_type_name: "availability_status",
  });

  const statusOptions = (allowedStatuses ?? []) as string[];

  if (!statusOptions.includes(status)) {
    return NextResponse.json(
      { message: "Invalid availability status." },
      { status: 400 }
    );
  }

  /* ============================================================
    UPDATE CHAUFFEUR AVAILABILITY THROUGH PROTECTED DATABASE RPC

    Uses the authenticated user's Supabase session so the
    PostgreSQL function can verify ownership through auth.uid().

    The RPC acquires the schedule lock, protects booking-generated
    periods and validates overlaps through the database trigger.
  ============================================================ */
  const {data: updatedRow, error} = await authSupabase.rpc(
      "chauffeur_update_availability",
      {
          p_chauffeur_id: chauffeurId,
          p_availability_id: availabilityId,
          p_available_date: availableDate,
          p_start_time: startTime,
          p_end_time: endTime,
          p_status: status,
          p_notes: notes
      }
  );

  if (error) {
    console.error("Could not update availability:", error);

    return NextResponse.json(
      { message: "Could not update availability." },
      { status: 500 }
    );
  }

  if (!updatedRow) {
    return NextResponse.json(
      { message: "Availability record was not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    message: "Availability updated successfully.",
  });
}