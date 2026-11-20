import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Proches à prévenir quand la personne écrit « SOS » dans Tamilya Connect. */
export const MAX_SOS_CONTACTS = 4;

const emailSchema = z.email("Une adresse e-mail n'est pas valide.").max(254);

/** Liste envoyée par les paramètres : champs vides ignorés, doublons retirés. */
export const sosContactsSchema = z
  .array(z.string().max(254))
  .max(MAX_SOS_CONTACTS)
  .transform((list) => [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))])
  .pipe(z.array(emailSchema).max(MAX_SOS_CONTACTS, `${MAX_SOS_CONTACTS} proches au plus.`));

/** Lu par le serveur seulement (clé secrète : aucune règle RLS ouverte). */
export async function listSosContacts(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin.from("sos_contacts").select("email, position").eq("user_id", userId).order("position");
  if (error) throw error;
  return (data ?? []).map((row) => String(row.email));
}

/** Remplace toute la liste. */
export async function saveSosContacts(admin: SupabaseClient, userId: string, emails: string[]) {
  const { error: removed } = await admin.from("sos_contacts").delete().eq("user_id", userId);
  if (removed) throw removed;
  if (!emails.length) return;
  const { error } = await admin.from("sos_contacts").insert(emails.map((email, i) => ({ user_id: userId, position: i + 1, email })));
  if (error) throw error;
}
