/// Profil du compte (réponse de `GET /api/me`).
class Profile {
  const Profile({
    required this.displayName,
    required this.email,
    this.personality,
  });

  /// Vide si l'utilisateur n'a pas de nom.
  final String displayName;
  final String email;

  /// `mechante` | `professionnelle` | `cool` ; null = jamais choisie.
  final String? personality;
}

/// Fiche d'une personnalité de Tamilya (réglée par l'admin côté serveur).
class PersonalityCard {
  const PersonalityCard({
    required this.id,
    required this.label,
    required this.emoji,
    required this.description,
    required this.sample,
  });

  final String id;
  final String label;
  final String emoji;
  final String description;
  final String sample;
}

/// Tout ce que renvoie `GET /api/me`.
class AccountData {
  const AccountData({
    required this.profile,
    required this.personalities,
    required this.defaultPersonality,
  });

  final Profile profile;
  final List<PersonalityCard> personalities;
  final String defaultPersonality;

  AccountData withProfile(Profile p) => AccountData(
    profile: p,
    personalities: personalities,
    defaultPersonality: defaultPersonality,
  );
}
