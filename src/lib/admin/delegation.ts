import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Délégation de l'administration. Le rôle est dans app_metadata (modifiable
 * seulement avec la clé secrète) : role « admin », et admin_level « secondary »
 * pour un administrateur délégué. Un retrait ferme aussi ses sessions, et les
 * actions d'administration relisent le rôle à jour (requireAdminAction) : il
 * n'attend pas la fin de son jeton (au plus une heure) pour perdre ses droits.
 */

export type AdminAccount = { id: string; email: string | null; secondary: boolean };

const PER_PAGE = 1000;
const MAX_PAGES = 20;

async function allUsers(): Promise<User[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const users: User[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[admin] Comptes illisibles", error.message);
      return null;
    }
    users.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }
  return users;
}

/**
 * Ferme toutes les sessions d'un compte (fonction SQL close_user_sessions).
 * Faux si la fonction manque (migration 20261126000000 pas encore appliquée) :
 * le rôle relu à chaque action d'administration suffit alors à couper ses droits.
 */
async function closeSessions(userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.rpc("close_user_sessions", { p_user_id: userId });
  if (error) {
    if (error.code !== "PGRST202") console.error("[admin] Sessions non fermées", error.message);
    return false;
  }
  return true;
}

const toAccount = (u: User): AdminAccount => ({ id: u.id, email: u.email ?? null, secondary: u.app_metadata?.admin_level === "secondary" });

export async function listAdmins(): Promise<AdminAccount[] | null> {
  const users = await allUsers();
  return users ? users.filter((u) => u.app_metadata?.role === "admin").map(toAccount) : null;
}

export type DelegationResult = { ok: true; message: string } | { ok: false; message: string };

export async function grantSecondaryAdmin(email: string): Promise<DelegationResult> {
  const users = await allUsers();
  const admin = getSupabaseAdminClient();
  if (!users || !admin) return { ok: false, message: "Comptes illisibles : réessaie." };
  const target = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!target) return { ok: false, message: "Aucun compte avec cet e-mail : la personne doit d'abord s'inscrire." };
  if (target.app_metadata?.role === "admin") {
    return { ok: false, message: target.app_metadata?.admin_level === "secondary" ? "Déjà administrateur secondaire." : "Déjà administrateur principal." };
  }
  const { error } = await admin.auth.admin.updateUserById(target.id, {
    app_metadata: { ...target.app_metadata, role: "admin", admin_level: "secondary" },
  });
  if (error) {
    console.error("[admin] Délégation impossible", error.message);
    return { ok: false, message: "La délégation a échoué : réessaie." };
  }
  return { ok: true, message: `${target.email} est administrateur secondaire (actif à sa prochaine connexion, au plus tard dans une heure).` };
}

export async function revokeSecondaryAdmin(userId: string): Promise<DelegationResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Comptes illisibles : réessaie." };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, message: "Compte introuvable." };
  // Seule une délégation se retire ici : un administrateur principal ne peut pas être rétrogradé depuis le site.
  if (data.user.app_metadata?.admin_level !== "secondary") return { ok: false, message: "Ce compte n'est pas administrateur secondaire." };
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, role: null, admin_level: null },
  });
  if (updateError) {
    console.error("[admin] Retrait de délégation impossible", updateError.message);
    return { ok: false, message: "Le retrait a échoué : réessaie." };
  }
  const closed = await closeSessions(userId);
  return {
    ok: true,
    message: closed
      ? `${data.user.email} n'est plus administrateur : ses sessions sont fermées.`
      : `${data.user.email} n'est plus administrateur (ses actions sont refusées tout de suite, ses pages au plus tard dans une heure).`,
  };
}
