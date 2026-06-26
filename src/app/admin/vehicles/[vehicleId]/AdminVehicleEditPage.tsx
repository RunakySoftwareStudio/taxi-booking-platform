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
        .select("id, chauffeur_id, brand, model, license_plate, vehicle_type, seats, luggage_capacity, vehicle_year, vehicle_color" )
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

  return (
    <main className={pageStyles.main}>
        <div className={pageStyles.containerMedium}>
            <div className="flex flex-wrap items-center gap-4">
                <Link href="/admin/vehicles" className={formStyles.link}> ← Back to admin vehicles </Link>
            </div>
            <p className={pageStyles.pageLabelUpper}>Admin</p>
            <h1 className={pageStyles.pageTitle}>Edit vehicle details</h1>
            <p className={pageStyles.pageDescription}> Update vehicle information and assigned chauffeur. </p>
            <AdminVehicleEditForm vehicle={vehicleRow}  chauffeurs={chauffeurs ?? []}  vehicleTypeOptions={(vehicleTypes ?? []) as string[]}  />
        </div>
    </main>
  );
}