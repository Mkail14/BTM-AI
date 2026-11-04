import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config/limits.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/awa_orb.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/lagon_background.dart';
import '../../../shared/widgets/typewriter.dart';

const List<String> kHomeSubtitles = [
  'Écris-lui en français ou en shimaoré.',
  'Demande-lui comment dire « merci ».',
  'Apprends à saluer en shimaoré.',
  "Elle n'invente aucun mot.",
  "Chaque jour, elle apprend de nouveaux mots.",
];

/// Texte d'exemple du champ (GuestLanding.tsx:27).
const String kHomeExample = 'Comment dit-on merci ?';

/// Annonce affichée sous l'en-tête. Données factices : l'API publique ne
/// l'expose pas encore (question ouverte, voir rapport C2b).
const String kFakeAnnouncement =
    'Tamilya pourra bientôt réserver un billet de barge pour Mayotte.';

/// Accueil du visiteur (spec C2b §2) : fond lagon, orbe, titre en dégradé,
/// sous-titre « machine à écrire » et saisie immédiate. Rien n'est envoyé
/// ici : [onSubmit] reçoit le texte, le routeur ouvre la feuille de connexion.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.onSubmit,
    required this.onOpenAuth,
  });

  final ValueChanged<String> onSubmit;
  final VoidCallback onOpenAuth;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );
  late final AnimationController _line = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1550),
  );
  late final AnimationController _loop = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 7),
  );
  final TextEditingController _text = TextEditingController();
  final FocusNode _focus = FocusNode();
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _text.addListener(() => setState(() {}));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _enter.value = 1;
      _line.value = 1;
    } else {
      _enter.forward();
      _line.forward();
      _loop.repeat();
    }
  }

  @override
  void dispose() {
    _enter.dispose();
    _line.dispose();
    _loop.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _submit() {
    final value = _text.text.trim();
    if (value.isEmpty) return;
    widget.onSubmit(value);
  }

  /// Apparition : décalage Y 14 dp et fondu, avec un retard en ms.
  Widget _rise(int delayMs, Widget child) {
    final curve = CurvedAnimation(
      parent: _enter,
      curve: Interval(
        delayMs / 1100,
        (delayMs + 800) / 1100,
        curve: Curves.easeOutCubic,
      ),
    );
    return AnimatedBuilder(
      animation: curve,
      child: child,
      builder: (context, child) => Opacity(
        opacity: curve.value,
        child: Transform.translate(
          offset: Offset(0, 14 * (1 - curve.value)),
          child: child,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final media = MediaQuery.of(context);
    final width = media.size.width;
    final orb = (width * 0.32).clamp(0.0, 128.0);
    final titleStyle = TextStyle(
      fontSize: 40,
      height: 1.02,
      letterSpacing: -1.6,
      color: p.fg,
      fontVariations: wght(650),
      fontWeight: FontWeight.w600,
    );
    final titleWidth = (TextPainter(
      text: TextSpan(text: 'Parle shimaoré', style: titleStyle),
      textDirection: TextDirection.ltr,
      textScaler: media.textScaler,
    )..layout()).width;
    final expanded = _focus.hasFocus || _text.text.isNotEmpty;
    final inputWidth = expanded ? (titleWidth).clamp(248.0, width - 40) : 248.0;

    return Scaffold(
      backgroundColor: p.bg,
      body: Stack(
        children: [
          Positioned.fill(
            child: LagonBackground(
              style: LagonStyle.home,
              colors: p.rainbow,
              opacity: p.isDark ? 0.6 : 0.75,
              topClear: media.padding.top + 56,
            ),
          ),
          Column(
            children: [
              _LandingNav(onOpenAuth: widget.onOpenAuth),
              const _AnnouncementBar(),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, box) => SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: box.maxHeight),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AnimatedBuilder(
                              animation: _enter,
                              builder: (context, child) {
                                final v = Curves.easeOutBack.transform(
                                  (_enter.value * 1100 / 900).clamp(0, 1),
                                );
                                return Opacity(
                                  opacity: (_enter.value * 2).clamp(0, 1),
                                  child: Transform.scale(
                                    scale: 0.4 + 0.6 * v,
                                    child: child,
                                  ),
                                );
                              },
                              child: AwaOrb(size: orb),
                            ),
                            const SizedBox(height: 36),
                            _rise(
                              0,
                              _Title(
                                style: titleStyle,
                                loop: _loop,
                                line: _line,
                                palette: p,
                              ),
                            ),
                            const SizedBox(height: 20),
                            _rise(
                              120,
                              SizedBox(
                                height: 26,
                                child: Typewriter(
                                  phrases: kHomeSubtitles,
                                  style: TextStyle(
                                    fontSize: 16,
                                    height: 1.625,
                                    color: p.fgMuted,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            _rise(200, _input(context, p, inputWidth)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _input(BuildContext context, TamilyaPalette p, double width) {
    final focused = _focus.hasFocus;
    final hasText = _text.text.trim().isNotEmpty;
    final fill = p.isDark
        ? Color.fromRGBO(255, 255, 255, focused ? 0.10 : 0.08)
        : Colors.white;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 520),
      curve: const Cubic(0.22, 1, 0.36, 1),
      width: width,
      height: 44,
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          if (focused)
            BoxShadow(color: p.accent.withValues(alpha: 0.18), spreadRadius: 3),
          if (!p.isDark)
            const BoxShadow(
              color: Color(0x1A000000),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
        ],
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: TextField(
              controller: _text,
              focusNode: _focus,
              maxLines: 1,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _submit(),
              inputFormatters: [
                LengthLimitingTextInputFormatter(kMaxUserMessageChars),
              ],
              style: TextStyle(fontSize: 15, color: p.fg),
              decoration: InputDecoration(
                hintText: kHomeExample,
                hintStyle: TextStyle(fontSize: 15, color: p.fgMuted),
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.fromLTRB(16, 0, 56, 0),
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: -2,
            width: 48,
            height: 48,
            child: Semantics(
              button: true,
              label: 'Envoyer le message',
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _submit,
                child: Center(
                  child: Opacity(
                    opacity: hasText ? 1 : 0.4,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: p.accent,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.arrow_upward_rounded,
                        size: 16,
                        color: p.accentFg,
                      ),
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

/// Titre « Parle shimaoré avec Tamilya » : le mot « shimaoré » a un dégradé
/// animé et un souligné ondulé qui se dessine (spec C2b §3.2).
class _Title extends StatelessWidget {
  const _Title({
    required this.style,
    required this.loop,
    required this.line,
    required this.palette,
  });

  final TextStyle style;
  final Animation<double> loop;
  final Animation<double> line;
  final TamilyaPalette palette;

  List<Color> get _colors {
    const rose = TamilyaPalette.persona;
    final r = palette.rainbow;
    // blue, purple, red, yellow = r[0], r[1], r[2], r[3]
    return [rose, rose, r[1], r[0], rose, rose, r[2], r[3], rose, rose];
  }

  static const List<double> _stops = [
    0,
    0.28,
    0.40,
    0.47,
    0.58,
    0.70,
    0.79,
    0.84,
    0.92,
    1,
  ];

  ui.Shader _shader(Rect rect) {
    final w = rect.width;
    final dx = rect.left - 2 * w * loop.value;
    return ui.Gradient.linear(
      Offset(dx, 0),
      Offset(dx + 2 * w, 0),
      _colors,
      _stops,
      TileMode.repeated,
    );
  }

  @override
  Widget build(BuildContext context) {
    final fs = style.fontSize ?? 40;
    final word = Stack(
      clipBehavior: Clip.none,
      children: [
        AnimatedBuilder(
          animation: loop,
          builder: (context, _) => ShaderMask(
            blendMode: BlendMode.srcIn,
            shaderCallback: _shader,
            child: Text('shimaoré', style: style.copyWith(color: Colors.white)),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: -fs * 0.04,
          height: fs * 0.16,
          child: AnimatedBuilder(
            animation: Listenable.merge([loop, line]),
            builder: (context, _) => CustomPaint(
              painter: _UnderlinePainter(
                shaderFor: _shader,
                progress: const Interval(
                  650 / 1550,
                  1,
                  curve: Cubic(0.65, 0, 0.35, 1),
                ).transform(line.value),
              ),
            ),
          ),
        ),
      ],
    );
    return Semantics(
      header: true,
      label: 'Parle shimaoré avec Tamilya',
      excludeSemantics: true,
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: 'Parle '),
            WidgetSpan(
              alignment: PlaceholderAlignment.baseline,
              baseline: TextBaseline.alphabetic,
              child: word,
            ),
            const TextSpan(text: '\navec Tamilya'),
          ],
        ),
        textAlign: TextAlign.center,
        style: style,
      ),
    );
  }
}

class _UnderlinePainter extends CustomPainter {
  _UnderlinePainter({required this.shaderFor, required this.progress});

  final ui.Shader Function(Rect) shaderFor;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    // Courbe du site (viewBox 120 x 8), de 2 % à 98 % de la largeur.
    final path = Path()
      ..moveTo(1, 5.5)
      ..cubicTo(11, 2, 19, 2, 29, 4.5)
      ..cubicTo(39, 7, 49, 7.5, 60, 4.5)
      ..cubicTo(71, 1.5, 80, 1.5, 91, 4)
      ..cubicTo(102, 6.5, 110, 6.5, 119, 3);
    final sx = size.width * 0.96 / 120;
    final sy = size.height / 8;
    final scaled = path.transform(
      (Matrix4.identity()
            ..translateByDouble(size.width * 0.02, 0, 0, 1)
            ..scaleByDouble(sx, sy, 1, 1))
          .storage,
    );
    final metric = scaled.computeMetrics().first;
    final drawn = metric.extractPath(0, metric.length * progress);
    canvas.drawPath(
      drawn,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 1.6 * sx.clamp(0.8, 3)
        ..shader = shaderFor(Offset.zero & size)
        ..color = const Color(0xB3FFFFFF),
    );
  }

  @override
  bool shouldRepaint(_UnderlinePainter old) => true;
}

class _LandingNav extends StatelessWidget {
  const _LandingNav({required this.onOpenAuth});

  final VoidCallback onOpenAuth;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final top = MediaQuery.paddingOf(context).top;
    return ClipRect(
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          height: 48 + top,
          padding: EdgeInsets.fromLTRB(16, top, 4, 0),
          decoration: BoxDecoration(
            color: p.isDark
                ? const Color.fromRGBO(58, 58, 60, 0.62)
                : const Color.fromRGBO(255, 255, 255, 0.72),
            border: Border(
              bottom: BorderSide(
                color: p.isDark
                    ? const Color(0x14FFFFFF)
                    : const Color(0x14000000),
              ),
            ),
          ),
          child: Row(
            children: [
              const BrandLogo(height: 28),
              const Spacer(),
              _RosePill(label: 'Essayer Tamilya', onTap: onOpenAuth),
              IconButton(
                tooltip: 'Menu',
                style: IconButton.styleFrom(fixedSize: const Size(40, 48)),
                icon: const Icon(Icons.menu_rounded, size: 24),
                color: p.isDark ? const Color(0xFFE8E8ED) : p.fg,
                onPressed: onOpenAuth,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RosePill extends StatelessWidget {
  const _RosePill({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Center(
            child: Container(
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFD4306A), Color(0xFFC8295F)],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                label,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontVariations: wght(500),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AnnouncementBar extends StatelessWidget {
  const _AnnouncementBar();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: TamilyaPalette.persona.withValues(alpha: 0.12),
        border: Border(
          bottom: BorderSide(
            color: TamilyaPalette.persona.withValues(alpha: 0.22),
          ),
        ),
      ),
      child: Text.rich(
        TextSpan(
          text: '$kFakeAnnouncement ',
          children: [
            TextSpan(
              text: 'En savoir plus ›',
              style: TextStyle(color: p.accent, fontVariations: wght(500)),
            ),
          ],
        ),
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 13,
          height: 1.375,
          color: p.isDark ? const Color(0xFFF3D3DF) : p.fg,
        ),
      ),
    );
  }
}
