import Link from "next/link";
import { notFound } from "next/navigation";
import AdminVehicleEditForm from "@/components/AdminVehicleEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";

export const dynamic = "force-dynamic";

type AdminVehicleEditPageProps = { params: Promise<{ vehicleId: string;}>;};

export default async function AdminVehicleEditPage({params}: AdminVehicleEditPageProps) {
    const { vehicleId } = await params;
    const { data: vehicleRow, error } = await supabaseAdmin
        .from("vehicles")
        .select(`id, chauffeur_id, brand, model, license_plate, vehicle_type, seats, luggage_capacity, vehicle_year, vehicle_color,
                    infant_seat_count, child_seat_count, booster_seat_count, isofix_available,  wheelchair_access,
                    wheelchair_capacity, mobility_aid_storage, extra_large_luggage,
                    vehicle_status, status_reason, status_changed_at`)
        .eq("id", vehicleId)
        .single();

    if (error || !vehicleRow) { notFound(); }

    const { data: chauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, account_status,accepts_pets")
        .order("name", { ascending: true });
    if (chauffeursError) { console.error("Could not load chauffeurs:", chauffeursError); }

    const { data: vehicleTypes, error: vehicleTypesError } = await supabaseAdmin.rpc("get_enum_values", {p_enum_type_name: "vehicle_type"});
    if (vehicleTypesError) { console.error("Could not load vehicle types:", vehicleTypesError); }

    const { data: wheelchairAccessTypes, error: wheelchairAccessTypesError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "wheelchair_access_type", });
    if (wheelchairAccessTypesError) {console.error("Could not load wheelchair access types:", wheelchairAccessTypesError); }

    const { data: vehicleStatuses, error: vehicleStatusesError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "vehicle_operational_status", });
    if (vehicleStatusesError) { console.error("Could not load vehicle statuses:", vehicleStatusesError); }

  return (
    <main className={pageStyles.main}>
        <div className={pageStyles.containerMedium}>
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin/vehicles" className={formStyles.link}> â† Back to admin vehicles </Link>
            </div>
            <p className={pageStyles.pageLabelUpper}>Admin</p>
            <h1 className={pageStyles.pageTitle}>Edit vehicle details</h1>
            <p className={pageStyles.pageDescription}> Update vehicle information and assigned chauffeur. </p>
            <AdminVehicleEditForm
                vehicle={vehicleRow}  chauffeurs={chauffeurs ?? []}
                vehicleTypeOptions = {(vehicleTypes ?? []) as string[]}
                wheelchairAccessOptions={(wheelchairAccessTypes ?? []) as string[]}
                vehicleStatusOptions={(vehicleStatuses ?? []) as string[]}/>
        </div>
    </main>
  );
}