import "server-only";
import { GOOGLE_CLIENT_ID } from "@/lib/auth/google-identity";
import { signJson, verifyJson } from "@/lib/security/signed-cookie";

/**
 * Lien avec le Google Drive de la personne. drive.file : Tamilya ne voit que les
 * fichiers qu'elle a créés, jamais le reste du Drive.
 *
 * Connexion à part de la connexion au compte : un compte créé par e-mail peut
 * relier n'importe quel Google, et il faut ici un jeton durable que la connexion
 * habituelle ne donne pas.
 */

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/**
 * openid email en plus du Drive : Google rend aussi un jeton d'identité, qui relie
 * ce compte Google au compte Tamilya (« Continuer avec Google » mène au même compte).
 */
export const DRIVE_SCOPES = `openid email ${DRIVE_SCOPE}`;
const STATE_PURPOSE = "drive-oauth";
const STATE_LIFETIME_MS = 10 * 60 * 1000;

const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() || null;

export const driveConfigured = () => clientSecret() !== null;

/** Doit figurer dans « URI de redirection autorisés » du client Google, pour chaque adresse du site. */
export const driveRedirectUri = (origin: string) => `${origin}/documents/connexion`;

type DriveState = { user: string; redirectUri: string; expires: number };

/**
 * loginHint : l'adresse que Google propose en premier s'il la connaît.
 * sameAccount : c'est le Google de connexion au site ; Google va droit à « Autoriser », sans écran de choix du compte.
 */
export function buildDriveAuthUrl(userId: string, origin: string, now = Date.now(), key?: string, loginHint?: string | null, sameAccount = false): string | null {
  const redirectUri = driveRedirectUri(origin);
  const state = signJson(STATE_PURPOSE, { user: userId, redirectUri, expires: now + STATE_LIFETIME_MS } satisfies DriveState, key);
  if (!state) return null;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES,
    access_type: "offline",
    // Sans consentement redemandé, Google ne redonne pas de jeton durable à une reconnexion.
    prompt: sameAccount ? "consent" : "select_account consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Retour de Google. Le compte Tamilya connecté doit être celui qui a lancé la
 * demande : sinon, un lien envoyé à une autre personne relierait son Drive au
 * compte de l'expéditeur.
 */
export function readDriveState(raw: string | undefined, userId: string, now = Date.now(), key?: string): DriveState | null {
  const state = verifyJson<DriveState>(STATE_PURPOSE, raw, key);
  if (!state || state.user !== userId || !(state.expires > now)) return null;
  return state;
}

export class DriveAccessLost extends Error {}

type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const secret = clientSecret();
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET manquant");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: secret, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  return ((await response.json().catch(() => ({}))) ?? {}) as TokenResponse;
}

/** null : pas de jeton durable, ou accès au Drive décoché sur l'écran de Google. */
export async function exchangeDriveCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; idToken: string | null } | null> {
  const token = await requestToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!token.access_token || !token.refresh_token) return null;
  if (!token.scope?.split(" ").includes(DRIVE_SCOPE)) return null;
  return { accessToken: token.access_token, refreshToken: token.refresh_token, idToken: token.id_token ?? null };
}

/** Accès d'une heure. DriveAccessLost : la personne a retiré l'accès depuis son compte Google. */
export async function refreshDriveAccess(refreshToken: string): Promise<string> {
  const token = await requestToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (token.access_token) return token.access_token;
  if (token.error === "invalid_grant") throw new DriveAccessLost();
  throw new Error(`Google a refusé le jeton : ${token.error ?? "réponse illisible"}`);
}

/** Retire l'accès chez Google. Sans effet sur les fichiers, qui restent dans le Drive. */
export async function revokeDriveToken(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });
}
