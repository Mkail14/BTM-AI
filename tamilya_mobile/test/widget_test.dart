import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/app.dart';
import 'package:tamilya_mobile/core/theme/app_theme.dart';
import 'package:tamilya_mobile/core/theme/tokens.dart';
import 'package:tamilya_mobile/features/chat/presentation/composer.dart';

void main() {
  test('le thème clair et le thème sombre se construisent sur les tokens', () {
    final light = AppTheme.light;
    final dark = AppTheme.dark;
    expect(light.colorScheme.primary, const Color(0xFFC8295F));
    expect(light.scaffoldBackgroundColor, const Color(0xFFFFFFFF));
    expect(dark.colorScheme.primary, const Color(0xFFF06A9B));
    expect(dark.scaffoldBackgroundColor, const Color(0xFF131516));
    expect(light.extension<TamilyaColors>()!.palette, TamilyaPalette.light);
    expect(dark.extension<TamilyaColors>()!.palette, TamilyaPalette.dark);
  });

  testWidgets('navigation : splash, connexion, chat, tiroir, paramètres', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: TamilyaApp()));
    expect(find.text('Tamilya'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('Se connecter'), findsOneWidget);

    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();
    expect(find.text('Parle shimaoré avec Tamilya'), findsOneWidget);
    expect(find.byType(Composer), findsOneWidget);

    await tester.tap(find.byTooltip('Ouvrir le menu'));
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsOneWidget);
    expect(find.text('Dire bonjour en shimaoré'), findsOneWidget);

    await tester.tap(find.text('Paramètres'));
    await tester.pumpAndSettle();
    expect(find.text('Ton nom et ton téléphone'), findsOneWidget);
  });

  testWidgets('le retour système ferme le tiroir', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: TamilyaApp()));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Ouvrir le menu'));
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsNothing);
  });

  testWidgets('la saisie : Entrée ne déclenche pas l envoi', (tester) async {
    final sent = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Composer(onSend: sent.add)),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Bonjour');
    await tester.testTextInput.receiveAction(TextInputAction.newline);
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(sent, isEmpty);

    await tester.tap(find.byTooltip('Envoyer le message'));
    await tester.pump();
    expect(sent, ['Bonjour']);
  });
}
