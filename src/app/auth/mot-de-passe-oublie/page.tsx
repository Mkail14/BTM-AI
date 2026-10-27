import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <SimplePage title="Mot de passe oublié">
      <ForgotPasswordForm />
    </SimplePage>
  );
}
