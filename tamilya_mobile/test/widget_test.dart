import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/app.dart';
import 'package:tamilya_mobile/core/theme/app_theme.dart';
import 'package:tamilya_mobile/core/theme/tokens.dart';
import 'package:tamilya_mobile/features/auth/presentation/auth_sheet.dart';
import 'package:tamilya_mobile/features/auth/presentation/splash_screen.dart';
import 'package:tamilya_mobile/features/chat/data/fake_chat_repository.dart';
import 'package:tamilya_mobile/features/chat/domain/chat_repository.dart';
import 'package:tamilya_mobile/features/chat/presentation/home_screen.dart';
import 'package:tamilya_mobile/features/chat/presentation/chat_controller.dart';
import 'package:tamilya_mobile/features/chat/presentation/composer.dart';
import 'package:tamilya_mobile/features/chat/presentation/message_bubble.dart';
import 'package:tamilya_mobile/shared/models/chat_message.dart';

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

  /// Écran de téléphone, animations système coupées (pas d'animation infinie).
  void phone(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.platformDispatcher.clearAccessibilityFeaturesTestValue();
    });
  }

  Future<void> openApp(WidgetTester tester) async {
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
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
  }

  /// Écrit à l'accueil, envoie, passe par la feuille de connexion.
  Future<void> signInFromHome(WidgetTester tester, String message) async {
    await tester.enterText(find.byType(TextField), message);
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pumpAndSettle();
    await tester.tap(find.text("Continuer avec l'e-mail"));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();
  }

  testWidgets('premier écran : splash puis accueil (pas de connexion)', (
    tester,
  ) async {
    phone(tester);
    await tester.pumpWidget(const ProviderScope(child: TamilyaApp()));
    expect(find.byType(SplashScreen), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Essayer Tamilya'), findsOneWidget);
    expect(find.text('Comment dit-on merci ?'), findsOneWidget);
  });

  testWidgets('envoi à l accueil : feuille de connexion, puis chat + message', (
    tester,
  ) async {
    phone(tester);
    await openApp(tester);
    await tester.enterText(find.byType(TextField), 'Bonjour Tamilya');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pumpAndSettle();
    expect(find.text(kSignupReason), findsOneWidget);
    expect(find.text('Bienvenue chez\nBTM AI'), findsOneWidget);

    await tester.tap(find.text("Continuer avec l'e-mail"));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();

    expect(find.byType(HomeScreen), findsNothing);
    expect(find.byType(Composer), findsOneWidget);
    // Le message gardé est envoyé automatiquement, la réponse factice suit.
    expect(find.text('Bonjour Tamilya'), findsOneWidget);
    expect(find.textContaining('réponse factice'), findsOneWidget);
  });

  testWidgets('fermer la feuille garde le texte et reste sur l accueil', (
    tester,
  ) async {
    phone(tester);
    await openApp(tester);
    await tester.enterText(find.byType(TextField), 'Garde-moi');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Fermer'));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Garde-moi'), findsOneWidget);
  });

  testWidgets('chat : tiroir et paramètres', (tester) async {
    phone(tester);
    await openApp(tester);
    await signInFromHome(tester, 'Salut');

    await tester.tap(find.byTooltip('Ouvrir le menu'));
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsOneWidget);
    expect(find.text('Dire bonjour en shimaoré'), findsOneWidget);

    await tester.tap(find.text('Paramètres'));
    await tester.pumpAndSettle();
    expect(find.text('Ton nom et ton téléphone'), findsOneWidget);
  });

  testWidgets('le retour système ferme le tiroir', (tester) async {
    phone(tester);
    await openApp(tester);
    await signInFromHome(tester, 'Salut');

    await tester.tap(find.byTooltip('Ouvrir le menu'));
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Nouvelle conversation'), findsNothing);
  });

  test('couleurs dérivées de la persona (bulle 11 % clair, 22 % sombre)', () {
    bool near(Color a, Color b) =>
        (a.r - b.r).abs() < 0.01 &&
        (a.g - b.g).abs() < 0.01 &&
        (a.b - b.b).abs() < 0.01;
    expect(
      near(TamilyaPalette.light.userBubble, const Color(0xFFF9E7ED)),
      isTrue,
    );
    expect(
      near(TamilyaPalette.dark.userBubble, const Color(0xFF3B1926)),
      isTrue,
    );
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

  testWidgets('le bouton d envoi fait au moins 48 dp', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Composer(onSend: (_) {})),
      ),
    );
    final size = tester.getSize(find.byType(IconButton));
    expect(size.width, greaterThanOrEqualTo(48));
    expect(size.height, greaterThanOrEqualTo(48));
  });

  testWidgets('compteur dès 80 % et envoi bloqué au-delà de 4000', (
    tester,
  ) async {
    final sent = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Composer(onSend: sent.add)),
      ),
    );
    await tester.enterText(find.byType(TextField), 'a' * 3000);
    await tester.pump();
    expect(find.textContaining('caractères'), findsNothing);

    await tester.enterText(find.byType(TextField), 'a' * 3300);
    await tester.pump();
    expect(find.text('3300 / 4000 caractères'), findsOneWidget);
    await tester.tap(find.byTooltip('Envoyer le message'));
    expect(sent, hasLength(1));

    await tester.enterText(find.byType(TextField), 'a' * 4001);
    await tester.pump();
    expect(find.text('4001 / 4000 caractères'), findsOneWidget);
    await tester.tap(find.byTooltip('Envoyer le message'), warnIfMissed: false);
    expect(sent, hasLength(1));
  });

  testWidgets('Réessayer appelle l action sur une réponse en erreur', (
    tester,
  ) async {
    var retried = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: MessageBubble(
            message: const ChatMessage(
              id: 'a',
              role: MessageRole.assistant,
              text: '',
              status: MessageStatus.error,
            ),
            onRetry: () => retried++,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Réessayer'));
    expect(retried, 1);
  });

  test('le contrôleur renvoie le dernier message après une erreur', () async {
    final repo = _FlakyRepository();
    final container = ProviderContainer(
      overrides: [chatRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);
    final provider = chatControllerProvider(null);
    container.listen(provider, (_, _) {});
    final controller = container.read(provider.notifier);

    await controller.send('Bonjour');
    expect(container.read(provider).messages.last.status, MessageStatus.error);

    await controller.retry();
    final messages = container.read(provider).messages;
    expect(repo.calls, 2);
    expect(messages, hasLength(2));
    expect(messages.last.status, MessageStatus.complete);
    expect(messages.last.text, 'ok');
  });
}

class _FlakyRepository implements ChatRepository {
  int calls = 0;

  @override
  Future<List<ChatMessage>> history(String conversationId) async => const [];

  @override
  Stream<String> sendMessage({String? conversationId, required String text}) {
    calls++;
    if (calls == 1) return Stream.error(Exception('échec'));
    return Stream.value('ok');
  }
}
