import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Logo « btm » avec le badge « AI » rose du site. Variante crème sur fond
/// sombre, encre sur fond clair.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 28});

  final double height;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fs = height * 0.36;
    return Semantics(
      label: 'BTM AI',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Image.asset(
            p.isDark
                ? 'assets/brand/btm-ai-creme.png'
                : 'assets/brand/btm-ai-encre.png',
            height: height,
            errorBuilder: (_, _, _) => SizedBox(height: height),
          ),
          Padding(
            padding: EdgeInsets.only(left: height * 0.14, bottom: height * 0.1),
            child: Container(
              padding: EdgeInsets.symmetric(
                horizontal: fs * 0.45,
                vertical: fs * 0.12,
              ),
              decoration: BoxDecoration(
                color: p.accent,
                borderRadius: BorderRadius.circular(fs * 0.18 + 1),
              ),
              child: Text(
                'AI',
                style: TextStyle(
                  fontSize: fs,
                  height: 1,
                  color: p.accentFg,
                  fontVariations: wght(700),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
