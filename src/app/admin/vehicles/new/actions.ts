
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* ============================================================
   ADMIN VEHICLE CREATION ACTION

   Verifies Admin authorization, validates registration data,
   inserts a vehicle and checks automatic default assignment.
   Invalid submissions return to the Add Vehicle page.
============================================================ */
export async function addVehicle(formData: FormData) {
    /* Protect this Server Action independently of the Admin layout. */
    await requireAdminUser();

    /* Read and normalize the submitted vehicle information. */
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const brand = String(formData.get("brand") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const licensePlate = String(formData.get("licensePlate") || "").trim().toUpperCase();
    const vehicleType = String(formData.get("vehicleType") || "");
    const vehicleYearValue = String(formData.get("vehicleYear") || "");
    const vehicleYear = vehicleYearValue ? Number(vehicleYearValue) : null;
    const vehicleColor = String(formData.get("vehicleColor") || "").trim();
    const seats = Number(formData.get("seats") || 4);
    const luggageCapacity = Number(formData.get("luggageCapacity") || 2);
    const infantSeatCount = Number(formData.get("infantSeatCount") || 0);
    const childSeatCount = Number(formData.get("childSeatCount") || 0);
    const boosterSeatCount = Number(formData.get("boosterSeatCount") || 0);
    const isofixAvailable = formData.get("isofixAvailable") === "on";
    const wheelchairAccess = String(formData.get("wheelchairAccess") || "none");
    const wheelchairCapacity = Number(formData.get("wheelchairCapacity") || 0);
    const mobilityAidStorage = formData.get("mobilityAidStorage") === "on";
    const extraLargeLuggage = formData.get("extraLargeLuggage") === "on";

    /* Preserve entered values when registration validation fails. */
    const previousFormValues = new URLSearchParams({
        chauffeurId, brand, model, licensePlate, vehicleType,
        vehicleYear: vehicleYearValue, vehicleColor, seats: String(seats),
        luggageCapacity: String(luggageCapacity),
        infantSeatCount: String(infantSeatCount), childSeatCount: String(childSeatCount),
        boosterSeatCount: String(boosterSeatCount), isofixAvailable: String(isofixAvailable),
        wheelchairAccess, wheelchairCapacity: String(wheelchairCapacity),
        mobilityAidStorage: String(mobilityAidStorage), extraLargeLuggage: String(extraLargeLuggage),
    });
    const errorRedirect = (errorCode: string) => `/admin/vehicles/new?error=${errorCode}&${previousFormValues.toString()}`;

    /* Validate required fields and nonnegative equipment capacities. */
    if (!chauffeurId || !brand || !model || !licensePlate || !vehicleType) { redirect(errorRedirect("missing-fields")); }

    const capabilityCounts = [infantSeatCount, childSeatCount, boosterSeatCount, wheelchairCapacity];
    if (capabilityCounts.some((countValue) => !Number.isInteger(countValue) || countValue < 0)) {
        redirect(errorRedirect("invalid-capabilities"));
    }

    /* Validate vehicle passenger capacity, luggage and manufacturing year. */
    if (!Number.isInteger(seats) || seats < 1 ||
        !Number.isInteger(luggageCapacity) || luggageCapacity < 0) {
        redirect(errorRedirect("invalid-vehicle-capacity"));
    }

    if (vehicleYear !== null && (!Number.isInteger(vehicleYear) || vehicleYear < 1980 || vehicleYear > 2100)) {
        redirect(errorRedirect("invalid-vehicle-year"));
    }

    /* Wheelchair settings must match the vehicle's supported access type. */
    const allowedWheelchairAccessTypes = ["none", "foldable_only", "ramp", "lift"];
    if (!allowedWheelchairAccessTypes.includes(wheelchairAccess)) { redirect(errorRedirect("invalid-wheelchair-settings")); }

    const wheelchairSettingsInvalid =
        ((wheelchairAccess === "none" || wheelchairAccess === "foldable_only") && wheelchairCapacity !== 0) ||
        ((wheelchairAccess === "ramp" || wheelchairAccess === "lift") && wheelchairCapacity < 1);
    if (wheelchairSettingsInvalid) { redirect(errorRedirect("invalid-wheelchair-settings")); }

    
    /* ============================================================
    VERIFY CHAUFFEUR ASSIGNMENT
    Only an existing, approved chauffeur may receive a new
    vehicle through the Admin registration form.
    ============================================================ */
    const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id")
        .eq("id", chauffeurId)
        .eq("account_status", "approved")
        .maybeSingle();

    if (chauffeurError) {
        console.error("Could not validate chauffeur:", chauffeurError);
        redirect(errorRedirect("chauffeur-validation-failed"));
    }
    if (!chauffeur) { redirect(errorRedirect("invalid-chauffeur")); }

    /* ============================================================
    VERIFY VEHICLE TYPE
    Checks the submitted value against the vehicle_type enum
    instead of trusting the browser's dropdown selection.
    ============================================================ */
    const { data: vehicleTypes, error: vehicleTypesError } = await supabaseAdmin
        .rpc("get_enum_values", { p_enum_type_name: "vehicle_type" });

    if (vehicleTypesError) {
        console.error("Could not validate vehicle type:", vehicleTypesError);
        redirect(errorRedirect("vehicle-type-validation-failed"));
    }

    const allowedVehicleTypes = (vehicleTypes ?? []) as string[];
    if (!allowedVehicleTypes.includes(vehicleType)) {
        redirect(errorRedirect("invalid-vehicle-type"));
    }

    /* Insert the validated vehicle using the privileged server-side client. */
    const { error } = await supabaseAdmin.from("vehicles").insert({
        chauffeur_id: chauffeurId, brand, model, license_plate: licensePlate,
        vehicle_type: vehicleType, vehicle_year: vehicleYear, vehicle_color: vehicleColor || null,
        seats, luggage_capacity: luggageCapacity, infant_seat_count: infantSeatCount,
        child_seat_count: childSeatCount, booster_seat_count: boosterSeatCount,
        isofix_available: isofixAvailable, wheelchair_access: wheelchairAccess,
        wheelchair_capacity: wheelchairCapacity, mobility_aid_storage: mobilityAidStorage,
        extra_large_luggage: extraLargeLuggage,
    });

    if (error) {
        console.error("Could not add vehicle:", error);
        if (error.code === "23505") { redirect(errorRedirect("duplicate-license-plate")); }
        redirect(errorRedirect("add-vehicle-failed"));
    }

    /* Assign the default automatically when this is the chauffeur's only eligible vehicle. */
    const { error: defaultVehicleCheckError } = await supabaseAdmin.rpc("ensure_single_vehicle_default", { p_chauffeur_id: chauffeurId });

    if (defaultVehicleCheckError) {
        console.error("Vehicle added but default-vehicle check failed:", defaultVehicleCheckError);
        revalidatePath("/admin/vehicles");
        redirect(`/admin/vehicles?success=vehicle-added&error=default-vehicle-check-failed&chauffeurId=${encodeURIComponent(chauffeurId)}`);
    }

    /* Refresh the list and return to Admin Vehicles after successful creation. */
    revalidatePath("/admin/vehicles");
    redirect("/admin/vehicles?success=vehicle-added");
}
