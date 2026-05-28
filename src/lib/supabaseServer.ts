import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable");
}

if (!supabaseSecretKey) {
  throw new Error("Missing SUPABASE_SECRET_KEY environment variable");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);