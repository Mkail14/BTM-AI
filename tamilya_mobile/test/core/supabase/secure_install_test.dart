import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tamilya_mobile/core/supabase/secure_local_storage.dart';

class _Storage extends FlutterSecureStorage {
  _Storage() : super();
  int deletes = 0;

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => deletes++;
}

void main() {
  test('premier lancement : coffre effacé une seule fois', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storage = _Storage();
    expect(
      await purgeSecureStorageOnFreshInstall(storage: storage, prefs: prefs),
      isTrue,
    );
    expect(
      await purgeSecureStorageOnFreshInstall(storage: storage, prefs: prefs),
      isFalse,
    );
    expect(storage.deletes, 1);
  });
}
