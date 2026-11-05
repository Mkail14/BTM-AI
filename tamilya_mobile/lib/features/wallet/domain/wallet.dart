import '../../../core/errors/app_failure.dart';

/// Règles du portefeuille, reprises de `src/lib/wallet/limits.ts:1-8`
/// (montants en centimes). Le serveur reste seul juge ; l'app ne s'en sert
/// que pour l'affichage (jauge, bouton désactivé au plafond).
abstract final class WalletLimits {
  static const int minTopup = 500;
  static const int maxTopup = 15000;
  static const int maxBalance = 15000;
}

/// 1250 -> « 12,50 € » ; 1000 -> « 10 € » (`formatEuros`, limits.ts:21-25).
String formatEuros(int cents) {
  final negative = cents < 0;
  final abs = cents.abs();
  final whole = abs ~/ 100;
  final rest = abs % 100;
  final digits = whole.toString();
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(' ');
    grouped.write(digits[i]);
  }
  final decimals = rest == 0 ? '' : ',${rest.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}$grouped$decimals €';
}

enum WalletTxKind { topup, payment, refund }

enum WalletTxStatus { pending, succeeded, failed }

/// Une opération (`WalletTransaction`, limits.ts:10-18).
class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.kind,
    required this.amountCents,
    required this.status,
    required this.label,
    required this.method,
    required this.createdAt,
  });

  final String id;
  final WalletTxKind kind;
  final int amountCents;
  final WalletTxStatus status;
  final String label;
  final String? method;
  final DateTime createdAt;

  bool get isSpending => kind == WalletTxKind.payment;
}

/// Solde + historique. [historyFailure] est posé quand le solde a été lu mais
/// pas l'historique (le reste de l'écran reste utilisable).
class WalletSnapshot {
  const WalletSnapshot({
    required this.balanceCents,
    this.demo = false,
    this.transactions = const [],
    this.historyFailure,
  });

  final int balanceCents;

  /// Solde fictif de la démonstration (`demo: true` de `GET /api/wallet`).
  final bool demo;
  final List<WalletTransaction> transactions;
  final AppFailure? historyFailure;

  int get roomCents => (WalletLimits.maxBalance - balanceCents).clamp(
    0,
    WalletLimits.maxBalance,
  );
  bool get atCeiling => roomCents < WalletLimits.minTopup;
}

abstract interface class WalletRepository {
  Future<WalletSnapshot> load();
}

// Dates en heure de Mayotte (UTC+3, sans changement d'heure).

DateTime mayotteTime(DateTime t) => t.toUtc().add(const Duration(hours: 3));

String dayKey(DateTime t) {
  final m = mayotteTime(t);
  return '${m.year}-${m.month.toString().padLeft(2, '0')}-'
      '${m.day.toString().padLeft(2, '0')}';
}

String monthKey(DateTime t) => dayKey(t).substring(0, 7);

const _weekdays = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];
const _months = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/// « Aujourd'hui », « Hier » ou « Lundi 10 novembre » (WalletView.tsx:36-43).
String dayTitle(DateTime t, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final key = dayKey(t);
  if (key == dayKey(current)) return "Aujourd'hui";
  if (key == dayKey(current.subtract(const Duration(days: 1)))) return 'Hier';
  final m = mayotteTime(t);
  return '${_weekdays[m.weekday - 1]} ${m.day} ${_months[m.month - 1]}';
}

String clockTime(DateTime t) {
  final m = mayotteTime(t);
  return '${m.hour.toString().padLeft(2, '0')}:'
      '${m.minute.toString().padLeft(2, '0')}';
}
