/// Messages d'erreur d'authentification, repris de `describeAuthError`
/// (`src/components/auth/AuthDialog.tsx:44-68`).
String describeAuthError(String? code) {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou mot de passe incorrect.';
    case 'email_not_confirmed':
      return "Ton adresse e-mail n'est pas encore confirmée. Clique sur le lien reçu par e-mail.";
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cette adresse. Connecte-toi ou réinitialise ton mot de passe.';
    case 'weak_password':
      return 'Ce mot de passe est trop faible. Choisis-en un plus long ou plus varié.';
    case 'email_address_invalid':
      return "Cette adresse e-mail n'est pas valide.";
    case 'over_email_send_rate_limit':
      return "L'envoi d'e-mails est momentanément saturé. Réessaie un peu plus tard.";
    case 'over_request_rate_limit':
      return 'Trop de tentatives depuis cette connexion. Patiente quelques minutes avant de réessayer.';
    case 'signup_disabled':
      return 'Les inscriptions sont momentanément fermées.';
    default:
      return "La demande n'a pas abouti. Vérifie tes informations et réessaie.";
  }
}

const String kAuthNetworkMessage =
    'Connexion au service impossible. Vérifie ta connexion internet.';
