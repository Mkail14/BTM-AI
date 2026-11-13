import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGateOpen, openAdminGate } from "@/lib/admin/gate";
import { getAuthContext } from "@/lib/auth/session";
import { hasAdminRole, hasPrincipalAdminRole } from "@/lib/auth/roles";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export const NOT_ADMIN: ActionResult = { ok: false, message: "Accès réservé aux administrateurs." };

/**
 * Rôle à jour, relu auprès de Supabase Auth (et non dans le jeton, valable
 * jusqu'à une heure) : un administrateur délégué retiré perd ses droits tout de
 * suite, même si sa session n'a pas pu être fermée. Un aller-retour réseau de
 * plus, seulement pour les actions d'administration.
 */
async function freshRoles(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const claims = { app_metadata: data.user.app_metadata };
  return { isAdmin: hasAdminRole(claims), isPrincipalAdmin: hasPrincipalAdminRole(claims) };
}

/**
 * Rôle seul, sans le verrou de l'espace admin : corrections du maître dans le
 * chat, et la page du code elle-même (src/app/admin/verrou).
 */
export async function requireAdminRoleAction() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.isAdmin) return null;
  if (!(await freshRoles(supabase))?.isAdmin) return null;
  return { supabase, user };
}

/**
 * Actions de l'espace admin : session relue, rôle revérifié à jour (RLS aussi),
 * et code d'authentification tapé depuis moins de 15 minutes d'inactivité.
 * Vérifié ici et pas seulement par le proxy : une action peut être appelée
 * depuis n'importe quelle adresse. Chaque action prolonge le verrou.
 */
export async function requireAdminAction() {
  const auth = await requireAdminRoleAction();
  if (!auth || !(await adminGateOpen(auth.user.id))) return null;
  await openAdminGate(auth.user.id);
  return auth;
}

export const NOT_PRINCIPAL: ActionResult = { ok: false, message: "Réservé à l'administrateur principal." };

/** Profil de l'entreprise (RIB, délégation, maintenance, mode démo) : administrateur principal seulement. */
export async function requirePrincipalAdminAction() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.isPrincipalAdmin) return null;
  if (!(await freshRoles(supabase))?.isPrincipalAdmin) return null;
  if (!(await adminGateOpen(user.id))) return null;
  await openAdminGate(user.id);
  return { supabase, user };
}
