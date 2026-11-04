import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final boot = await bootstrap();
  if (boot.configError != null) {
    runApp(_ConfigErrorApp(message: boot.configError!));
    return;
  }
  runApp(ProviderScope(overrides: boot.overrides, child: const TamilyaApp()));
}

/// Écran d'erreur de configuration : l'app ne tente aucun trafic.
class _ConfigErrorApp extends StatelessWidget {
  const _ConfigErrorApp({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(message, textAlign: TextAlign.center),
          ),
        ),
      ),
    );
  }
}
