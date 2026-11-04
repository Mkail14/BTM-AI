import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/tokens.dart';

/// Écran de lancement (spec C2b §10) : fond encre, le « b » BTM en crème à
/// 14 % se remplit de rose de bas en haut, lueur rose qui respire, aucun
/// texte. Appelle [onDone] ensuite ; la logique de session arrive avec C3.
class SplashScreen extends StatefulWidget {
  const SplashScreen({
    super.key,
    required this.onDone,
    this.duration = const Duration(milliseconds: 1400),
  });

  final VoidCallback onDone;
  final Duration duration;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _fill = AnimationController(
    vsync: this,
    duration: widget.duration * 0.75,
  );
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );
  Timer? _timer;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _fill.value = 1;
    } else {
      _fill.forward();
      _breath.repeat(reverse: true);
    }
    _timer = Timer(widget.duration, widget.onDone);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _fill.dispose();
    _breath.dispose();
    super.dispose();
  }

  static const double _w = 70;
  static const double _h = 84;

  Widget _b(Color color) => ColorFiltered(
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    child: Image.asset(
      'assets/brand/btm-b.png',
      width: _w,
      height: _h,
      errorBuilder: (_, _, _) => const SizedBox(width: _w, height: _h),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BrandColors.ink,
      body: Center(
        child: SizedBox(
          width: _w,
          height: _h,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _breath,
                builder: (context, _) => Positioned(
                  left: -_w * 0.6,
                  right: -_w * 0.6,
                  top: -_h * 0.6,
                  bottom: -_h * 0.6,
                  child: Transform.scale(
                    scale: 1 + 0.15 * _breath.value,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            TamilyaPalette.persona.withValues(
                              alpha: 0.22 * (1 - 0.45 * _breath.value),
                            ),
                            const Color(0x00C8295F),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Semantics(
                label: 'Tamilya',
                child: _b(BrandColors.cream.withValues(alpha: 0.14)),
              ),
              AnimatedBuilder(
                animation: _fill,
                builder: (context, child) => ClipRect(
                  clipper: _BottomUpClipper(
                    Curves.easeOutCubic.transform(_fill.value),
                  ),
                  child: child,
                ),
                child: _b(TamilyaPalette.persona),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomUpClipper extends CustomClipper<Rect> {
  _BottomUpClipper(this.progress);

  final double progress;

  @override
  Rect getClip(Size size) => Rect.fromLTWH(
    0,
    size.height * (1 - progress),
    size.width,
    size.height * progress,
  );

  @override
  bool shouldReclip(_BottomUpClipper old) => old.progress != progress;
}
