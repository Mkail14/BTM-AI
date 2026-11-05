import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/supabase/supabase_failure.dart';
import '../domain/wallet.dart';

/// Lecture des lignes de `wallet_transactions` (injectée, sans réseau en test).
typedef WalletRowsReader = Future<List<Map<String, dynamic>>> Function();

/// Solde : `GET /api/wallet` (Bearer). Historique : lu dans Supabase sous RLS
/// (`wallet_transactions_select_own`), car le site n'a pas de route API pour
/// lui : sa page serveur appelle `loadWallet` (src/lib/wallet/index.ts:10).
/// Aucun paiement ici : la recharge se fait sur le site.
class ApiWalletRepository implements WalletRepository {
  ApiWalletRepository({required this.dio, required this.readTransactions});

  final Dio dio;
  final WalletRowsReader readTransactions;

  /// Lecteur réel. Filtre sur l'utilisateur : la politique RLS d'administrateur
  /// (`wallet_transactions_admin_read`) ferait sinon voir toutes les lignes.
  static WalletRowsReader supabaseReader(
    SupabaseClient client, {
    int limit = 50,
  }) => () async {
    final userId = client.auth.currentUser?.id;
    if (userId == null) throw const SessionExpiredFailure();
    final rows = await client
        .from('wallet_transactions')
        .select('id, kind, amount_cents, status, label, method, created_at')
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .limit(limit);
    return List<Map<String, dynamic>>.from(rows);
  };

  @override
  Future<WalletSnapshot> load() async {
    final results = await Future.wait<Object>([_balance(), _history()]);
    final balance = results[0] as ({int cents, bool demo});
    final history = results[1];
    return WalletSnapshot(
      balanceCents: balance.cents,
      demo: balance.demo,
      transactions: history is List<WalletTransaction> ? history : const [],
      historyFailure: history is AppFailure ? history : null,
    );
  }

  Future<({int cents, bool demo})> _balance() async {
    try {
      final res = await dio.get<Object?>('/api/wallet');
      final data = res.data;
      final cents = data is Map ? data['balanceCents'] : null;
      if (cents is! num) throw const UnknownFailure();
      return (cents: cents.toInt(), demo: data is Map && data['demo'] == true);
    } catch (e) {
      throw toFailure(e);
    }
  }

  /// Liste, ou l'[AppFailure] qui a empêché de la lire (l'écran garde le solde).
  Future<Object> _history() async {
    try {
      final rows = await readTransactions();
      return <WalletTransaction>[for (final r in rows) ?_parse(r)];
    } on Object catch (e) {
      return supabaseToFailure(e);
    }
  }

  static WalletTransaction? _parse(Map<String, dynamic> r) {
    final kind = switch (r['kind']) {
      'topup' => WalletTxKind.topup,
      'payment' => WalletTxKind.payment,
      'refund' => WalletTxKind.refund,
      _ => null,
    };
    final status = switch (r['status']) {
      'pending' => WalletTxStatus.pending,
      'succeeded' => WalletTxStatus.succeeded,
      'failed' => WalletTxStatus.failed,
      _ => null,
    };
    final created = DateTime.tryParse('${r['created_at']}');
    final amount = r['amount_cents'];
    if (kind == null || status == null || created == null || amount is! num) {
      return null; // Ligne illisible : ignorée plutôt que de casser l'écran.
    }
    return WalletTransaction(
      id: '${r['id']}',
      kind: kind,
      amountCents: amount.toInt(),
      status: status,
      label: (r['label'] as String?) ?? '',
      method: r['method'] as String?,
      createdAt: created,
    );
  }
}
