import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/theme/app_theme.dart';
import 'package:tamilya_mobile/features/chat/presentation/message_bubble.dart';
import 'package:tamilya_mobile/shared/models/chat_message.dart';

Widget _wrap(ChatMessage m, VoidCallback onRetry) => MaterialApp(
  theme: AppTheme.light,
  home: Scaffold(
    body: MessageBubble(message: m, onRetry: onRetry),
  ),
);

void main() {
  testWidgets('erreur typée : message du serveur et bouton Renvoyer', (
    tester,
  ) async {
    var taps = 0;
    await tester.pumpWidget(
      _wrap(
        const ChatMessage(
          id: 'a',
          role: MessageRole.assistant,
          text: '',
          status: MessageStatus.error,
          errorText: 'Ta session a été renouvelée. Renvoie ton message.',
          retry: RetryKind.resend,
        ),
        () => taps++,
      ),
    );
    expect(find.textContaining('session a été renouvelée'), findsOneWidget);
    await tester.tap(find.text('Renvoyer'));
    expect(taps, 1);
  });

  testWidgets('quota : message affiché, aucun bouton', (tester) async {
    await tester.pumpWidget(
      _wrap(
        const ChatMessage(
          id: 'a',
          role: MessageRole.assistant,
          text: '',
          status: MessageStatus.error,
          errorText: 'Limite atteinte.',
        ),
        () {},
      ),
    );
    expect(find.text('Limite atteinte.'), findsOneWidget);
    expect(find.text('Réessayer'), findsNothing);
    expect(find.text('Renvoyer'), findsNothing);
  });
}
