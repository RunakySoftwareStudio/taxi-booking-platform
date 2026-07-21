import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ vehicleId: string; }>;};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { vehicleId } = await params;
  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();

  if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

  const { data: profile } = await authSupabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

  const body = await request.json();
  const chauffeurId = String(body.chauffeurId || "").trim();
  const vehicleType = String(body.vehicleType || "").trim();
  const brand = String(body.brand || "").trim();
  const model = String(body.model || "").trim();
  const licensePlate = String(body.licensePlate || "").trim().toUpperCase();
  const seats = Number(body.seats);
  const luggageCapacity = Number(body.luggageCapacity);
  const vehicleYearValue = String(body.vehicleYear || "").trim();
  const vehicleColor = String(body.vehicleColor || "").trim();

  if (!chauffeurId || !vehicleType || !brand || !model || !licensePlate) {
    return NextResponse.json(
      { message: "Please fill in all required fields." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(seats) || seats < 1) {
    return NextResponse.json(
      { message: "Seats must be at least 1." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(luggageCapacity) || luggageCapacity < 0) {
    return NextResponse.json(
      { message: "Luggage capacity cannot be negative." },
      { status: 400 }
    );
  }

  const vehicleYear = vehicleYearValue ? Number(vehicleYearValue) : null;

  if (vehicleYear !== null && (!Number.isInteger(vehicleYear) || vehicleYear < 1980 || vehicleYear > 2100) ) {
    return NextResponse.json(
      { message: "Vehicle year must be between 1980 and 2100." },
      { status: 400 }
    );
  }

  const { data: allowedVehicleTypes } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "vehicle_type" });
  const vehicleTypeOptions = (allowedVehicleTypes ?? []) as string[];

  if (!vehicleTypeOptions.includes(vehicleType)) {
        return NextResponse.json(
        { message: "Invalid vehicle type." },
        { status: 400 }
        );
  }

  const { error } = await supabaseAdmin
    .from("vehicles")
    .update({
        chauffeur_id: chauffeurId,
        brand,
        model,
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        seats,
        luggage_capacity: luggageCapacity,
        vehicle_year: vehicleYear,
        vehicle_color: vehicleColor || null,
    })
    .eq("id", vehicleId);

    if (error) {console.error("Could not update vehicle:", error);

    if (error.code === "23505") {
      return NextResponse.json(
        { message: "A vehicle with this license plate already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json( { message: "Could not update vehicle." }, { status: 500 } ); }
    return NextResponse.json({ message: "Vehicle updated successfully."  });
}