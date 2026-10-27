import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";
import { requireUser } from "@/lib/auth/session";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function UpdatePasswordPage() {
  // Accessible après connexion, ou via le lien de réinitialisation reçu par e-mail.
  await requireUser("/auth/nouveau-mot-de-passe");
  return (
    <SimplePage title="Choisir un nouveau mot de passe">
      <UpdatePasswordForm />
    </SimplePage>
  );
}
