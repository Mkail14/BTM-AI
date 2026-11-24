import { redirect } from "next/navigation";

/** L'ancien Profil de l'entreprise est devenu la rubrique Administration de Mon compte (le RIB a été retiré). */
export default function OldCompanyProfilePage() {
  redirect("/parametres?rubrique=administration");
}
