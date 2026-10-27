// Configuration publique de Supabase. L'URL et la clé « publishable » (ou anon)
// sont conçues pour être exposées au navigateur : la sécurité repose sur RLS.
// Les références littérales à process.env.NEXT_PUBLIC_* sont nécessaires pour
// que Next.js les injecte dans le bundle client.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);
