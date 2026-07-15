import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Defines the chauffeur ID received from the API URL.
type RouteContext = { params: Promise<{ chauffeurId: string }> };

// Stores the bucket rules used by this upload route.
const bucketName = "chauffeur-profile-photos";
const maximumFileSize = 2 * 1024 * 1024;
const allowedFileTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Uploads a validated public chauffeur profile photo.
export async function POST(request: Request, { params }: RouteContext) {
    // Reads the route ID and logged-in Supabase user.
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    // Blocks visitors who are not logged in.
    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    // Confirms that this chauffeur owns the requested profile.
    const { data: profile, error: profileError } = await authSupabase.from("user_profiles").select("role, chauffeur_id").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    // Reads the uploaded image from multipart form data.
    const formData = await request.formData();
    const uploadedFile = formData.get("photo");

    // Validates that an actual file was submitted.
    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) { return NextResponse.json({ message: "Please select an image." }, { status: 400 }); }

    // Validates the configured MIME types and two-megabyte limit.
    const fileExtension = allowedFileTypes[uploadedFile.type];
    if (!fileExtension) { return NextResponse.json({ message: "Only JPEG, PNG and WebP images are allowed." }, { status: 400 }); }
    if (uploadedFile.size > maximumFileSize) { return NextResponse.json({ message: "The image may not exceed 2 MB." }, { status: 400 }); }

    // Loads the previous path so it can be removed after successful replacement.
    const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin.from("chauffeurs").select("profile_photo_path").eq("id", chauffeurId).maybeSingle();
    if (chauffeurError || !chauffeurRow) { return NextResponse.json({ message: "Chauffeur could not be found." }, { status: 404 }); }

    // Creates a unique path to prevent an old browser-cached image from remaining visible.
    const newPhotoPath = `chauffeurs/${chauffeurId}/profile-${Date.now()}.${fileExtension}`;
    const fileBuffer = await uploadedFile.arrayBuffer();

    // Uploads the validated image to the public profile-photo bucket.
    const { error: uploadError } = await supabaseAdmin.storage.from(bucketName).upload(newPhotoPath, fileBuffer, { contentType: uploadedFile.type, cacheControl: "3600", upsert: false });
    if (uploadError) { console.error("Could not upload chauffeur photo:", uploadError); return NextResponse.json({ message: "Could not upload the profile photo." }, { status: 500 }); }

    // Saves the new Storage path in the chauffeur record.
    const { data: updatedChauffeur, error: updateError } = await supabaseAdmin.from("chauffeurs").update({ profile_photo_path: newPhotoPath }).eq("id", chauffeurId).select("id").maybeSingle();

    // Removes the newly uploaded file when the database update fails.
    if (updateError || !updatedChauffeur) {
        console.error("Could not save chauffeur photo path:", updateError);
        await supabaseAdmin.storage.from(bucketName).remove([newPhotoPath]);
        return NextResponse.json({ message: "Could not save the profile photo." }, { status: 500 });
    }

    // Removes the previous image only after the new image and database path are saved.
    if (chauffeurRow.profile_photo_path && chauffeurRow.profile_photo_path !== newPhotoPath) {
        const { error: removeError } = await supabaseAdmin.storage.from(bucketName).remove([chauffeurRow.profile_photo_path]);
        if (removeError) { console.error("Could not remove previous chauffeur photo:", removeError); }
    }

    // Creates the public URL used later for preview and public chauffeur cards.
    const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(newPhotoPath);

    // Returns the saved path and its public URL.
    return NextResponse.json({ message: "Profile photo uploaded successfully.", profilePhotoPath: newPhotoPath, profilePhotoUrl: publicUrlData.publicUrl }, { status: 201 });
}

// Removes the logged-in chauffeur's current profile photo.
export async function DELETE(request: Request, { params }: RouteContext) {
    // Reads the chauffeur ID and logged-in user.
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    // Blocks visitors who are not logged in.
    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    // Confirms that the chauffeur owns this profile.
    const { data: profile, error: profileError } = await authSupabase.from("user_profiles").select("role, chauffeur_id").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    // Loads the current Storage path.
    const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin.from("chauffeurs").select("profile_photo_path").eq("id", chauffeurId).maybeSingle();
    if (chauffeurError || !chauffeurRow) { return NextResponse.json({ message: "Chauffeur could not be found." }, { status: 404 }); }

    // Returns successfully when no photo exists.
    if (!chauffeurRow.profile_photo_path) { return NextResponse.json({ message: "No profile photo exists." }); }

    // Removes the database reference first so the deleted photo is no longer displayed.
    const { data: updatedChauffeur, error: updateError } = await supabaseAdmin.from("chauffeurs").update({ profile_photo_path: null }).eq("id", chauffeurId).select("id").maybeSingle();
    if (updateError || !updatedChauffeur) { console.error("Could not clear profile photo path:", updateError); return NextResponse.json({ message: "Could not remove the profile photo." }, { status: 500 }); }

    // Removes the unreferenced image from Storage.
    const { error: removeError } = await supabaseAdmin.storage.from(bucketName).remove([chauffeurRow.profile_photo_path]);
    if (removeError) { console.error("Could not remove profile photo from Storage:", removeError); }

    // Confirms removal even if Storage cleanup only produced a logged warning.
    return NextResponse.json({ message: "Profile photo removed successfully." });
}