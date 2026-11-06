/**
 * Bouton « Continuer avec Google » (Google Identity Services), comme sur btm.yt :
 * la fenêtre de Google s'ouvre par-dessus le site et affiche son adresse (pas
 * celle, technique, de Supabase). Google rend un jeton d'identité, échangé
 * contre une session par supabase.auth.signInWithIdToken : aucun secret Google
 * n'est nécessaire côté Supabase, seulement l'identifiant client.
 * L'identifiant n'est pas secret (il figure dans toute page qui affiche un bouton Google).
 * Dans Google Cloud, l'adresse du site doit être dans « Origines JavaScript autorisées ».
 */

/** Même client Google que btm.yt (GROUPE BTM) ; NEXT_PUBLIC_GOOGLE_CLIENT_ID pour en changer. */
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "557607296482-8jkgd9squ5e2jdg1mufnl4p5fmn7m4sv.apps.googleusercontent.com";

type GoogleId = {
  initialize: (options: Record<string, unknown>) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

let script: Promise<void> | null = null;
function loadScript(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = null;
      reject(new Error("Google ne répond pas."));
    };
    document.head.appendChild(s);
  });
  return script;
}

/** Charge le script de Google à l'avance (ouverture de la fenêtre de connexion). */
export function preloadGoogle() {
  loadScript().catch(() => {});
}

declare global {
  interface Window {
    /** Pont de l'application Android (MainActivity) ; absent dans un navigateur. */
    TamilyaGoogle?: { googleSignIn?: (request: string, hashedNonce: string) => void };
    __tamilyaGoogle?: (request: string, token: string, error: string) => void;
  }
}

/** Application Android : la connexion Google passe par le sélecteur de compte du téléphone. */
export const hasNativeGoogle = () => typeof window !== "undefined" && typeof window.TamilyaGoogle?.googleSignIn === "function";

/**
 * Demande un compte au téléphone : le panneau de Google s'ouvre par-dessus l'app,
 * on ne la quitte pas. Même contrat que le bouton web : jeton d'identité et nonce
 * en clair. « cancelled » : la personne a fermé le panneau, rien à signaler.
 */
export async function nativeGoogleSignIn(): Promise<{ token: string; nonce: string } | "cancelled"> {
  const bridge = window.TamilyaGoogle;
  if (!bridge?.googleSignIn) throw new Error("Google indisponible.");
  const nonce = crypto.randomUUID();
  const request = crypto.randomUUID();
  const hashed = await sha256(nonce);
  return new Promise((resolve, reject) => {
    const previous = window.__tamilyaGoogle;
    window.__tamilyaGoogle = (id, token, error) => {
      if (id !== request) return previous?.(id, token, error);
      window.__tamilyaGoogle = previous;
      if (token) resolve({ token, nonce });
      else if (error === "cancelled") resolve("cancelled");
      else reject(new Error(error || "Google indisponible."));
    };
    bridge.googleSignIn?.(request, hashed);
  });
}

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Dessine le bouton de Google dans `element`. `onToken(jeton, nonce)` reçoit le
 * jeton d'identité et le nonce en clair (Google n'en a reçu que l'empreinte :
 * Supabase vérifie que les deux correspondent, un jeton volé ne sert pas ailleurs).
 */
export async function renderGoogleButton(
  element: HTMLElement,
  {
    signup,
    dark,
    isStale,
    onToken,
  }: { signup: boolean; dark: boolean; isStale: () => boolean; onToken: (token: string, nonce: string) => void },
) {
  await loadScript();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google indisponible.");
  const nonce = crypto.randomUUID();
  const hashedNonce = await sha256(nonce);
  // Fenêtre fermée ou mode changé pendant le chargement : Google ne garde qu'une configuration.
  if (isStale() || !element.isConnected) return;
  id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: hashedNonce,
    callback: (response: { credential?: string }) => {
      if (response.credential) onToken(response.credential, nonce);
    },
    ux_mode: "popup",
    use_fedcm_for_button: true,
  });
  element.replaceChildren();
  id.renderButton(element, {
    type: "standard",
    theme: dark ? "filled_black" : "outline",
    size: "large",
    shape: "pill",
    text: signup ? "signup_with" : "continue_with",
    logo_alignment: "center",
    // offsetWidth : la vraie largeur, sans l'effet de l'animation d'ouverture de la fenêtre.
    width: Math.max(200, Math.min(400, element.offsetWidth)),
    locale: "fr",
  });
}

/**
 * Le bouton de Google fonctionne-t-il ? Son iframe ne prend une taille que si Google
 * accepte l'adresse du site. Sinon (localhost, adresse d'aperçu) elle reste à 0 et Google
 * laisse à la place une imitation qui ne connecte pas.
 */
export function googleButtonWorks(element: Pick<HTMLElement, "querySelector">) {
  const iframe = element.querySelector("iframe");
  return !!iframe && iframe.getBoundingClientRect().width > 0;
}

/** Prévient une fois quand le bouton de Google fonctionne ; renvoie de quoi arrêter d'attendre. */
export function watchGoogleButton(element: HTMLElement, onWorks: () => void) {
  const timer = window.setInterval(() => {
    if (!googleButtonWorks(element)) return;
    window.clearInterval(timer);
    onWorks();
  }, 150);
  return () => window.clearInterval(timer);
}
