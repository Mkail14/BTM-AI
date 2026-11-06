import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/app_theme.dart';

/// Mode Tamilya Connect : allumé ou éteint, gardé d'une ouverture à l'autre.
class TamilyaConnectController extends Notifier<bool> {
  static const _key = 'tamilya_connect';

  @override
  bool build() {
    SharedPreferences.getInstance().then((prefs) {
      final saved = prefs.getBool(_key) ?? false;
      if (saved != state) state = saved;
    });
    return false;
  }

  void toggle() {
    state = !state;
    final on = state;
    SharedPreferences.getInstance().then((prefs) => prefs.setBool(_key, on));
  }
}

final tamilyaConnectProvider = NotifierProvider<TamilyaConnectController, bool>(
  TamilyaConnectController.new,
);

/// Une fois en bas de la conversation, tirer encore vers le haut allume (ou
/// éteint) Tamilya Connect. Une petite jauge suit le doigt ; vibration à
/// mi-course puis à l'activation. La zone de saisie n'est pas couverte.
class PullUpConnect extends ConsumerStatefulWidget {
  const PullUpConnect({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PullUpConnect> createState() => _PullUpConnectState();
}

class _PullUpConnectState extends ConsumerState<PullUpConnect> {
  /// Distance à tirer (dp) une fois en bas.
  static const double _distance = 140;

  bool _atBottom = true;
  double? _startY;
  double _progress = 0;
  bool _halfway = false;
  bool _done = false;

  bool _onScroll(ScrollNotification n) {
    final m = n.metrics;
    if (m.axis != Axis.vertical) return false;
    // Liste inversée (conversation) : le bas est au début du défilement.
    final reversed = m.axisDirection == AxisDirection.up;
    _atBottom = reversed
        ? m.pixels <= m.minScrollExtent + 1
        : m.pixels >= m.maxScrollExtent - 1;
    return false;
  }

  void _down(PointerDownEvent e) {
    _startY = e.position.dy;
    _halfway = false;
    _done = false;
  }

  void _move(PointerMoveEvent e) {
    final start = _startY;
    if (start == null || _done) return;
    // Tant que la conversation défile encore, le geste repart d'ici.
    if (!_atBottom) {
      _startY = e.position.dy;
      if (_progress != 0) setState(() => _progress = 0);
      return;
    }
    final next = ((start - e.position.dy) / _distance).clamp(0.0, 1.0);
    if (next != _progress) setState(() => _progress = next);
    if (next >= 0.5 && !_halfway) {
      _halfway = true;
      HapticFeedback.selectionClick();
    }
    if (next >= 1) {
      _done = true;
      ref.read(tamilyaConnectProvider.notifier).toggle();
      HapticFeedback.mediumImpact();
      final on = ref.read(tamilyaConnectProvider);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              on
                  ? '✨ Mode Tamilya Connect : tu es connecté avec Tamilya Connect.'
                  : 'Tamilya Connect est éteint.',
            ),
          ),
        );
    }
  }

  void _up(PointerEvent _) {
    _startY = null;
    if (_progress != 0) setState(() => _progress = 0);
  }

  @override
  Widget build(BuildContext context) {
    final on = ref.watch(tamilyaConnectProvider);
    final p = context.palette;
    final label = _progress >= 1
        ? (on ? 'Tamilya Connect activé' : 'Tamilya Connect éteint')
        : (on ? 'Tire pour éteindre' : 'Tire pour Tamilya Connect');
    return Listener(
      onPointerDown: _down,
      onPointerMove: _move,
      onPointerUp: _up,
      onPointerCancel: _up,
      child: NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: Stack(
          children: [
            Positioned.fill(child: widget.child),
            if (_progress > 0)
              Positioned(
                left: 0,
                right: 0,
                bottom: 12,
                child: IgnorePointer(
                  child: Center(
                    child: Container(
                      width: 190,
                      padding: const EdgeInsets.fromLTRB(12, 7, 12, 8),
                      decoration: BoxDecoration(
                        color: p.bg,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: p.border),
                        boxShadow: const [
                          BoxShadow(color: Color(0x33000000), blurRadius: 12),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            label,
                            style: TextStyle(fontSize: 12, color: p.fg),
                          ),
                          const SizedBox(height: 5),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              value: _progress,
                              minHeight: 4,
                              backgroundColor: p.border,
                              color: const Color(0xFF52525B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
