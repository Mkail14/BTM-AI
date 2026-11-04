import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

enum PrimaryButtonVariant { filled, outline, danger }

/// Bouton principal en pilule (« btn-rose » du web). 03-uiux.md §4.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = PrimaryButtonVariant.filled,
    this.loading = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final PrimaryButtonVariant variant;

  /// Affiche « Patiente… » et bloque l'appui.
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final text = loading ? 'Patiente…' : label;
    final callback = loading ? null : onPressed;
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null && !loading) ...[
          Icon(icon, size: 20),
          const SizedBox(width: 8),
        ],
        if (loading) ...[
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 8),
        ],
        Flexible(child: Text(text, overflow: TextOverflow.ellipsis)),
      ],
    );
    switch (variant) {
      case PrimaryButtonVariant.filled:
        return FilledButton(onPressed: callback, child: child);
      case PrimaryButtonVariant.danger:
        return FilledButton(
          onPressed: callback,
          style: FilledButton.styleFrom(
            backgroundColor: p.danger,
            foregroundColor: Theme.of(context).colorScheme.onError,
          ),
          child: child,
        );
      case PrimaryButtonVariant.outline:
        return OutlinedButton(
          onPressed: callback,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            shape: const StadiumBorder(),
            foregroundColor: p.fg,
            side: BorderSide(color: p.border),
          ),
          child: child,
        );
    }
  }
}
