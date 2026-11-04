import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_account_repository.dart';
import '../domain/account_repository.dart';
import '../domain/profile.dart';

final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => const FakeAccountRepository(),
);

final profileProvider = FutureProvider<Profile>(
  (ref) => ref.watch(accountRepositoryProvider).profile(),
);
