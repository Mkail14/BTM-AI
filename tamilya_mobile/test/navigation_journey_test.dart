import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/app.dart';
import 'package:tamilya_mobile/features/chat/data/fake_chat_repository.dart';
import 'package:tamilya_mobile/features/chat/presentation/chat_controller.dart';

/// Parcours de l'utilisateur AVEC les animations (pas de pumpAndSettle : le
/// globe tourne en continu), pour attraper `_dependents.isEmpty` (InheritedElement
/// démonté alors que des widgets en dépendent encore) vu sur tablette.
void main() {
  Future<void> tick(WidgetTester tester, [int ms = 1200]) async {
    for (var t = 0; t < ms; t += 50) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets(
    'connexion, tiroir, conversation, paramètres, retour : sans assertion',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1280);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            chatRepositoryProvider.overrideWithValue(
              const FakeChatRepository(delay: Duration.zero),
            ),
          ],
          child: const TamilyaApp(),
        ),
      );
      await tick(tester, 2500);

      // Feuille de connexion : ouvrir, fermer, rouvrir.
      await tester.enterText(find.byType(TextField), 'Salut');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tick(tester);
      await tester.tap(find.byTooltip('Fermer'));
      await tick(tester);
      await tester.enterText(find.byType(TextField), 'Salut');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tick(tester);
      await tester.tap(find.text("Continuer avec l'e-mail"));
      await tick(tester);
      await tester.enterText(
        find.byKey(const Key('auth-email')),
        'a@exemple.fr',
      );
      await tester.enterText(
        find.byKey(const Key('auth-password')),
        'secret123',
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 500);
      await tick(tester, 300);
      await tester.tap(find.text('Se connecter'));
      await tick(tester, 100);
      tester.view.resetViewInsets();
      await tick(tester, 2500);

      // Tiroir, autre conversation, retour.
      await tester.tap(find.byTooltip('Ouvrir le menu'));
      await tick(tester);
      await tester.tap(find.text('Les nombres de 1 à 10'));
      await tick(tester, 2000);
      await tester.tap(find.byTooltip('Ouvrir le menu'));
      await tick(tester);
      await tester.tap(find.text('Paramètres'));
      await tick(tester);
      await tester.tap(find.text('Sécurité'));
      await tick(tester, 300);
      expect(find.text('Ton nom et ton téléphone'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tick(tester);
      await tester.tap(find.byTooltip('Ouvrir le menu'));
      await tick(tester);
      await tester.tap(find.text('Dire bonjour en shimaoré'));
      await tick(tester, 2000);
      await tester.tap(find.byTooltip('Ouvrir le menu'));
      await tick(tester);
      await tester.tap(find.text('Paramètres'));
      await tick(tester);
      await tester.binding.handlePopRoute();
      await tick(tester);

      await tester.tap(find.byTooltip('Ouvrir le menu'));
      await tick(tester);
      await tester.tap(find.text('Paramètres'));
      await tick(tester);
      await tester.tap(find.text('Se déconnecter'));
      await tick(tester, 2500);
      await tester.enterText(find.byType(TextField), 'Re');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tick(tester);
      await tester.tap(find.text("Continuer avec l'e-mail"));
      await tick(tester);
      await tester.enterText(
        find.byKey(const Key('auth-email')),
        'a@exemple.fr',
      );
      await tester.enterText(
        find.byKey(const Key('auth-password')),
        'secret123',
      );
      await tester.tap(find.text('Se connecter'));
      await tick(tester, 2500);
      expect(tester.takeException(), isNull);
    },
  );
}
