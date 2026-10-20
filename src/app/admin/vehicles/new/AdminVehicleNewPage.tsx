
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { formStyles, pageStyles } from "@/styles/classNames";
import AdminVehicleCreateForm from "@/components/AdminVehicleCreateForm";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* ============================================================
   NEW VEHICLE PAGE PARAMETERS
   Receives validation errors and previously entered values
   from the vehicle creation Server Action.
============================================================ */
type AdminVehicleNewPageProps = {
    searchParams: Promise<{
        error?: string;
        chauffeurId?: string;
        vehicleType?: string;
        brand?: string;
        model?: string;
        licensePlate?: string;
        seats?: string;
        luggageCapacity?: string;
        vehicleYear?: string;
        vehicleColor?: string;
        infantSeatCount?: string;
        childSeatCount?: string;
        boosterSeatCount?: string;
        isofixAvailable?: string;
        wheelchairAccess?: string;
        wheelchairCapacity?: string;
        mobilityAidStorage?: string;
        extraLargeLuggage?: string;
    }>;
};

/* ============================================================
   ADMIN NEW VEHICLE PAGE

   Provides a dedicated page for registering a chauffeur vehicle.
   Verifies Admin authorization before displaying the page.

   The registration form and database action will be added next.
============================================================ */
/* Verifies Admin authorization and reads restored form values. */
export default async function AdminVehicleNewPage({searchParams}: AdminVehicleNewPageProps) {
    await requireAdminUser();
    const pageMessage = await searchParams;

    /* Loads approved chauffeurs for assigning the new vehicle. */
    const { data: chauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email")
        .eq("account_status", "approved")
        .order("name", { ascending: true });

    /* Loads vehicle types from the existing PostgreSQL enum. */
    const { data: vehicleTypes, error: vehicleTypesError } = await supabaseAdmin
        .rpc("get_enum_values", { p_enum_type_name: "vehicle_type" });

    if (chauffeursError) { console.error("Could not load chauffeurs:", chauffeursError); }
    if (vehicleTypesError) { console.error("Could not load vehicle types:", vehicleTypesError); }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href="/admin/vehicles" className={formStyles.link}>
                    {"\u2190"} Back to admin vehicles
                </Link>

                <p className={pageStyles.pageLabelUpper}>Admin</p>

                <h1 className={pageStyles.pageTitle}>Add vehicle</h1>

                <p className={pageStyles.pageDescription}>
                    Register a new vehicle and assign it to a chauffeur.
                </p>

                {/* ===== VEHICLE REGISTRATION ERROR MESSAGES ===== */}
                {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}>Please fill in all required vehicle fields.</p>)}
                {pageMessage.error === "duplicate-license-plate" && (<p className={pageStyles.errorMsgPage}>A vehicle with this license plate already exists.</p>)}
                {pageMessage.error === "invalid-capabilities" && (<p className={pageStyles.errorMsgPage}>Child-seat and wheelchair capacities must be zero or higher.</p>)}
                {pageMessage.error === "invalid-vehicle-capacity" && (<p className={pageStyles.errorMsgPage}>Seats must be at least 1 and luggage capacity cannot be negative.</p>)}
                {pageMessage.error === "invalid-vehicle-year" && (<p className={pageStyles.errorMsgPage}>Vehicle year must be between 1980 and 2100.</p>)}
                {pageMessage.error === "invalid-wheelchair-settings" && (<p className={pageStyles.errorMsgPage}>Ramp or lift access requires wheelchair capacity of at least 1. Other access types require capacity 0.</p>)}
                {pageMessage.error === "invalid-chauffeur" && (<p className={pageStyles.errorMsgPage}>Please select an approved chauffeur.</p>)}
                {pageMessage.error === "chauffeur-validation-failed" && (<p className={pageStyles.errorMsgPage}>Could not validate the selected chauffeur. Please try again.</p>)}
                {pageMessage.error === "invalid-vehicle-type" && (<p className={pageStyles.errorMsgPage}>Please select a valid vehicle type.</p>)}
                {pageMessage.error === "vehicle-type-validation-failed" && (<p className={pageStyles.errorMsgPage}>Could not validate the vehicle type. Please try again.</p>)}
                {pageMessage.error === "add-vehicle-failed" && (<p className={pageStyles.errorMsgPage}>Could not register the vehicle. Please try again.</p>)}
                {/* Displays the three-section vehicle registration form. */}

                {/* Pass dropdown options and previously entered values to the registration form. */}
                <AdminVehicleCreateForm
                    chauffeurs={chauffeurs ?? []}
                    vehicleTypeOptions={(vehicleTypes ?? []) as string[]}
                    formValues={pageMessage}
                />
            </div>
        </main>
    );
}
