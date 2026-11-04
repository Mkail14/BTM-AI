import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/theme/app_theme.dart';
import 'package:tamilya_mobile/features/auth/domain/app_user.dart';
import 'package:tamilya_mobile/features/auth/domain/auth_messages.dart';
import 'package:tamilya_mobile/features/auth/domain/auth_repository.dart';
import 'package:tamilya_mobile/features/auth/presentation/auth_providers.dart';
import 'package:tamilya_mobile/features/auth/presentation/auth_sheet.dart';

/// Double de test : aucun réseau. Rejette la connexion comme Supabase.
class _RecordingAuth implements AuthRepository {
  _RecordingAuth({this.signInError});

  final AppFailure? signInError;

  int signUps = 0;
  int resets = 0;
  Map<String, String>? lastSignUp;

  @override
  bool get hasSession => false;
  @override
  Stream<bool> get sessionChanges => const Stream.empty();

  @override
  Future<AppUser> signIn({
    required String email,
    required String password,
  }) async {
    if (signInError != null) throw signInError!;
    return const AppUser(id: '1', displayName: 'x');
  }

  @override
  Future<SignUpOutcome> signUp({
    required String email,
    required String password,
    required String displayName,
    required String commune,
    required String addressLine,
  }) async {
    signUps++;
    lastSignUp = {
      'email': email,
      'name': displayName,
      'commune': commune,
      'line': addressLine,
    };
    return SignUpOutcome.confirmationSent;
  }

  @override
  Future<void> requestPasswordReset(String email) async => resets++;
  @override
  Future<void> resendConfirmation(String email) async {}
  @override
  Future<AppUser> signInWithGoogle() => throw UnimplementedError();
  @override
  Future<void> signOut() async {}
}

Future<void> _open(
  WidgetTester tester,
  _RecordingAuth auth, {
  bool signup = false,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
    tester.platformDispatcher.clearAccessibilityFeaturesTestValue();
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [authRepositoryProvider.overrideWithValue(auth)],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showAuthSheet(context, signup: signup),
              child: const Text('ouvrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('ouvrir'));
  await tester.pumpAndSettle();
  await tester.tap(find.byType(FilledButton).first);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('mauvais mot de passe : le message du web est affiché', (
    tester,
  ) async {
    final auth = _RecordingAuth(
      signInError: AuthFailure(
        describeAuthError('invalid_credentials'),
        code: 'invalid_credentials',
      ),
    );
    await _open(tester, auth);
    await tester.enterText(
      find.byKey(const Key('auth-email')),
      'ali@exemple.fr',
    );
    await tester.enterText(
      find.byKey(const Key('auth-password')),
      'mauvais123',
    );
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('auth-error')), findsOneWidget);
    expect(find.text('E-mail ou mot de passe incorrect.'), findsOneWidget);
  });

  testWidgets('erreur réseau : message de connexion impossible', (
    tester,
  ) async {
    final auth = _RecordingAuth(
      signInError: const NetworkFailure(kAuthNetworkMessage),
    );
    await _open(tester, auth);
    await tester.enterText(
      find.byKey(const Key('auth-email')),
      'ali@exemple.fr',
    );
    await tester.enterText(find.byKey(const Key('auth-password')), 'secret123');
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();
    expect(find.text(kAuthNetworkMessage), findsOneWidget);
  });

  testWidgets('e-mail invalide : erreur locale, aucun appel', (tester) async {
    final auth = _RecordingAuth();
    await _open(tester, auth);
    await tester.enterText(find.byKey(const Key('auth-email')), 'pas-un-email');
    await tester.enterText(find.byKey(const Key('auth-password')), 'secret123');
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();
    expect(find.text("Cette adresse e-mail n'est pas valide."), findsOneWidget);
  });

  testWidgets(
    'inscription : nom, commune, adresse, critères et consentement requis',
    (tester) async {
      final auth = _RecordingAuth();
      await _open(tester, auth, signup: true);
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.tap(find.text('Créer mon compte'));
      await tester.pumpAndSettle();
      expect(
        find.text("Cette adresse e-mail n'est pas valide."),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('auth-email')),
        'ali@exemple.fr',
      );
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.tap(find.text('Créer mon compte'));
      await tester.pumpAndSettle();
      expect(
        find.text("Indique comment tu veux qu'on t'appelle."),
        findsOneWidget,
      );

      await tester.enterText(find.byKey(const Key('signup-name')), 'Ali');
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.tap(find.text('Créer mon compte'));
      await tester.pumpAndSettle();
      expect(find.text('Choisis ta commune.'), findsWidgets);
      expect(auth.signUps, 0);
    },
  );

  testWidgets(
    'inscription complète : métadonnées transmises, écran de confirmation',
    (tester) async {
      final auth = _RecordingAuth();
      await _open(tester, auth, signup: true);
      await tester.enterText(find.byKey(const Key('signup-name')), 'Ali');
      await tester.enterText(
        find.byKey(const Key('auth-email')),
        'ali@exemple.fr',
      );
      await tester.ensureVisible(find.byKey(const Key('signup-commune')));
      await tester.tap(find.byKey(const Key('signup-commune')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mamoudzou').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('signup-address')),
        'Près de la mosquée',
      );
      await tester.enterText(
        find.byKey(const Key('auth-password')),
        'motdepasse9',
      );
      await tester.ensureVisible(find.byKey(const Key('signup-consent')));
      await tester.tap(find.byKey(const Key('signup-consent')));
      await tester.pump();
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.tap(find.text('Créer mon compte'));
      await tester.pumpAndSettle();
      expect(auth.signUps, 1);
      expect(auth.lastSignUp!['commune'], 'Mamoudzou');
      expect(auth.lastSignUp!['name'], 'Ali');
      expect(find.byKey(const Key('auth-sent')), findsOneWidget);
    },
  );

  testWidgets('mot de passe oublié : même écran que le compte existe ou non', (
    tester,
  ) async {
    final auth = _RecordingAuth();
    await _open(tester, auth);
    await tester.tap(find.text('Mot de passe oublié ?'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth-email')),
      'inconnu@exemple.fr',
    );
    await tester.tap(find.text('Envoyer le lien'));
    await tester.pumpAndSettle();
    expect(auth.resets, 1);
    expect(find.textContaining('Si un compte existe'), findsOneWidget);
  });
}
