"use server";

import {revalidatePath} from "next/cache";
import {requireAdminUser} from "@/lib/auth/requireAdminUser";
import {supabaseAdmin} from "@/lib/supabaseServer";

/* ============================================================
   ADMIN ADD CHAUFFEUR AVAILABILITY
   Verifies administrator authorization, validates submitted
   values and calls the atomic database RPC.

   The RPC creates both the availability record and its audit
   entry within one database transaction.
============================================================ */

export type AddAvailabilityResult = {
    success: boolean;
    message: string;
};

export async function adminAddAvailability(formData: FormData): Promise<AddAvailabilityResult> {
    /* Authenticate the administrator independently of page access. */
    const adminUser = await requireAdminUser();

    /* Read the submitted form values. */
    const chauffeurId = String(formData.get("chauffeurId") ?? "").trim();
    const availableDate = String(formData.get("availableDate") ?? "").trim();
    const startTime = String(formData.get("startTime") ?? "").trim();
    const endTime = String(formData.get("endTime") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    /* Validate required values before calling Supabase. */
    if (!chauffeurId || !availableDate || !startTime || !endTime || !status || !reason) {
        return {success: false, message: "Please fill in all required fields."};
    }

    /* Validate time values using a strict 24-hour format. */
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
        return {success: false, message: "Start time must be earlier than end time."};
    }

    /* Validate the date format. Database constraints provide additional protection. */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(availableDate)) {
        return {success: false, message: "Invalid availability date."};
    }

    /* Use the authenticated user ID, never an administrator ID supplied by the form. */
    const {error} = await supabaseAdmin.rpc("admin_add_chauffeur_availability", {
        p_chauffeur_id: chauffeurId,
        p_admin_user_id: adminUser.id,
        p_available_date: availableDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_status: status,
        p_notes: notes,
        p_reason: reason
    });

    /* Return an understandable message without exposing internal database details. */
    if (error) {
        console.error("Could not add Admin chauffeur availability:", error);
        if (error.code === "23P01") {
            return {success: false, message: "This period conflicts with another busy period."};
        }
        return {success: false, message: "Could not add availability. Check the values and try again."};
    }

    /* Refresh the selected chauffeur's availability after a successful insert. */
    revalidatePath(`/admin/chauffeurs/${chauffeurId}/support/availability`);

    return {success: true, message: "Availability added successfully."};
}

/* ============================================================
   ADMIN UPDATE CHAUFFEUR AVAILABILITY
   Updates a manual availability record through the protected
   PostgreSQL RPC and records old/new values atomically.
============================================================ */
export async function adminUpdateAvailability(formData: FormData): Promise<AddAvailabilityResult> {
    const adminUser = await requireAdminUser();

    /* Read values submitted by the Admin Edit form. */
    const chauffeurId = String(formData.get("chauffeurId") ?? "").trim();
    const availabilityId = String(formData.get("availabilityId") ?? "").trim();
    const availableDate = String(formData.get("availableDate") ?? "").trim();
    const startTime = String(formData.get("startTime") ?? "").trim();
    const endTime = String(formData.get("endTime") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    /* Check the required fields and valid time interval. */
    if (!chauffeurId || !availabilityId || !availableDate || !startTime || !endTime || !status || !reason) {
        return {success: false, message: "Please fill in all required fields."};
    }

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
        return {success: false, message: "Start time must be earlier than end time."};
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(availableDate)) {
        return {success: false, message: "Invalid availability date."};
    }

    /* The administrator identity comes from the verified session,
       never from a submitted form field. */
    const {error} = await supabaseAdmin.rpc("admin_update_chauffeur_availability", {
        p_chauffeur_id: chauffeurId,
        p_availability_id: availabilityId,
        p_admin_user_id: adminUser.id,
        p_available_date: availableDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_status: status,
        p_notes: notes,
        p_reason: reason
    });

    if (error) {
        console.error("Could not update Admin chauffeur availability:", error);

        if (error.code === "23P01") {
            return {success: false, message: "This period conflicts with another busy period."};
        }

        return {success: false, message: "Could not update availability. Check the values and try again."};
    }

    /* Refresh the availability overview after the update. */
    revalidatePath(`/admin/chauffeurs/${chauffeurId}/support/availability`);

    return {success: true, message: "Availability updated successfully."};
}

/* ============================================================
   ADMIN DELETE CHAUFFEUR AVAILABILITY
   Deletes only manually entered availability through a
   protected PostgreSQL RPC.

   The database preserves the deleted record and administrator
   reason in the audit history within the same transaction.
============================================================ */
export async function adminDeleteAvailability(formData: FormData): Promise<AddAvailabilityResult> {
    /* Verify the administrator and obtain their authenticated user ID. */
    const adminUser = await requireAdminUser();

    /* Read the target record and required reason from the form. */
    const chauffeurId = String(formData.get("chauffeurId") ?? "").trim();
    const availabilityId = String(formData.get("availabilityId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    /* Reject incomplete deletion requests. */
    if (!chauffeurId || !availabilityId || !reason) {
        return {success: false, message: "An availability record and deletion reason are required."};
    }

    /* Require a meaningful, reasonably sized explanation. */
    if (reason.length < 5 || reason.length > 1000) {
        return {success: false, message: "The deletion reason must contain 5 to 1000 characters."};
    }

    /* Execute the protected, atomic delete-and-audit operation. */
    const {error} = await supabaseAdmin.rpc("admin_delete_chauffeur_availability", {
        p_chauffeur_id: chauffeurId,
        p_availability_id: availabilityId,
        p_admin_user_id: adminUser.id,
        p_reason: reason
    });

    if (error) {
        console.error("Could not delete Admin chauffeur availability:", error);
        return {success: false, message: "Could not delete availability. The record may be protected or unavailable."};
    }

    /* Refresh the selected chauffeur's availability overview. */
    revalidatePath(`/admin/chauffeurs/${chauffeurId}/support/availability`);

    return {success: true, message: "Availability deleted successfully."};
}