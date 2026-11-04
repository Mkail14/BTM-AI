/// Règles de l'inscription, reprises du web : `src/lib/auth/signup.ts` et
/// `src/lib/address-fields.ts` / `address.ts` (arbitrage A5 : commune et
/// adresse obligatoires).
library;

const int kMinPasswordLength = 8;
const int kMaxDisplayNameLength = 60;

/// Les 17 communes de Mayotte (`MAYOTTE_COMMUNES`).
const List<String> kMayotteCommunes = [
  'Acoua',
  'Bandraboua',
  'Bandrélé',
  'Bouéni',
  'Chiconi',
  'Chirongui',
  'Dembéni',
  'Dzaoudzi',
  'Kani-Kéli',
  'Koungou',
  'Mamoudzou',
  'Mtsamboro',
  "M'Tsangamouji",
  'Ouangani',
  'Pamandzi',
  'Sada',
  'Tsingoni',
];

String normalizeEmail(String email) => email.trim().toLowerCase();

String normalizeDisplayName(String name) {
  final clean = name.replaceAll(RegExp(r'\s+'), ' ').trim();
  return clean.length > kMaxDisplayNameLength
      ? clean.substring(0, kMaxDisplayNameLength)
      : clean;
}

String normalizeAddressLine(String line) =>
    line.replaceAll(RegExp(r'\s+'), ' ').trim();

class PasswordCheck {
  const PasswordCheck(this.id, this.label, this.ok);

  final String id;
  final String label;
  final bool ok;
}

/// Critères du mot de passe (`passwordChecks`).
List<PasswordCheck> passwordChecks(String password, [String email = '']) {
  final at = email.split('@').first.trim().toLowerCase();
  return [
    PasswordCheck(
      'length',
      '$kMinPasswordLength caractères minimum',
      password.length >= kMinPasswordLength,
    ),
    PasswordCheck(
      'letter',
      'Au moins une lettre',
      RegExp(r'\p{L}', unicode: true).hasMatch(password),
    ),
    PasswordCheck(
      'digit',
      'Au moins un chiffre',
      RegExp(r'\d').hasMatch(password),
    ),
    PasswordCheck(
      'email',
      'Différent de ton adresse e-mail',
      password.isNotEmpty &&
          !(at.length >= 3 && password.toLowerCase().contains(at)),
    ),
  ];
}

bool isPasswordValid(String password, [String email = '']) =>
    passwordChecks(password, email).every((c) => c.ok);

/// Erreurs de la commune et de l'adresse écrite (`addressFieldErrors`).
({String? commune, String? line}) addressFieldErrors({
  required String? commune,
  required String line,
}) {
  final cleaned = normalizeAddressLine(line);
  String? lineError;
  if (cleaned.length < 5) {
    lineError =
        'Indique ton adresse : rue, quartier, repère (près de la mosquée…).';
  } else if (cleaned.length > 200) {
    lineError = 'Adresse trop longue (200 caractères maximum).';
  }
  return (
    commune: (commune != null && kMayotteCommunes.contains(commune))
        ? null
        : 'Choisis ta commune.',
    line: lineError,
  );
}

/// Contrôle simple d'une adresse e-mail (le serveur reste juge).
bool looksLikeEmail(String email) =>
    RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.trim());
