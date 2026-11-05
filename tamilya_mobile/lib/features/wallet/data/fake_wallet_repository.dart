import '../domain/wallet.dart';

/// Données factices (mode maquette sans configuration, et tests).
class FakeWalletRepository implements WalletRepository {
  FakeWalletRepository([this.snapshot]);

  final WalletSnapshot? snapshot;

  @override
  Future<WalletSnapshot> load() async =>
      snapshot ?? const WalletSnapshot(balanceCents: 0);
}
