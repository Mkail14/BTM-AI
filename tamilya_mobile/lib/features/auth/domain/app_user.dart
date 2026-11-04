/// Utilisateur connecté (entité immuable).
class AppUser {
  const AppUser({required this.id, required this.displayName});

  final String id;
  final String displayName;
}
