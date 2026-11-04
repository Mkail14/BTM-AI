import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../domain/account_repository.dart';
import '../domain/profile.dart';

/// `/api/me` (GET, PATCH) via le client dio authentifié. Seul fichier de la
/// fonctionnalité qui connaît les URL et le JSON réseau.
class ApiAccountRepository implements AccountRepository {
  ApiAccountRepository(this._dio);

  final Dio _dio;

  @override
  Future<AccountData> load() async {
    try {
      final res = await _dio.get<Object?>('/api/me');
      return parseAccountData(res.data);
    } catch (e) {
      throw toFailure(e);
    }
  }

  @override
  Future<Profile> updateDisplayName(String name) =>
      _patch({'displayName': name.trim()});

  @override
  Future<Profile> updatePersonality(String personalityId) =>
      _patch({'personality': personalityId});

  Future<Profile> _patch(Map<String, Object?> body) async {
    try {
      final res = await _dio.patch<Object?>('/api/me', data: body);
      final data = res.data;
      if (data is! Map || data['profile'] is! Map) {
        throw const UnknownFailure();
      }
      return parseProfile(data['profile'] as Map);
    } catch (e) {
      throw toFailure(e);
    }
  }

  static Profile parseProfile(Map<dynamic, dynamic> json) => Profile(
    displayName: (json['displayName'] as String?) ?? '',
    email: (json['email'] as String?) ?? '',
    personality: json['personality'] as String?,
  );

  static AccountData parseAccountData(Object? data) {
    if (data is! Map || data['profile'] is! Map) {
      throw const UnknownFailure();
    }
    final cards = <PersonalityCard>[
      for (final c in (data['personalities'] as List<dynamic>? ?? const []))
        if (c is Map)
          PersonalityCard(
            id: (c['id'] as String?) ?? '',
            label: (c['label'] as String?) ?? '',
            emoji: (c['emoji'] as String?) ?? '',
            description: (c['description'] as String?) ?? '',
            sample: (c['sample'] as String?) ?? '',
          ),
    ];
    return AccountData(
      profile: parseProfile(data['profile'] as Map),
      personalities: cards,
      defaultPersonality:
          (data['defaultPersonality'] as String?) ?? 'professionnelle',
    );
  }
}
