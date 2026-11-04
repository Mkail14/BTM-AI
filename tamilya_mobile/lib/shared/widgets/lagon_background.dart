import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Courbes de niveau du fond « lagon » (public/fond/lagon.svg du site).
///
/// Le SVG ne contient que des commandes M, L et Q absolues : un petit
/// parseur suffit (aucun paquet). Le `Path` est mis en cache une fois.
abstract final class LagonPath {
  static const double tile = 640;
  static Future<Path>? _cached;

  static Future<Path> load() =>
      _cached ??= rootBundle.loadString('assets/fond/lagon.svg').then(parse);

  static final RegExp _token = RegExp(r'[MLQ]|-?\d*\.?\d+(?:e-?\d+)?');

  static Path parse(String svg) {
    final d = RegExp(r' d="([^"]+)"').firstMatch(svg)!.group(1)!;
    final path = Path();
    String cmd = 'M';
    final nums = <double>[];
    void flush() {
      switch (cmd) {
        case 'M':
          for (var i = 0; i + 1 < nums.length; i += 2) {
            path.moveTo(nums[i], nums[i + 1]);
          }
        case 'L':
          for (var i = 0; i + 1 < nums.length; i += 2) {
            path.lineTo(nums[i], nums[i + 1]);
          }
        case 'Q':
          for (var i = 0; i + 3 < nums.length; i += 4) {
            path.quadraticBezierTo(
              nums[i],
              nums[i + 1],
              nums[i + 2],
              nums[i + 3],
            );
          }
      }
      nums.clear();
    }

    for (final m in _token.allMatches(d)) {
      final t = m.group(0)!;
      if ('MLQ'.contains(t)) {
        flush();
        cmd = t;
      } else {
        nums.add(double.parse(t));
      }
    }
    flush();
    return path;
  }
}

/// Style de rendu du fond.
enum LagonStyle {
  /// Accueil : arc-en-ciel, centre dégagé (masque radial + haut masqué).
  home,

  /// Conversation et feuilles : teinte persona, très discret.
  persona,
}

class LagonBackground extends StatelessWidget {
  const LagonBackground({
    super.key,
    required this.style,
    required this.colors,
    required this.opacity,
    this.topClear = 56,
    this.tileSize = 460,
  });

  final LagonStyle style;

  /// Couleurs du dégradé diagonal (115 deg).
  final List<Color> colors;
  final double opacity;

  /// Hauteur (dp) sous laquelle les lignes sont masquées (barre du haut).
  final double topClear;
  final double tileSize;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: FutureBuilder<Path>(
          future: LagonPath.load(),
          builder: (context, snap) {
            final path = snap.data;
            if (path == null) return const SizedBox.expand();
            return CustomPaint(
              size: Size.infinite,
              painter: _LagonPainter(
                path: path,
                style: style,
                colors: colors,
                opacity: opacity,
                topClear: topClear,
                tileSize: tileSize,
              ),
            );
          },
        ),
      ),
    );
  }
}

class _LagonPainter extends CustomPainter {
  _LagonPainter({
    required this.path,
    required this.style,
    required this.colors,
    required this.opacity,
    required this.topClear,
    required this.tileSize,
  });

  final Path path;
  final LagonStyle style;
  final List<Color> colors;
  final double opacity;
  final double topClear;
  final double tileSize;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.saveLayer(
      rect,
      Paint()..color = Color.fromRGBO(0, 0, 0, opacity.clamp(0, 1)),
    );

    // Dégradé diagonal à 115 deg (CSS : 0 deg = vers le haut, sens horaire).
    const angle = 115 * math.pi / 180;
    final dir = Offset(math.sin(angle), -math.cos(angle));
    final len = (size.width * dir.dx).abs() + (size.height * dir.dy).abs();
    final center = rect.center;
    final from = center - dir * (len / 2);
    final to = center + dir * (len / 2);
    final stops = colors.length == 5
        ? const [0.10, 0.30, 0.48, 0.68, 0.88]
        : List<double>.generate(colors.length, (i) => i / (colors.length - 1));

    final scale = tileSize / LagonPath.tile;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = 1.45 * scale
      ..shader = ui.Gradient.linear(from, to, colors, stops);

    final cols = (size.width / tileSize).ceil() + 1;
    final rows = (size.height / tileSize).ceil() + 1;
    // Tuile centrée horizontalement (mask-position 50 % 0 du web).
    final startX = (size.width - tileSize) / 2 - (cols ~/ 2) * tileSize;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols + 1; c++) {
        canvas.save();
        canvas.translate(startX + c * tileSize, r * tileSize);
        canvas.scale(scale);
        canvas.drawPath(path, stroke);
        canvas.restore();
      }
    }

    // Masques : multiplication d'alpha (dstIn), comme les masques CSS.
    if (style == LagonStyle.home) {
      // ellipse 80 % x 42 % centrée à (50 %, 45 %) : centre dégagé.
      canvas.save();
      canvas.translate(size.width / 2, size.height * 0.45);
      canvas.scale(size.width * 0.8, size.height * 0.42);
      final radial = Paint()
        ..blendMode = BlendMode.dstIn
        ..shader = ui.Gradient.radial(
          Offset.zero,
          1,
          const [Color(0x00000000), Color(0x00000000), Color(0xE6000000)],
          const [0, 0.2, 0.9],
        );
      canvas.drawRect(const Rect.fromLTWH(-200, -200, 400, 400), radial);
      canvas.restore();
    }
    final lin = Paint()
      ..blendMode = BlendMode.dstIn
      ..shader = ui.Gradient.linear(
        Offset(0, topClear),
        Offset(0, topClear + 88),
        const [Color(0x00000000), Color(0xFF000000)],
      );
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, topClear + 88), lin);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LagonPainter old) =>
      old.path != path ||
      old.style != style ||
      old.opacity != opacity ||
      old.tileSize != tileSize ||
      old.topClear != topClear ||
      old.colors != colors;
}
