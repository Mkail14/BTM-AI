import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/shared/widgets/app_text_field.dart';

void main() {
  testWidgets('l\'œil affiche puis masque le mot de passe', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppTextField(
            label: 'Mot de passe',
            obscureText: true,
            fieldKey: const Key('pw'),
          ),
        ),
      ),
    );
    bool obscured() =>
        tester.widget<EditableText>(find.byType(EditableText)).obscureText;
    expect(obscured(), isTrue);
    expect(find.byTooltip('Afficher le mot de passe'), findsOneWidget);

    await tester.tap(find.byKey(const Key('password-toggle')));
    await tester.pump();
    expect(obscured(), isFalse);
    expect(find.byTooltip('Masquer le mot de passe'), findsOneWidget);

    await tester.tap(find.byKey(const Key('password-toggle')));
    await tester.pump();
    expect(obscured(), isTrue);
  });

  testWidgets('un champ ordinaire n\'a pas d\'œil', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: AppTextField(label: 'E-mail')),
      ),
    );
    expect(find.byKey(const Key('password-toggle')), findsNothing);
  });
}
