import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider, type AuthUser } from "@/components/auth/AuthProvider";
import { BRAND } from "@/components/brand/brand";
import { SplashReady } from "@/components/brand/SplashReady";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { getAuthContext } from "@/lib/auth/session";
import { getProfile } from "@/lib/conversations/repository";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: `${BRAND.name}, l'assistant d'intelligence artificielle de ${BRAND.parent} pour Mayotte.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pleine surface sur iPhone (encoche, barre d'accueil : marges env(safe-area-inset-*)) ;
  // sur Android, le clavier réduit la page au lieu de masquer la zone de saisie.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131516" },
  ],
};

async function loadInitialUser(): Promise<AuthUser | null> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return null;
  let displayName: string | null = null;
  let personality: AuthUser["personality"];
  try {
    ({ displayName, personality } = await getProfile(supabase, user.id));
  } catch {
    // Profil indisponible (migrations non appliquées ?) : sans incidence sur la session.
  }
  return { id: user.id, email: user.email, displayName, isAdmin: user.isAdmin, personality };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialUser = await loadInitialUser();

  return (
    // suppressHydrationWarning : l'écran de lancement pose la classe « chargement » avant l'hydratation.
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <SplashScreen />
        <SplashReady />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2"
        >
          Aller au contenu
        </a>
        <AuthProvider initialUser={initialUser} authAvailable={isSupabaseConfigured}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
