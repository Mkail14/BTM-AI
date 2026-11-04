"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PersonalityId } from "@/lib/ai/personalities";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthDialog, type AuthDialogOptions } from "./AuthDialog";

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  /** Affichage seulement (lien d'administration) : le serveur revérifie le rôle. */
  isAdmin?: boolean;
  /** null : pas encore choisie (fenêtre de choix) ; undefined : inconnue. */
  personality?: PersonalityId | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  /** false si Supabase n'est pas configuré : les comptes sont indisponibles. */
  authAvailable: boolean;
  openAuthDialog: (options?: AuthDialogOptions) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Après une vraie connexion : le serveur reconnaît (ou non) ce navigateur et
 * prévient par e-mail d’une connexion depuis un nouvel appareil. Une fois par
 * onglet et par compte suffit.
 */
function checkDevice(userId: string) {
  const key = `btm-appareil-verifie:${userId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Stockage indisponible (navigation privée stricte) : on vérifie quand même.
  }
  void fetch("/api/auth/device", { method: "POST" }).catch(() => {});
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  return value;
}

export function AuthProvider({
  initialUser,
  authAvailable,
  children,
}: {
  initialUser: AuthUser | null;
  authAvailable: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [dialog, setDialog] = useState<AuthDialogOptions | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Retour d'un lien de confirmation (voir /auth/callback) : on informe
  // l'utilisateur, puis on retire le paramètre de l'adresse.
  useEffect(() => {
    const url = new URL(window.location.href);
    const welcome = url.searchParams.get("bienvenue") === "1";
    const confirmedElsewhere = url.searchParams.get("compte") === "confirme";
    if (!welcome && !confirmedElsewhere) return;

    url.searchParams.delete("bienvenue");
    url.searchParams.delete("compte");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    /* eslint-disable react-hooks/set-state-in-effect -- lecture de l'URL après le rendu serveur */
    if (welcome) {
      setNotice("Votre compte est activé. Bienvenue sur BTM AI !");
    } else {
      setDialog({
        mode: "signin",
        reason: "Votre adresse e-mail est confirmée. Connectez-vous pour terminer.",
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Le serveur reste la référence : on se resynchronise quand il renvoie un autre utilisateur.
  const serverKey = initialUser
    ? `${initialUser.id}:${initialUser.displayName ?? ""}:${initialUser.isAdmin ? "admin" : ""}:${String(initialUser.personality)}`
    : "";
  const [prevServerKey, setPrevServerKey] = useState(serverKey);
  if (prevServerKey !== serverKey) {
    setPrevServerKey(serverKey);
    setUser(initialUser);
  }

  // Synchronisation avec les changements de session (autre onglet, expiration…).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        router.refresh();
      } else if (event === "SIGNED_IN" && session?.user) {
        const sessionUser = session.user;
        checkDevice(sessionUser.id);
        setUser((current) => {
          if (current?.id === sessionUser.id) return current;
          router.refresh();
          // Compte Google : pas de display_name, mais le prénom donné par Google.
          const name = sessionUser.user_metadata?.display_name ?? sessionUser.user_metadata?.given_name;
          return {
            id: sessionUser.id,
            email: sessionUser.email ?? null,
            displayName: typeof name === "string" ? name : null,
          };
        });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  const openAuthDialog = useCallback((options: AuthDialogOptions = {}) => {
    setDialog(options);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setUser(null);
    router.push("/");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, authAvailable, openAuthDialog, signOut }),
    [user, authAvailable, openAuthDialog, signOut],
  );

  return (
    <AuthContext value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        {notice ? (
          <p
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3 text-sm shadow-lg"
          >
            <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-fg" aria-hidden="true">
              ✓
            </span>
            {notice}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-1 text-fg-muted hover:text-fg"
              aria-label="Fermer le message"
            >
              ✕
            </button>
          </p>
        ) : null}
      </div>
      <AuthDialog
        options={dialog}
        authAvailable={authAvailable}
        onClose={() => setDialog(null)}
        onSignedIn={(signedInUser, next) => {
          setUser(signedInUser);
          setDialog(null);
          if (next) router.push(next);
          router.refresh();
        }}
      />
    </AuthContext>
  );
}
