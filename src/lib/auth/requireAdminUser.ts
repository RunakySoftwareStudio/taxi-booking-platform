import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/*================================================================
    PURPOSE: PROTECT ADMIN DATABASE ACTIONS

    USER QUESTION:
    What is different with now?

        const adminUser = await requireAdminUser();

    CURRENT PROTECTION
    ------------------
    src/app/admin/layout.tsx protects access to pages under /admin.

    Its process is:

        Visitor opens an admin page
                ↓
        Check whether the visitor is logged in
                ↓
        No user → redirect to /login
                ↓
        Read the user's role from user_profiles
                ↓
        Role is not admin → redirect to /unauthorized
                ↓
        Admin user → display the admin page

    This protects PAGE ACCESS.

    WHY THIS HELPER IS ALSO NEEDED
    ------------------------------
    A server action that changes financial data must perform its own
    authorization check before it uses supabaseAdmin.

    supabaseAdmin uses the Supabase service-role client. It can bypass
    normal Row Level Security rules and therefore has powerful database
    permissions.

    We should not assume that a server action can only be called through
    the normal protected admin page.

    This helper adds a second security check:

        Server action is called
                ↓
        second security check:

        Server action is called
                ↓
        requireAdminUser() checks the current user
                ↓
        No user → redirect to /login
                ↓
        Read the user's role from user_profiles
                ↓
        Role is not admin → redirect to /unauthorized
                ↓
        Return the authenticated admin user
                ↓
        Protected database write may continue

    TWO DIFFERENT PROTECTION LAYERS
    -------------------------------
    admin/layout.tsx:
        Protects viewing admin pages.

    requireAdminUser():
        Protects executing sensitive admin database actions.

    WHY RETURN adminUser?
    ---------------------
    The returned user contains:

        adminUser.id

    Financial tables contain audit fields such as:

        created_by_user_id
        activated_by_user_id
        archived_by_user_id

    Example:

        const adminUser = await requireAdminUser();

        await supabaseAdmin.from("pricing_profiles").insert({
            created_by_user_id: adminUser.id,
        });

    This records which administrator performed the financial action.

    When the user ID is not required, the action may use:

        await requireAdminUser();

    For pricing-management actions, we normally use:

        const adminUser = await requireAdminUser();

    because the administrator ID is needed for the financial audit trail.

    COMPLETE SECURITY STRUCTURE
    ---------------------------

        admin/layout.tsx
            protects the page
                    +
        requireAdminUser()
            protects the server action
                    +
        supabaseAdmin
            performs the privileged database operation
                    +
        adminUser.id
            records who performed the action
                    +
        database constraints and transactions
            protect the financial records

    requireAdminUser() does not replace admin/layout.tsx.
    Both are needed for defence in depth.
================================================================*/

/**
 * Verifies that the current request belongs to a logged-in administrator.
 *
 * Use this helper before every protected admin database write.
 *
 * @returns The authenticated Supabase user, including the user ID
 *          needed for financial audit fields.
 */
export async function requireAdminUser() {
    // Creates a session-aware Supabase client using the request cookies.
    const supabase = await createClient();

    // Reads and verifies the currently logged-in Supabase user.
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    // An authentication error means the action must not continue.
    if (userError) {
        console.error("Admin authentication error:", userError);
        redirect("/login");
    }

    // A visitor without a valid user session must log in.
    if (!user) { redirect("/login"); }

    // Reads the application role connected to the authenticated user.
    const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    // A failed role lookup prevents the protected action from continuing.
    if (profileError) {
        console.error("Admin role lookup error:", profileError);
        redirect("/unauthorized");
    }

    // Only users with the admin role may perform protected admin writes.
    if (profile?.role !== "admin") { redirect("/unauthorized"); }

    // Returns the verified administrator for audit fields such as
    // created_by_user_id, activated_by_user_id and archived_by_user_id.
    return user;
}