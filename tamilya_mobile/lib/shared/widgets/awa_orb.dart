import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../core/theme/tokens.dart';
import 'awa_orb_sim.dart';

export 'awa_orb_sim.dart' show OrbVoiceState;

/// Globe de Tamilya, fidèle à `AwaBlob.tsx` + `.awa-blob*` (globals.css:2108-2412).
///
/// Au repos : une goutte sobre (rose de la personnalité, reflet, halo). Les
/// couleurs vives (violet, bleu, vert, jaune, rouge) ne s'allument qu'à
/// chaque battement du cœur, puis s'effacent. Forme, dérive, gouttelettes
/// fusionnées par le filtre « goo » : voir `awa_orb_sim.dart` pour la boucle.
///
/// Un seul `Ticker` (pas d'animation par widget) et un seul `CustomPainter`
/// repeint à 20 ou 30 images/s comme le site. Le ticker s'arrête tout seul
/// quand la route est masquée (`TickerMode`) et n'est pas lancé si le système
/// demande de réduire les animations (pose fixe, comme le site).
class AwaOrb extends StatefulWidget {
  const AwaOrb({
    super.key,
    required this.size,
    this.busy = false,
    this.voiceState = OrbVoiceState.off,
    this.voiceLevel,
    this.color,
    this.goo = 7,
    this.float = false,
    this.random,
  });

  /// Côté du globe (le halo et la goutte débordent comme sur le site).
  final double size;

  /// Tamilya réfléchit (`busy` du site) : plus vif, battement plus rapide.
  final bool busy;

  /// État du mode vocal (cf. `VoiceOverlay.tsx`). `waiting` équivaut à `busy`.
  final OrbVoiceState voiceState;

  /// Niveau de voix 0..1 fourni par la mission voix (`voiceLevel()` du site),
  /// lu à chaque image. Sans valeur : 0.
  final ValueListenable<double>? voiceLevel;

  /// Couleur de personnalité (`--persona`). Par défaut celle du site.
  final Color? color;

  /// Flou du filtre « goo » en px pour un globe de 136 dp (AwaBlob.tsx:60) ;
  /// mis à l'échelle de [size].
  final double goo;

  /// `awa-float` (6 s, -8 px) : le site ne l'applique qu'au globe central du
  /// mode vocal (globals.css:3228).
  final bool float;

  /// Graine pour les tests.
  final math.Random? random;

  @override
  State<AwaOrb> createState() => _AwaOrbState();
}

class _AwaOrbState extends State<AwaOrb> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  late final OrbSim _sim = OrbSim(random: widget.random);
  final ValueNotifier<int> _frame = ValueNotifier<int>(0);
  bool _animate = false;
  double _now = 0;
  double _lastElapsed = 0;
  double _lastDraw = 0;

  @override
  void initState() {
    super.initState();
    _lastDraw = -1e9;
    _ticker = createTicker(_onTick);
  }

  void _onTick(Duration elapsed) {
    final e = elapsed.inMicroseconds / 1000;
    _now += e - _lastElapsed;
    _lastElapsed = e;
    if (_now - _lastDraw < _sim.minFrameMs) return;
    final dt = math.min(0.1, (_now - _lastDraw) / 1000);
    _lastDraw = _now;
    _sim.step(
      _now,
      dt,
      thinking: widget.busy || widget.voiceState == OrbVoiceState.waiting,
      state: widget.voiceState,
      voiceTarget: widget.voiceLevel?.value ?? 0,
      float: widget.float,
    );
    _frame.value++;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = !MediaQuery.disableAnimationsOf(context);
    if (animate == _animate && (_ticker.isActive == animate)) return;
    _animate = animate;
    if (animate) {
      _lastElapsed = 0;
      _lastDraw = _now - 1000;
      if (!_ticker.isActive) _ticker.start();
    } else {
      if (_ticker.isActive) _ticker.stop();
      _sim.resetToRest();
      _frame.value++;
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return Semantics(
      label: 'Tamilya',
      child: RepaintBoundary(
        child: SizedBox(
          width: s,
          height: s,
          child: CustomPaint(
            painter: OrbPainter(
              sim: _sim,
              repaint: _frame,
              color: widget.color ?? TamilyaPalette.persona,
              gooSigma: widget.goo * s / 136,
            ),
            isComplex: true,
          ),
        ),
      ),
    );
  }
}

/// Peintre du globe. Lit la simulation à chaque repeinture ; ne crée aucun
/// widget. Les commentaires donnent la règle CSS du site reproduite.
class OrbPainter extends CustomPainter {
  OrbPainter({
    required this.sim,
    required Listenable repaint,
    required this.color,
    required this.gooSigma,
  }) : super(repaint: repaint);

  final OrbSim sim;
  final Color color;
  final double gooSigma;

  /// `#9b72cb, #4285f4, #34a853, #fbbc05, #ea4335` (globals.css:2210).
  static const List<Color> _rainbowTail = [
    Color(0xFF9B72CB),
    Color(0xFF4285F4),
    Color(0xFF34A853),
    Color(0xFFFBBC05),
    Color(0xFFEA4335),
  ];

  /// Tailles des gouttelettes en % de la boîte « goo » (globals.css:2178,
  /// 2191, 2197).
  static const List<double> _dropSize = [0.26, 0.20, 0.16];

  /// Matrice du filtre goo : `0 0 0 24 -10` (AwaBlob.tsx:251). Le décalage
  /// de Flutter est en unités 0..255.
  static const ColorFilter _gooMatrix = ColorFilter.matrix(<double>[
    1, 0, 0, 0, 0, //
    0, 1, 0, 0, 0, //
    0, 0, 1, 0, 0, //
    0, 0, 0, 24, -2550,
  ]);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final blob = color;
    // --blob-light / --blob-deep (globals.css:2117-2118).
    final light = Color.lerp(const Color(0xFFFFE3EF), blob, 0.55)!;
    final deep = Color.lerp(const Color(0xFF2A0614), blob, 0.70)!;
    final c = size.center(Offset.zero);

    canvas.save();
    canvas.translate(c.dx, c.dy + sim.floatY);

    _glow(canvas, s, blob);

    // .awa-blob__beat : translate(%), rotate, scale.
    canvas.save();
    canvas.translate(sim.tx / 100 * s, sim.ty / 100 * s);
    canvas.rotate(sim.tilt * math.pi / 180);
    canvas.scale(sim.sx, sim.sy);

    _goo(canvas, s, blob, light, deep);
    _shine(canvas, s);

    canvas.restore();
    canvas.restore();
  }

  /// `.awa-blob__glow` : inset -18 %, radial-gradient(blob 55 %, transparent
  /// 65 %), opacité et échelle posées par la boucle (globals.css:2137-2144).
  void _glow(Canvas canvas, double s, Color blob) {
    // Cercle de 1,36 s ; « farthest-corner » : rayon 0,9617 s, arrêt à 65 %.
    final r = 0.9617 * s * 0.65;
    canvas.save();
    canvas.scale(sim.glowScale);
    canvas.drawCircle(
      Offset.zero,
      r,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset.zero,
          r,
          [
            blob.withValues(alpha: 0.55 * sim.glowOpacity),
            blob.withValues(alpha: 0),
          ],
          const [0.0, 1.0],
        ),
    );
    canvas.restore();
  }

  /// `.awa-blob__goo` (inset -12 %, filtre goo) contenant corps + 3 gouttes.
  void _goo(Canvas canvas, double s, Color blob, Color light, Color deep) {
    final gw = s * 1.24;
    final bounds = Rect.fromCenter(
      center: Offset.zero,
      width: gw,
      height: gw,
    ).inflate(gw * 0.1);
    canvas.saveLayer(
      bounds,
      Paint()
        ..imageFilter = ui.ImageFilter.compose(
          outer: _gooMatrix,
          inner: ui.ImageFilter.blur(
            sigmaX: gooSigma,
            sigmaY: gooSigma,
            tileMode: ui.TileMode.decal,
          ),
        ),
    );

    // .awa-blob__body : inset 20 % de la boîte goo, rayons à 8 valeurs.
    final bw = gw * 0.6;
    final rect = Rect.fromCenter(center: Offset.zero, width: bw, height: bw);
    final r = sim.radii;
    final rrect = RRect.fromRectAndCorners(
      rect,
      topLeft: Radius.elliptical(r[0] / 100 * bw, r[4] / 100 * bw),
      topRight: Radius.elliptical(r[1] / 100 * bw, r[5] / 100 * bw),
      bottomRight: Radius.elliptical(r[2] / 100 * bw, r[6] / 100 * bw),
      bottomLeft: Radius.elliptical(r[3] / 100 * bw, r[7] / 100 * bw),
    );
    canvas.save();
    canvas.rotate(sim.bodyRotation * math.pi / 180);
    // Couches CSS, de la plus basse à la plus haute : blob, deep 70 % 75 %
    // (transparent à 60 %), light 32 % 28 % (transparent à 45 %). Rayon
    // « farthest-corner » : 0,9904 w et 1,0259 w.
    canvas.drawRRect(rrect, Paint()..color = blob);
    canvas.drawRRect(
      rrect,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(rect.left + bw * 0.70, rect.top + bw * 0.75),
          bw * 1.0259 * 0.60,
          [deep, deep.withValues(alpha: 0)],
        ),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(rect.left + bw * 0.32, rect.top + bw * 0.28),
          bw * 0.9904 * 0.45,
          [light, light.withValues(alpha: 0)],
        ),
    );
    if (sim.rainbow > 0) {
      canvas.drawRRect(rrect, _rainbowPaint(rect, blob));
    }
    canvas.restore();

    // Gouttelettes : rotate(angle) translateX(dist % de sa largeur) scale(s).
    for (var i = 0; i < 3; i++) {
      final wd = gw * _dropSize[i];
      canvas.save();
      canvas.rotate(sim.dropAngle[i] * math.pi / 180);
      canvas.translate(sim.dropDistance[i] / 100 * wd, 0);
      canvas.scale(sim.dropScale[i]);
      final box = Rect.fromCenter(center: Offset.zero, width: wd, height: wd);
      // radial-gradient(circle at 35 % 30 %, light, blob 70 %) ; rayon
      // « farthest-corner » 0,9552 wd, arrêt à 70 %.
      canvas.drawCircle(
        Offset.zero,
        wd / 2,
        Paint()
          ..shader = ui.Gradient.radial(
            Offset(box.left + wd * 0.35, box.top + wd * 0.30),
            wd * 0.9552 * 0.70,
            [light, blob],
          ),
      );
      if (sim.rainbow > 0) {
        canvas.drawCircle(Offset.zero, wd / 2, _rainbowPaint(box, blob));
      }
      canvas.restore();
    }

    canvas.restore();
  }

  /// `::after` : conic-gradient(from --rainbow-turn, blob, #9b72cb, #4285f4,
  /// #34a853, #fbbc05, #ea4335, blob) à l'opacité `--rainbow` (globals.css:2204-2213).
  Paint _rainbowPaint(Rect box, Color blob) {
    final a = sim.rainbow;
    final colors = [blob, ..._rainbowTail, blob];
    final start = sim.rainbowTurn * math.pi / 180 - math.pi / 2;
    return Paint()
      ..shader = ui.Gradient.sweep(
        box.center,
        [for (final c in colors) c.withValues(alpha: a)],
        [for (var i = 0; i < colors.length; i++) i / (colors.length - 1)],
        ui.TileMode.clamp,
        // CSS démarre à midi, Flutter à trois heures.
        start,
        start + 2 * math.pi,
      );
  }

  /// `.awa-blob__shine` : 26 x 18 % à (27 %, 24 %), ellipse blanche .85 -> 0
  /// à 70 %, rotate -30deg, translate en % (globals.css:2216-2227).
  void _shine(Canvas canvas, double s) {
    final w = s * 0.26, h = s * 0.18;
    canvas.save();
    canvas.translate(s * (0.27 - 0.5) + w / 2, s * (0.24 - 0.5) + h / 2);
    canvas.rotate(-30 * math.pi / 180);
    canvas.translate(sim.shineTx / 100 * w, sim.shineTy / 100 * h);
    // Ellipse « farthest-corner » : rx = w/2 * sqrt2, arrêt à 70 %.
    final rx = w / 2 * math.sqrt2 * 0.70;
    canvas.scale(1, h / w);
    canvas.drawCircle(
      Offset.zero,
      w / 2,
      Paint()
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 1.5 * s / 136)
        ..shader = ui.Gradient.radial(Offset.zero, rx, const [
          Color(0xD9FFFFFF),
          Color(0x00FFFFFF),
        ]),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(OrbPainter old) =>
      old.color != color || old.gooSigma != gooSigma || old.sim != sim;
}
