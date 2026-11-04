import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/tokens.dart';

/// Écran de lancement : crème sur encre (03-uiux.md §2). Appelle [onDone]
/// après un court délai ; la logique de session arrive avec C3.
class SplashScreen extends StatefulWidget {
  const SplashScreen({
    super.key,
    required this.onDone,
    this.duration = const Duration(milliseconds: 1200),
  });

  final VoidCallback onDone;
  final Duration duration;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(widget.duration, widget.onDone);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BrandColors.ink,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Image.asset(
                'assets/brand/icone-maskable-512.png',
                width: 96,
                height: 96,
                semanticLabel: 'Logo Tamilya',
                errorBuilder: (_, _, _) =>
                    const SizedBox(width: 96, height: 96),
              ),
            ),
            const SizedBox(height: Gaps.lg),
            const Text(
              'Tamilya',
              style: TextStyle(
                color: BrandColors.cream,
                fontSize: 28,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
