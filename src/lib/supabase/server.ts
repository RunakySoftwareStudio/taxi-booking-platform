/*
    PURPOSE: CREATE A SESSION-AWARE SUPABASE SERVER CLIENT

    This client:
    - reads Supabase authentication cookies from the current request;
    - uses the public anonymous key, not the service-role key;
    - allows server code to call auth.getUser() for the current session;
    - follows normal Supabase authentication and Row Level Security rules;
    - does not bypass RLS like supabaseAdmin;
    - can therefore verify the user before supabaseAdmin performs a protected write.
*/

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // This can happen inside Server Components.
            // We will add middleware later to refresh sessions correctly.
          }
        },
      },
    }
  );
}