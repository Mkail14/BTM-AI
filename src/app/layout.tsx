import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider, type AuthUser } from "@/components/auth/AuthProvider";
import { BRAND } from "@/components/brand/brand";
import { SplashReady } from "@/components/brand/SplashReady";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { HelpBubble } from "@/components/help/HelpBubble";
import { EnvBadge } from "@/components/layout/EnvBadge";
import { PageScrollbar } from "@/components/layout/PageScrollbar";
import { DialogHost } from "@/components/ui/ConfirmDialog";
import { PayPinHost } from "@/components/ui/PayPinHost";
import { PressHaptics } from "@/components/ui/PressHaptics";
import { SongStage } from "@/components/chat/SongStage";
import { StoryStage } from "@/components/chat/StoryStage";
import { ThemeScript } from "@/components/ui/ThemeScript";
import { getAuthContext } from "@/server/middlewares/session";
import { getProfile } from "@/server/models/profiles.model";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { userFeatures } from "@/server/services/site/features";
import "./globals.css";

/** Durée pendant laquelle un compte est « nouveau » (page /bienvenue proposée). */
const NEW_ACCOUNT_MS = 3 * 24 * 60 * 60 * 1000;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Police du code seulement : pas préchargée, elle ne retarde pas l'affichage de la page.
  preload: false,
});

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: `${BRAND.name}, le site de ${BRAND.parent} où l'on parle avec Tamilya, l'assistante IA qui apprend le shimaoré.`,
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
  let createdAt: string | null = null;
  try {
    ({ displayName, personality, createdAt } = await getProfile(supabase, user.id));
  } catch {
    // Profil indisponible (migrations non appliquées ?) : sans incidence sur la session.
  }
  const features = await userFeatures(user);
  // Compte de moins de 3 jours : la page /bienvenue lui est proposée une fois.
  const newAccount = createdAt !== null && Date.now() - Date.parse(createdAt) < NEW_ACCOUNT_MS;
  return { id: user.id, email: user.email, displayName, isAdmin: user.isAdmin, personality, features, newAccount };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialUser = await loadInitialUser();

  return (
    // suppressHydrationWarning : l'écran de lancement (classe « chargement »), le thème (data-theme) et l'application (data-app) sont posés avant l'hydratation.
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <ThemeScript />
        <SplashScreen />
        <SplashReady />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:top-[calc(0.5rem+env(safe-area-inset-top))] focus:left-2 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2"
        >
          Aller au contenu
        </a>
        <AuthProvider initialUser={initialUser} authAvailable={isSupabaseConfigured}>
          {children}
          {/* Rond d'aide déplaçable : questions fréquentes, assistant d'aide, e-mail à l'équipe. */}
          <HelpBubble />
        </AuthProvider>
        <PressHaptics />
        <DialogHost />
        <PayPinHost />
        {/* Grand globe de Tamilya quand elle raconte une histoire (lecture en 3D), hors de la conversation. */}
        <StoryStage />
        <SongStage />
        <PageScrollbar />
        <EnvBadge isAdmin={initialUser?.isAdmin ?? false} />
      </body>
    </html>
  );
}
