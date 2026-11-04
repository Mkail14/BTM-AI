import 'dart:async';

import 'package:flutter/material.dart';

/// Sous-titre « machine à écrire » de l'accueil (GuestLanding.tsx:76-148).
/// 45 ms par lettre tapée, 22 ms par lettre effacée, 1 800 ms de pause
/// phrase finie, 350 ms entre deux phrases. Mouvement réduit : première
/// phrase fixe.
class Typewriter extends StatefulWidget {
  const Typewriter({super.key, required this.phrases, this.style});

  final List<String> phrases;
  final TextStyle? style;

  @override
  State<Typewriter> createState() => _TypewriterState();
}

enum _Phase { typing, pausing, deleting }

class _TypewriterState extends State<Typewriter> {
  Timer? _timer;
  Timer? _blink;
  int _index = 0;
  int _length = 0;
  _Phase _phase = _Phase.typing;
  bool _cursorOn = true;
  bool _animating = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final animate = !MediaQuery.disableAnimationsOf(context);
    if (animate && !_animating) {
      _animating = true;
      _length = 0;
      _schedule(const Duration(milliseconds: 600));
      _blink = Timer.periodic(const Duration(milliseconds: 530), (_) {
        if (mounted) setState(() => _cursorOn = !_cursorOn);
      });
    } else if (!animate && _animating) {
      _stop();
    }
  }

  void _stop() {
    _animating = false;
    _timer?.cancel();
    _blink?.cancel();
  }

  @override
  void dispose() {
    _stop();
    super.dispose();
  }

  void _schedule(Duration d) {
    _timer?.cancel();
    _timer = Timer(d, _tick);
  }

  void _tick() {
    if (!mounted) return;
    final phrase = widget.phrases[_index];
    switch (_phase) {
      case _Phase.typing:
        setState(() => _length++);
        if (_length >= phrase.length) {
          _phase = _Phase.pausing;
          _schedule(const Duration(milliseconds: 1800));
        } else {
          _schedule(const Duration(milliseconds: 45));
        }
      case _Phase.pausing:
        _phase = _Phase.deleting;
        _schedule(const Duration(milliseconds: 22));
      case _Phase.deleting:
        setState(() => _length--);
        if (_length <= 0) {
          _phase = _Phase.typing;
          _index = (_index + 1) % widget.phrases.length;
          _schedule(const Duration(milliseconds: 350));
        } else {
          _schedule(const Duration(milliseconds: 22));
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final phrase = widget.phrases[_index];
    final shown = _animating
        ? phrase.substring(0, _length.clamp(0, phrase.length))
        : phrase;
    final style = widget.style ?? DefaultTextStyle.of(context).style;
    return Semantics(
      label: widget.phrases.first,
      excludeSemantics: true,
      child: Text.rich(
        TextSpan(
          text: shown,
          children: [
            if (_animating)
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Container(
                  width: 2,
                  height: (style.fontSize ?? 16) * 1.1,
                  margin: const EdgeInsets.only(left: 2),
                  color: _cursorOn
                      ? (style.color ?? Colors.white).withValues(alpha: 0.9)
                      : const Color(0x00000000),
                ),
              ),
          ],
        ),
        textAlign: TextAlign.center,
        style: style,
      ),
    );
  }
}
