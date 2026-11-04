/// Reprend `CHAT_LIMITS.maxUserMessageChars` du serveur (`src/lib/chat/limits.ts:7`).
/// Validation de confort seulement : le serveur reste juge (C3).
const int kMaxUserMessageChars = 4000;

/// Le compteur apparaît à partir de 80 % de la limite.
const double kCounterThreshold = 0.8;
