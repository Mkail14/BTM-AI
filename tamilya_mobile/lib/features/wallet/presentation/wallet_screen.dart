import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/primary_button.dart';
import '../domain/wallet.dart';
import 'wallet_providers.dart';

enum _Filter { all, topup, spent }

/// Portefeuille (page `/portefeuille` du site, WalletView.tsx) : solde,
/// plafond, activité groupée par jour. Lecture seule : « Recharger » ouvre la
/// page du site dans le navigateur du système (aucun paiement dans l'app).
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key, required this.onPayWithTamilya});

  /// « Payer avec Tamilya » : retour à la conversation.
  final VoidCallback onPayWithTamilya;

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  _Filter _filter = _Filter.all;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Retour du navigateur après une recharge : on relit le solde.
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.invalidate(walletProvider),
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _openSite() async {
    final url = ref.read(walletPageUrlProvider);
    var ok = false;
    if (url != null) {
      try {
        ok = await ref.read(externalUrlOpenerProvider)(url);
      } on Object {
        ok = false;
      }
    }
    if (!ok && mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text("Impossible d'ouvrir la page du site.")),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final wallet = ref.watch(walletProvider);
    return Scaffold(
      backgroundColor: p.bgSubtle,
      appBar: AppBar(
        backgroundColor: p.bgSubtle,
        titleSpacing: 0,
        title: Row(
          children: [
            const BrandLogo(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text('/', style: TextStyle(color: p.border)),
            ),
            const Text('Portefeuille', style: TextStyle(fontSize: 14)),
          ],
        ),
      ),
      body: SafeArea(
        child: wallet.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(
            failure: e,
            onRetry: () => ref.invalidate(walletProvider),
          ),
          data: (data) => RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(walletProvider);
              await ref.read(walletProvider.future).catchError((_) => data);
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(Gaps.lg),
              children: [
                _BalanceCard(
                  data: data,
                  onTopup: _openSite,
                  onPay: widget.onPayWithTamilya,
                ),
                const SizedBox(height: Gaps.lg),
                _Activity(
                  data: data,
                  filter: _filter,
                  onFilter: (f) => setState(() => _filter = f),
                  onRetry: () => ref.invalidate(walletProvider),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.failure, required this.onRetry});

  final Object failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final message = switch (failure) {
      SessionExpiredFailure(:final message) => message,
      AppFailure(:final message) => message,
      _ => 'Portefeuille indisponible pour le moment.',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Gaps.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: Gaps.md),
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding = const EdgeInsets.all(24)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: p.bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: p.border),
      ),
      child: child,
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({
    required this.data,
    required this.onTopup,
    required this.onPay,
  });

  final WalletSnapshot data;
  final VoidCallback onTopup;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final text = formatEuros(data.balanceCents);
    final euroIdx = text.indexOf(' €');
    final main = text.substring(0, euroIdx);
    final comma = main.indexOf(',');
    final whole = comma < 0 ? main : main.substring(0, comma);
    final decimals = comma < 0 ? '' : main.substring(comma);
    final used = (data.balanceCents / WalletLimits.maxBalance).clamp(0.0, 1.0);
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.account_balance_wallet_outlined,
                size: 16,
                color: p.fgMuted,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Solde disponible',
                  style: theme.textTheme.bodyMedium?.copyWith(color: p.fgMuted),
                ),
              ),
              if (data.demo)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: p.warningSoft,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    'Démo',
                    style: TextStyle(
                      fontSize: 11,
                      color: p.warning,
                      fontVariations: wght(600),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Semantics(
            label: 'Solde : $text',
            excludeSemantics: true,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: whole,
                    style: TextStyle(
                      fontSize: 44,
                      height: 1,
                      letterSpacing: -1,
                      color: p.fg,
                      fontVariations: wght(600),
                    ),
                  ),
                  TextSpan(
                    text: '$decimals €',
                    style: TextStyle(
                      fontSize: 20,
                      color: p.fgMuted,
                      fontVariations: wght(600),
                    ),
                  ),
                ],
              ),
              key: const Key('wallet-balance'),
            ),
          ),
          const SizedBox(height: 24),
          Semantics(
            label: 'Solde par rapport au plafond',
            value: '${(used * 100).round()} %',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: used,
                minHeight: 6,
                backgroundColor: p.bgMuted,
                color: p.fg,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  'Encore ${formatEuros(data.roomCents)} possible',
                  style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Plafond ${formatEuros(WalletLimits.maxBalance)}',
                style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
              ),
            ],
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: 'Recharger mon portefeuille',
            icon: Icons.add_rounded,
            onPressed: data.atCeiling ? null : onTopup,
          ),
          const SizedBox(height: 8),
          PrimaryButton(
            label: 'Payer avec Tamilya',
            icon: Icons.chat_bubble_outline_rounded,
            variant: PrimaryButtonVariant.outline,
            onPressed: onPay,
          ),
          if (data.atCeiling)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Center(
                child: Text(
                  'Ton solde est au plafond.',
                  style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Center(
                child: Text(
                  'La recharge se fait sur le site, dans ton navigateur.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Activity extends StatelessWidget {
  const _Activity({
    required this.data,
    required this.filter,
    required this.onFilter,
    required this.onRetry,
  });

  final WalletSnapshot data;
  final _Filter filter;
  final ValueChanged<_Filter> onFilter;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);

    final thisMonth = monthKey(DateTime.now());
    final month = data.transactions.where(
      (t) =>
          t.status == WalletTxStatus.succeeded &&
          monthKey(t.createdAt) == thisMonth,
    );
    final added = month
        .where((t) => !t.isSpending)
        .fold<int>(0, (s, t) => s + t.amountCents);
    final spent = month
        .where((t) => t.isSpending)
        .fold<int>(0, (s, t) => s + t.amountCents);

    final shown = data.transactions.where(
      (t) => switch (filter) {
        _Filter.all => true,
        _Filter.topup => !t.isSpending,
        _Filter.spent => t.isSpending,
      },
    );
    final days = <String, List<WalletTransaction>>{};
    for (final t in shown) {
      days.putIfAbsent(dayKey(t.createdAt), () => []).add(t);
    }

    Widget body;
    if (data.historyFailure != null) {
      body = Padding(
        padding: const EdgeInsets.all(Gaps.xl),
        child: Column(
          children: [
            Text(
              data.historyFailure!.message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: p.danger),
            ),
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      );
    } else if (data.demo) {
      body = const EmptyState(
        icon: Icons.account_balance_wallet_outlined,
        title: 'Démonstration',
        message:
            "L'historique de la démonstration est visible sur le site, "
            "pas dans l'application.",
      );
    } else if (days.isEmpty) {
      body = EmptyState(
        icon: Icons.account_balance_wallet_outlined,
        title: filter == _Filter.all
            ? "Aucune opération pour l'instant"
            : 'Rien dans cette catégorie',
        message: 'Tes recharges et tes paiements apparaîtront ici.',
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final entry in days.entries) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 6),
              child: Text(
                dayTitle(entry.value.first.createdAt).toUpperCase(),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: p.fgMuted,
                  letterSpacing: 0.5,
                  fontVariations: wght(500),
                ),
              ),
            ),
            for (final t in entry.value) _TxRow(t),
          ],
        ],
      );
    }

    return _Card(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Activité', style: theme.textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  'Ce mois-ci : +${formatEuros(added)} rechargés · '
                  '−${formatEuros(spent)} dépensés',
                  style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
                ),
                const SizedBox(height: 12),
                _Segments(filter: filter, onChanged: onFilter),
              ],
            ),
          ),
          Divider(height: 1, color: p.border),
          body,
        ],
      ),
    );
  }
}

class _Segments extends StatelessWidget {
  const _Segments({required this.filter, required this.onChanged});

  final _Filter filter;
  final ValueChanged<_Filter> onChanged;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    const labels = {
      _Filter.all: 'Tout',
      _Filter.topup: 'Recharges',
      _Filter.spent: 'Dépenses',
    };
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: p.bgMuted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final f in _Filter.values)
            Expanded(
              child: Semantics(
                selected: f == filter,
                button: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(f),
                  child: Container(
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: f == filter ? p.bg : null,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(
                      labels[f]!,
                      style: TextStyle(
                        fontSize: 13,
                        color: f == filter ? p.fg : p.fgMuted,
                        fontVariations: wght(500),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TxRow extends StatelessWidget {
  const _TxRow(this.t);

  final WalletTransaction t;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final out = t.isSpending;
    final failed = t.status == WalletTxStatus.failed;
    final sub = [clockTime(t.createdAt), ?t.method].join(' · ');
    final status = switch (t.status) {
      WalletTxStatus.pending => 'En attente',
      WalletTxStatus.failed => 'Échouée',
      WalletTxStatus.succeeded => null,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: failed || out ? p.bgMuted : p.successSoft,
            ),
            child: Text(
              out ? '↗' : '↙',
              style: TextStyle(
                color: failed
                    ? p.fgMuted
                    : out
                    ? p.fg
                    : p.success,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontVariations: wght(500),
                  ),
                ),
                Text(
                  sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(color: p.fgMuted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${out ? '−' : '+'}${formatEuros(t.amountCents)}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontVariations: wght(600),
                  color: failed
                      ? p.fgMuted
                      : out
                      ? p.fg
                      : p.success,
                  decoration: failed ? TextDecoration.lineThrough : null,
                ),
              ),
              if (status != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: BoxDecoration(
                    color: t.status == WalletTxStatus.pending
                        ? p.warningSoft
                        : p.dangerSoft,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(
                      fontSize: 10,
                      color: t.status == WalletTxStatus.pending
                          ? p.warning
                          : p.danger,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
