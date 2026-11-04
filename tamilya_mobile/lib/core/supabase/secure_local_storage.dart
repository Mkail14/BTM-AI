import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Stockage de la session Supabase dans le Keychain (iOS) / le Keystore
/// (Android) via flutter_secure_storage (ARCHITECTURE §5). Jamais dans
/// SharedPreferences. Sur le web, l'appelant garde le stockage par défaut du
/// navigateur (accepté pour le développement : voir docs/missions/C3a-auth.md).
class SecureLocalStorage extends LocalStorage {
  SecureLocalStorage({FlutterSecureStorage? storage, String? key})
    : _storage = storage ?? _defaultStorage,
      _key = key ?? 'tamilya.supabase.session';

  static const FlutterSecureStorage _defaultStorage = FlutterSecureStorage(
    // iOS : disponible après le premier déverrouillage, sans synchro iCloud.
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  final FlutterSecureStorage _storage;
  final String _key;

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async =>
      (await _storage.read(key: _key)) != null;

  @override
  Future<String?> accessToken() => _storage.read(key: _key);

  @override
  Future<void> persistSession(String persistSessionString) =>
      _storage.write(key: _key, value: persistSessionString);

  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);
}

/// Stockage PKCE (verrou de la connexion par lien) dans le même coffre.
class SecureGotrueAsyncStorage extends GotrueAsyncStorage {
  SecureGotrueAsyncStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? SecureLocalStorage._defaultStorage;

  final FlutterSecureStorage _storage;

  @override
  Future<String?> getItem({required String key}) =>
      _storage.read(key: 'tamilya.pkce.$key');

  @override
  Future<void> setItem({required String key, required String value}) =>
      _storage.write(key: 'tamilya.pkce.$key', value: value);

  @override
  Future<void> removeItem({required String key}) =>
      _storage.delete(key: 'tamilya.pkce.$key');
}
