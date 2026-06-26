import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

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
    const acceptsPets  =  Boolean(body.acceptsPets )

    if (!name || !email || !phone || !accountStatus) {
      return NextResponse.json(
        { message: "Please fill in all required fields." },
        { status: 400 }
      );
    }

    const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", {  p_enum_type_name: "chauffeur_account_status",  });
    const statusOptions = (allowedStatuses ?? []) as string[];

    if (!statusOptions.includes(accountStatus)) { return NextResponse.json( { message: "Invalid account status." }, { status: 400 } );  }

    const { error } = await supabaseAdmin
      .from("chauffeurs")
      .update({
        name,
        email,
        phone,
        service_area: serviceArea || null,
        account_status: accountStatus,
        accepts_pets: acceptsPets, })
      .eq("id", chauffeurId);

    if (error) {
        console.error("Could not update chauffeur:", error);
        if (error.code === "23505") { return NextResponse.json( { message: "A chauffeur with this email already exists." }, { status: 409 } );  }
        return NextResponse.json( { message: "Could not update chauffeur." },{ status: 500 } );
    }
    return NextResponse.json({ message: "Chauffeur updated successfully.",  });
}