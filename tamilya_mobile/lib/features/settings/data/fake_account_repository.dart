import '../domain/account_repository.dart';
import '../domain/profile.dart';

class FakeAccountRepository implements AccountRepository {
  const FakeAccountRepository();

  @override
  Future<Profile> profile() async =>
      const Profile(displayName: 'Toi', email: 'toi@exemple.invalid');
}
