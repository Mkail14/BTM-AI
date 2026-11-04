/// Drapeaux de fonctionnalités (ARCHITECTURE §9). Tous désactivés par défaut.
///
/// Les écrans concernés testent le drapeau ; rien d'autre n'est livré en V1.
abstract final class FeatureFlags {
  static const bool guestMode = bool.fromEnvironment('FEATURE_GUEST_MODE');
  static const bool googleSignIn = bool.fromEnvironment(
    'FEATURE_GOOGLE_SIGNIN',
  );
  static const bool appleSignIn = bool.fromEnvironment('FEATURE_APPLE_SIGNIN');
}
