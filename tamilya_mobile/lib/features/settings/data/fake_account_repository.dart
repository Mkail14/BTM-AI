import '../domain/account_repository.dart';
import '../domain/profile.dart';

/// Données factices (mode maquette sans configuration, et tests).
class FakeAccountRepository implements AccountRepository {
  FakeAccountRepository();

  Profile _profile = const Profile(
    displayName: 'Toi',
    email: 'toi@exemple.invalid',
    personality: 'professionnelle',
  );

  static const List<PersonalityCard> cards = [
    PersonalityCard(
      id: 'mechante',
      label: 'Méchante',
      emoji: '😈',
      description: 'Elle te taquine sans pitié.',
      sample: 'Tu as encore oublié ?',
    ),
    PersonalityCard(
      id: 'professionnelle',
      label: 'Normale',
      emoji: '🙂',
      description: 'Claire et posée.',
      sample: 'Bien sûr, voici la réponse.',
    ),
    PersonalityCard(
      id: 'cool',
      label: "À l'aise",
      emoji: '😎',
      description: 'Détendue et complice.',
      sample: 'Easy, on voit ça ensemble.',
    ),
  ];

  @override
  Future<AccountData> load() async => AccountData(
    profile: _profile,
    personalities: cards,
    defaultPersonality: 'professionnelle',
  );

  @override
  Future<Profile> updateDisplayName(String name) async => _profile = Profile(
    displayName: name,
    email: _profile.email,
    personality: _profile.personality,
  );

  @override
  Future<Profile> updatePersonality(String personalityId) async =>
      _profile = Profile(
        displayName: _profile.displayName,
        email: _profile.email,
        personality: personalityId,
      );
}
