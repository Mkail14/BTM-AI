import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/network/api_client.dart';
import 'package:tamilya_mobile/core/network/session_tokens.dart';
import 'package:tamilya_mobile/core/theme/app_theme.dart';
import 'package:tamilya_mobile/features/wallet/data/api_wallet_repository.dart';
import 'package:tamilya_mobile/features/wallet/data/fake_wallet_repository.dart';
import 'package:tamilya_mobile/features/wallet/domain/wallet.dart';
import 'package:tamilya_mobile/features/wallet/presentation/wallet_providers.dart';
import 'package:tamilya_mobile/features/wallet/presentation/wallet_screen.dart';

import '../../core/network/fake_adapter.dart';

class _Tokens implements SessionTokens {
  @override
  Future<String?> currentAccessToken() async => 'jeton';
  @override
  Future<bool> refresh() async => false;
  @override
  Future<void> expire() async {}
}

Dio _dio(FakeAdapter a) => createApiDio(
  baseUrl: 'http://localhost:8090',
  tokens: _Tokens(),
  adapter: a,
);

Map<String, dynamic> _row(
  String id,
  String kind,
  int cents, {
  String status = 'succeeded',
  String label = 'Recharge',
  String? method,
  String at = '2026-11-05T09:30:00Z',
}) => {
  'id': id,
  'kind': kind,
  'amount_cents': cents,
  'status': status,
  'label': label,
  'method': method,
  'created_at': at,
};

void main() {
  group('formatEuros (limits.ts)', () {
    test('entiers sans décimales, centimes avec virgule', () {
      expect(formatEuros(1000), '10 €');
      expect(formatEuros(1250), '12,50 €');
      expect(formatEuros(5), '0,05 €');
      expect(formatEuros(15000), '150 €');
    });
  });

  group('ApiWalletRepository', () {
    test('solde par GET /api/wallet (Bearer) et historique Supabase', () async {
      final adapter = FakeAdapter([
        FakeAdapter.reply(200, {'balanceCents': 4250}),
      ]);
      final repo = ApiWalletRepository(
        dio: _dio(adapter),
        readTransactions: () async => [
          _row('a', 'topup', 5000, method: 'Visa •••• 4242'),
          _row('b', 'payment', 750, label: 'Repas'),
          {'id': 'x', 'kind': 'inconnu'},
        ],
      );
      final s = await repo.load();
      expect(s.balanceCents, 4250);
      expect(s.demo, isFalse);
      expect(s.transactions.map((t) => t.id), ['a', 'b']);
      expect(s.transactions.first.method, 'Visa •••• 4242');
      expect(s.transactions[1].isSpending, isTrue);
      expect(adapter.requests.single.path, '/api/wallet');
      expect(adapter.requests.single.headers['Authorization'], 'Bearer jeton');
    });

    test('mode démo signalé', () async {
      final repo = ApiWalletRepository(
        dio: _dio(
          FakeAdapter([
            FakeAdapter.reply(200, {'balanceCents': 15000, 'demo': true}),
          ]),
        ),
        readTransactions: () async => [],
      );
      final s = await repo.load();
      expect(s.demo, isTrue);
      expect(s.atCeiling, isTrue);
    });

    test('historique illisible : solde gardé, erreur typée', () async {
      final repo = ApiWalletRepository(
        dio: _dio(
          FakeAdapter([
            FakeAdapter.reply(200, {'balanceCents': 100}),
          ]),
        ),
        readTransactions: () async => throw const NetworkFailure(),
      );
      final s = await repo.load();
      expect(s.balanceCents, 100);
      expect(s.transactions, isEmpty);
      expect(s.historyFailure, isA<NetworkFailure>());
    });

    test('503 du serveur : erreur typée, pas de solde inventé', () async {
      final repo = ApiWalletRepository(
        dio: _dio(
          FakeAdapter([
            FakeAdapter.reply(503, {'error': 'Portefeuille indisponible.'}),
          ]),
        ),
        readTransactions: () async => [],
      );
      await expectLater(repo.load(), throwsA(isA<AppFailure>()));
    });

    test('corps sans solde : erreur inconnue', () async {
      final repo = ApiWalletRepository(
        dio: _dio(FakeAdapter([FakeAdapter.reply(200, {})])),
        readTransactions: () async => [],
      );
      await expectLater(repo.load(), throwsA(isA<UnknownFailure>()));
    });
  });

  group('WalletScreen', () {
    Future<void> open(
      WidgetTester tester,
      WalletRepository repo, {
      List<Uri>? opened,
      bool launchOk = true,
    }) async {
      tester.view.physicalSize = const Size(390, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            walletRepositoryProvider.overrideWithValue(repo),
            walletPageUrlProvider.overrideWithValue(
              Uri.parse('https://exemple.invalid/portefeuille'),
            ),
            externalUrlOpenerProvider.overrideWithValue((uri) async {
              opened?.add(uri);
              return launchOk;
            }),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: WalletScreen(onPayWithTamilya: () {}),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    final now = DateTime.now().toUtc().toIso8601String();

    testWidgets('solde, plafond et historique', (tester) async {
      await open(
        tester,
        FakeWalletRepository(
          WalletSnapshot(
            balanceCents: 4250,
            transactions: [
              WalletTransaction(
                id: '1',
                kind: WalletTxKind.topup,
                amountCents: 5000,
                status: WalletTxStatus.succeeded,
                label: 'Recharge de 50 €',
                method: 'Visa',
                createdAt: DateTime.parse(now),
              ),
              WalletTransaction(
                id: '2',
                kind: WalletTxKind.payment,
                amountCents: 750,
                status: WalletTxStatus.pending,
                label: 'Repas',
                method: null,
                createdAt: DateTime.parse(now),
              ),
            ],
          ),
        ),
      );
      expect(find.text('Solde disponible'), findsOneWidget);
      expect(find.textContaining('Encore 107,50'), findsOneWidget);
      expect(find.text('Recharge de 50 €'), findsOneWidget);
      expect(find.text("AUJOURD'HUI"), findsOneWidget);
      expect(find.text('En attente'), findsOneWidget);

      await tester.tap(find.text('Dépenses'));
      await tester.pump();
      expect(find.text('Recharge de 50 €'), findsNothing);
      expect(find.text('Repas'), findsOneWidget);
    });

    testWidgets('état vide', (tester) async {
      await open(tester, FakeWalletRepository());
      expect(find.text("Aucune opération pour l'instant"), findsOneWidget);
      await tester.tap(find.text('Recharges'));
      await tester.pump();
      expect(find.text('Rien dans cette catégorie'), findsOneWidget);
    });

    testWidgets('Recharger ouvre la page du site, sans paiement', (
      tester,
    ) async {
      final opened = <Uri>[];
      await open(
        tester,
        FakeWalletRepository(const WalletSnapshot(balanceCents: 1000)),
        opened: opened,
      );
      await tester.tap(find.text('Recharger mon portefeuille'));
      await tester.pump();
      expect(opened.single.path, '/portefeuille');
    });

    testWidgets('échec d\'ouverture : message, pas de plantage', (
      tester,
    ) async {
      await open(
        tester,
        FakeWalletRepository(const WalletSnapshot(balanceCents: 1000)),
        launchOk: false,
      );
      await tester.tap(find.text('Recharger mon portefeuille'));
      await tester.pump();
      expect(find.text("Impossible d'ouvrir la page du site."), findsOneWidget);
    });

    testWidgets('au plafond : recharge désactivée', (tester) async {
      final opened = <Uri>[];
      await open(
        tester,
        FakeWalletRepository(const WalletSnapshot(balanceCents: 15000)),
        opened: opened,
      );
      expect(find.text('Ton solde est au plafond.'), findsOneWidget);
      await tester.tap(find.text('Recharger mon portefeuille'));
      await tester.pump();
      expect(opened, isEmpty);
    });

    testWidgets('erreur du solde : message et Réessayer', (tester) async {
      var calls = 0;
      await open(tester, _Flaky(() => calls++));
      expect(find.text('Vérifie ta connexion internet.'), findsOneWidget);
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.text('Solde disponible'), findsOneWidget);
    });

    testWidgets('historique en erreur : solde visible, Réessayer', (
      tester,
    ) async {
      await open(
        tester,
        FakeWalletRepository(
          const WalletSnapshot(
            balanceCents: 500,
            historyFailure: NetworkFailure(),
          ),
        ),
      );
      expect(find.text('Solde disponible'), findsOneWidget);
      expect(find.text('Vérifie ta connexion internet.'), findsOneWidget);
    });
  });
}

class _Flaky implements WalletRepository {
  _Flaky(this.onCall);
  final void Function() onCall;
  int n = 0;

  @override
  Future<WalletSnapshot> load() async {
    onCall();
    if (n++ == 0) throw const NetworkFailure();
    return const WalletSnapshot(balanceCents: 100);
  }
}
