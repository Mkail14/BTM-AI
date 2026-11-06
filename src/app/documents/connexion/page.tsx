import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { readDriveAccount } from "@/lib/drive/client";
import { saveDriveConnection } from "@/lib/drive/connection";
import { exchangeDriveCode, readDriveState } from "@/lib/drive/oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

/**
 * Le Google du Drive devient aussi une façon de se connecter : « Continuer avec
 * Google » mène ensuite à ce même compte. Il faut « Allow manual linking » dans
 * Supabase (Authentication > Sign In / Providers). Le Drive marche même si ça échoue.
 */
async function linkGoogle(supabase: SupabaseClient, idToken: string): Promise<"ok" | "pris"> {
  try {
    const { error } = await supabase.auth.linkIdentity({ provider: "google", token: idToken });
    if (!error) return "ok";
    // Ce Google est déjà le compte Tamilya d'une autre personne : on ne le lui prend pas.
    if (error.code === "identity_already_exists") return "pris";
    console.warn("[documents] Liaison Google refusée :", error.code ?? error.status);
  } catch (error) {
    console.warn("[documents] Liaison Google impossible", error instanceof Error ? error.message : "inconnue");
  }
  return "ok";
}

async function connect(supabase: SupabaseClient, userId: string, code: string, redirectUri: string): Promise<"ok" | "pris" | "refus" | "echec"> {
  const admin = getSupabaseAdminClient();
  if (!admin) return "echec";
  try {
    const tokens = await exchangeDriveCode(code, redirectUri);
    if (!tokens) return "refus";
    const account = await readDriveAccount(tokens.accessToken).catch(() => null);
    await saveDriveConnection(admin, userId, tokens.refreshToken, account?.email ?? null);
    return tokens.idToken ? await linkGoogle(supabase, tokens.idToken) : "ok";
  } catch (error) {
    console.error("[documents] Connexion impossible", error instanceof Error ? error.message : "inconnue");
    return "echec";
  }
}

/**
 * Retour de Google. Une page et pas une route d'API : sans session (depuis
 * l'application, Google s'ouvre dans le navigateur), la connexion au compte est
 * demandée ici, puis on revient avec le même code.
 */
export default async function DriveConnectionPage({ searchParams }: PageProps<"/documents/connexion">) {
  const params = await searchParams;
  const code = text(params.code);
  const stateParam = text(params.state);
  const query = code && stateParam ? `?${new URLSearchParams({ code, state: stateParam })}` : "";
  const { supabase, user } = await requireUser(`/documents/connexion${query}`);

  if (!code) redirect("/documents?drive=refus");
  const state = readDriveState(stateParam, user.id);
  if (!state) redirect("/documents?drive=autre-compte");
  redirect(`/documents?drive=${await connect(supabase, user.id, code, state.redirectUri)}`);
}
