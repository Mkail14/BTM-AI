import 'package:flutter/material.dart';

/// Champ de texte avec libellé au-dessus (formulaires d'authentification).
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.errorText,
    this.fieldKey,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final String? errorText;
  final Key? fieldKey;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  /// Champ mot de passe : œil afficher/masquer (`PasswordInput.tsx`).
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final label = _visible
        ? 'Masquer le mot de passe'
        : 'Afficher le mot de passe';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(w.label, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 6),
        TextField(
          key: w.fieldKey,
          controller: w.controller,
          obscureText: w.obscureText && !_visible,
          keyboardType: w.keyboardType,
          textInputAction: w.textInputAction,
          autofillHints: w.autofillHints,
          onSubmitted: w.onSubmitted,
          decoration: InputDecoration(
            hintText: w.hint,
            errorText: w.errorText,
            suffixIcon: w.obscureText
                ? IconButton(
                    key: const Key('password-toggle'),
                    tooltip: label,
                    isSelected: _visible,
                    icon: Icon(
                      _visible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                    onPressed: () => setState(() => _visible = !_visible),
                  )
                : null,
          ),
        ),
      ],
    );
  }
}
