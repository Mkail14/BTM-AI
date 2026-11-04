import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../core/theme/tokens.dart';

/// Orbe vivant de Tamilya (inspiré de `AwaBlob.tsx` du site) : goutte à
/// bords mouvants, reflet, halo, battement de cœur et arc-en-ciel qui
/// s'allume à chaque battement. Un seul `CustomPainter`, sans widgets empilés.
/// Forme fixe si les animations sont désactivées.
class AwaOrb extends StatefulWidget {
  const AwaOrb({super.key, required this.size, this.busy = false});

  final double size;

  /// Tamilya réfléchit : battement plus rapide.
  final bool busy;

  @override
  State<AwaOrb> createState() => _AwaOrbState();
}

class _AwaOrbState extends State<AwaOrb> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final ValueNotifier<double> _time = ValueNotifier<double>(0);
  bool _running = false;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((d) => _time.value = d.inMicroseconds / 1e6);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = !MediaQuery.disableAnimationsOf(context);
    if (animate && !_running) {
      _ticker.start();
      _running = true;
    } else if (!animate && _running) {
      _ticker.stop();
      _running = false;
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    // Marge pour le halo (18 % de chaque côté) et le flottement.
    return Semantics(
      label: 'Tamilya',
      child: RepaintBoundary(
        child: SizedBox(
          width: s,
          height: s,
          child: CustomPaint(
            painter: _OrbPainter(_time, widget.busy),
            isComplex: true,
          ),
        ),
      ),
    );
  }
}

class _OrbPainter extends CustomPainter {
  _OrbPainter(this.time, this.busy) : super(repaint: time);

  final ValueNotifier<double> time;
  final bool busy;

  static const Color _light = Color(0xFFFFB0CF);
  static const Color _deep = Color(0xFF6A1535);

  /// Bruit lisse déterministe à deux octaves (équivalent de `makeNoise`).
  static double _noise(double x, double seed) {
    double octave(double v) =>
        math.sin(v * 1.0 + seed) * 0.6 + math.sin(v * 2.1 + seed * 1.7) * 0.4;
    return octave(x) * 0.72 + octave(x * 2.3 + 91.7) * 0.28;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final t = time.value;
    final s = size.width;
    final c = size.center(Offset.zero);

    // Cœur : « boum-boum » toutes les ~1,15 s, extinction exponentielle.
    final period = busy ? 0.7 : 1.15;
    final phase = t % period;
    final beat = math.exp(-phase / 0.18) * (phase < 0.09 ? phase / 0.09 : 1);
    final second = phase > 0.28 ? math.exp(-(phase - 0.28) / 0.18) * 0.6 : 0.0;
    final heart = (beat + second).clamp(0.0, 1.0);

    // Flottement : 0 -> -8 dp sur 6 s.
    final float = -4 * (1 - math.cos(2 * math.pi * t / 6));
    canvas.translate(0, float * (s / 128));

    final r = s * 0.37 * (1 + 0.07 * heart);

    // Halo.
    final haloR = s * 0.5;
    canvas.drawCircle(
      c,
      haloR,
      Paint()
        ..shader = ui.Gradient.radial(
          c,
          haloR,
          [
            TamilyaPalette.persona.withValues(
              alpha: (0.5 + 0.35 * heart) * 0.55,
            ),
            TamilyaPalette.persona.withValues(alpha: 0),
          ],
          const [0.0, 1.0],
        ),
    );

    // Corps : 8 points dont le rayon suit le bruit, reliés en douceur.
    final rot = t * 0.35;
    final pts = <Offset>[];
    for (var i = 0; i < 8; i++) {
      final a = rot + i * math.pi / 4;
      final n = _noise(t * 0.6 + i * 3.1, i * 1.3);
      final rr = r * (1 + 0.14 * n);
      pts.add(c + Offset(math.cos(a), math.sin(a)) * rr);
    }
    final body = _closedSpline(pts);

    canvas.saveLayer(Offset.zero & size, Paint());
    canvas.drawPath(body, Paint()..color = TamilyaPalette.persona);
    final bounds = body.getBounds();
    canvas.drawPath(
      body,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(
            bounds.left + bounds.width * 0.32,
            bounds.top + bounds.height * 0.28,
          ),
          bounds.width * 0.55,
          [_light, _light.withValues(alpha: 0)],
        ),
    );
    canvas.drawPath(
      body,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(
            bounds.left + bounds.width * 0.70,
            bounds.top + bounds.height * 0.75,
          ),
          bounds.width * 0.6,
          [_deep, _deep.withValues(alpha: 0)],
        ),
    );
    // Arc-en-ciel conique, allumé par le battement (et un peu en continu).
    final ra = (0.5 + heart * 0.5).clamp(0.0, 1.0);
    const rainbow = [
      Color(0xFFFBBC05),
      Color(0xFF34A853),
      Color(0xFF9B72CB),
      TamilyaPalette.persona,
      TamilyaPalette.persona,
      Color(0xFF4285F4),
    ];
    const stops = [0.0, 0.2, 0.42, 0.6, 0.78, 1.0];
    // Dégradé qui tourne lentement : le rose domine, comme sur le site.
    final rotation = -2.2 + math.sin(t * 0.5) * 0.7 + t * 0.15;
    final axis = Offset(math.cos(rotation), math.sin(rotation)) * r;
    canvas.drawPath(
      body,
      Paint()
        ..shader = ui.Gradient.linear(c - axis, c + axis, [
          for (final col in rainbow) col.withValues(alpha: ra),
        ], stops),
    );
    canvas.restore();

    // Reflet en haut à gauche.
    canvas.save();
    final rc = c + Offset(-r * 0.45, -r * 0.5);
    canvas.translate(rc.dx, rc.dy);
    canvas.rotate(-30 * math.pi / 180);
    final oval = Rect.fromCenter(
      center: Offset.zero,
      width: s * 0.26,
      height: s * 0.18,
    );
    canvas.drawOval(
      oval,
      Paint()
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, s * 0.012)
        ..shader = ui.Gradient.radial(Offset.zero, oval.width / 2, const [
          Color(0xD9FFFFFF),
          Color(0x00FFFFFF),
        ]),
    );
    canvas.restore();
  }

  /// Courbe fermée passant par [p] (Catmull-Rom converti en Bézier).
  static Path _closedSpline(List<Offset> p) {
    final n = p.length;
    final path = Path()..moveTo(p[0].dx, p[0].dy);
    for (var i = 0; i < n; i++) {
      final p0 = p[(i - 1 + n) % n];
      final p1 = p[i];
      final p2 = p[(i + 1) % n];
      final p3 = p[(i + 2) % n];
      final c1 = p1 + (p2 - p0) / 6;
      final c2 = p2 - (p3 - p1) / 6;
      path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
    }
    return path..close();
  }

  @override
  bool shouldRepaint(_OrbPainter old) => old.busy != busy;
}
