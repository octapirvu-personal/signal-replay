import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — the single connection to the hosted Postgres + Auth that
 * backs cloud persistence. Config comes from .env.local (see supabase/SETUP.md);
 * the anon key is safe in the bundle because Row-Level Security is what actually
 * protects the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anon);

if (!isSupabaseConfigured) {
  console.warn("Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local");
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// Cache the signed-in user id so persistence writes (which must stamp user_id)
// stay synchronous-ish without a round-trip per call.
let cachedUserId: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

/** Current user id, or throw if not signed in (writes require an owner). */
export async function requireUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  if (!cachedUserId) throw new Error("Not signed in");
  return cachedUserId;
}
