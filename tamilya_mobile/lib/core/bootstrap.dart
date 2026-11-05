import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../features/auth/data/supabase_auth_repository.dart';
import '../features/auth/presentation/auth_providers.dart';
import '../features/chat/data/api_chat_repository.dart';
import '../features/chat/data/supabase_messages_reader.dart';
import '../features/chat/presentation/chat_controller.dart';
import '../features/conversations/data/supabase_conversations_repository.dart';
import '../features/conversations/presentation/conversations_providers.dart';
import '../features/settings/data/api_account_repository.dart';
import '../features/settings/presentation/settings_providers.dart';
import 'config/env.dart';
import 'network/api_client.dart';
import 'supabase/secure_local_storage.dart';

/// Résultat du démarrage : soit des surcharges de providers (dépôts réels),
/// soit une erreur de configuration à afficher, soit rien (mode maquette :
/// aucune configuration fournie, dépôts factices).
class Bootstrap {
  const Bootstrap({this.overrides = const [], this.configError});

  final List<Override> overrides;
  final String? configError;
}

/// Lit la configuration, initialise Supabase (session persistée en stockage
/// sécurisé sur iOS/Android) et fournit les dépôts réels. ARCHITECTURE §5, §8.
Future<Bootstrap> bootstrap() async {
  final anyConfigured =
      Env.apiBaseUrl.isNotEmpty ||
      Env.supabaseUrl.isNotEmpty ||
      Env.supabasePublishableKey.isNotEmpty;
  if (!anyConfigured) return const Bootstrap();

  final error = Env.validate();
  if (error != null) return Bootstrap(configError: error);

  if (!kIsWeb) await purgeSecureStorageOnFreshInstall();

  await Supabase.initialize(
    url: Env.supabaseUrl,
    publishableKey: Env.supabasePublishableKey,
    authOptions: FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
      // Web : stockage par défaut du navigateur (accepté en développement).
      // iOS/Android : Keychain / Keystore, jamais SharedPreferences.
      localStorage: kIsWeb ? null : SecureLocalStorage(),
      pkceAsyncStorage: kIsWeb ? null : SecureGotrueAsyncStorage(),
    ),
  );

  final auth = SupabaseAuthRepository(Supabase.instance.client);
  final dio = createApiDio(baseUrl: Env.apiBaseUrl, tokens: auth);
  return Bootstrap(
    overrides: [
      authRepositoryProvider.overrideWithValue(auth),
      accountRepositoryProvider.overrideWithValue(ApiAccountRepository(dio)),
      chatRepositoryProvider.overrideWithValue(
        ApiChatRepository(
          dio: dio,
          readMessages: supabaseMessagesReader(Supabase.instance.client),
        ),
      ),
      conversationsRepositoryProvider.overrideWithValue(
        SupabaseConversationsRepository.client(Supabase.instance.client),
      ),
    ],
  );
}
