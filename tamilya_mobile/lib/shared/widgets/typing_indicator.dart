import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// « Tamilya écrit… » : trois points animés (immobiles si les animations
/// sont désactivées par le système).
class TypingIndicator extends StatefulWidget {
  const TypingIndicator({super.key});

  @override
  State<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = !MediaQuery.disableAnimationsOf(context);
    if (animate && !_started) {
      _controller.repeat();
      _started = true;
    } else if (!animate && _started) {
      _controller.stop();
      _started = false;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Semantics(
      liveRegion: true,
      label: 'Tamilya rédige une réponse',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < 3; i++)
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(right: 4),
                    decoration: BoxDecoration(
                      color: p.accent.withValues(alpha: _opacity(i)),
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'Tamilya écrit…',
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: p.fgMuted),
          ),
        ],
      ),
    );
  }

  double _opacity(int index) {
    if (!_started) return 0.7;
    final t = (_controller.value * 3 - index) % 3;
    return t < 1 ? 1.0 : 0.35;
  }
}
