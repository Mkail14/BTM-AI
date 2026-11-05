import 'dart:math' as math;
import 'dart:typed_data';

/// État du mode vocal (`VoiceOverlay.tsx`: `state`). L'API du globe le prévoit
/// pour la mission voix ; rien ici ne parle ni n'écoute.
enum OrbVoiceState {
  /// Hors mode vocal (accueil) : globe au repos.
  off,

  /// La personne parle (`voice-level.ts`: mood `listening`) : le globe frémit.
  listening,

  /// Tamilya réfléchit (`busy` de `AwaBlob`) : plus vif et resserré.
  waiting,

  /// Tamilya parle (mood `speaking`) : le globe suit le niveau de voix.
  speaking,
}

/// Bruit lisse à une dimension (`makeNoise`, AwaBlob.tsx:27-41) : valeurs au
/// hasard sur une grille de 512, reliées par un lissage cubique, deux octaves.
class OrbNoise {
  OrbNoise(math.Random rng)
    : _lattice = Float32List.fromList([
        for (var i = 0; i < 512; i++) rng.nextDouble() * 2 - 1,
      ]);

  final Float32List _lattice;

  double _at(double x) {
    final i = x.floor();
    final f = x - i;
    final u = f * f * (3 - 2 * f);
    final a = _lattice[i % 512];
    final b = _lattice[(i + 1) % 512];
    return a + (b - a) * u;
  }

  double call(double x) => _at(x) * 0.72 + _at(x * 2.3 + 91.7) * 0.28;
}

class _Beat {
  _Beat(this.at, this.strength);
  final double at;
  final double strength;
}

class _DropState {
  _DropState(this.angle, this.speed, this.seed);
  double angle;
  final double speed;
  final double seed;
}

double _clamp(double v, double min, double max) =>
    v < min ? min : (v > max ? max : v);

/// Simulation de la goutte : copie fidèle de la boucle d'`AwaBlob.tsx:94-186`.
/// Aucune dépendance Flutter : testable avec un `Random` de graine fixe.
/// Les valeurs de sortie sont celles que le site pose en style CSS.
class OrbSim {
  OrbSim({math.Random? random}) : _rng = random ?? math.Random() {
    _noise = OrbNoise(_rng);
    t = _rand(0, 300);
    rotation = _rand(0, 360);
    nextBeat = _rand(600, 1000);
    colorTurn = _rand(0, 360);
    nextJolt = _rand(2500, 6000);
    for (var i = 0; i < 3; i++) {
      _drops.add(
        _DropState(
          _rand(0, 360),
          _rand(25, 70) * (_rng.nextDouble() < 0.5 ? -1 : 1),
          _rand(0, 1000),
        ),
      );
    }
  }

  /// Images par seconde quand elle bouge / au repos (AwaBlob.tsx:7-9).
  static const double fpsActive = 30;
  static const double fpsIdle = 20;

  final math.Random _rng;
  late final OrbNoise _noise;

  double _rand(double min, double max) => min + _rng.nextDouble() * (max - min);

  // État interne.
  late double t;
  late double rotation;
  double voice = 0;
  late double nextBeat;
  List<_Beat> _beats = [];
  late double colorTurn;
  late double nextJolt;
  double _joltAt = -1e9, _joltX = 0, _joltY = 0;
  final List<_DropState> _drops = [];

  /// 30 images/s quand elle bouge vraiment, 20 au repos.
  bool lively = true;

  // Sorties (valeurs CSS du site).
  /// Translation du cœur, en % de la taille du globe.
  double tx = 0, ty = 0;

  /// Inclinaison en degrés.
  double tilt = 0;
  double sx = 1, sy = 1;

  /// `--rainbow` (0 = couleurs éteintes) et `--rainbow-turn` (degrés).
  double rainbow = 0, rainbowTurn = 0;

  /// Rayons du `border-radius` du corps, en % : 4 horizontaux puis 4 verticaux.
  List<double> radii = [42, 58, 63, 37, 41, 44, 56, 59];

  /// Rotation du corps, en degrés.
  double bodyRotation = 0;

  /// Par gouttelette : angle (degrés), distance (% de sa largeur), échelle.
  final List<double> dropAngle = [0, 0, 0];
  final List<double> dropDistance = [0, 0, 0];
  final List<double> dropScale = [1, 1, 1];
  double glowOpacity = 0.5, glowScale = 0.95;
  double shineTx = 0, shineTy = 0;

  /// Flottement vertical en dp (`awa-float`), 0 si désactivé.
  double floatY = 0;

  /// Intensité du cœur (0 à 1) à la dernière image.
  double heart = 0;

  /// Une image de la boucle. [now] en ms, [dt] en secondes (déjà plafonné).
  void step(
    double now,
    double dt, {
    bool thinking = false,
    OrbVoiceState state = OrbVoiceState.off,
    double voiceTarget = 0,
    bool float = false,
  }) {
    final speaking = state == OrbVoiceState.speaking;
    final listening = state == OrbVoiceState.listening;
    final speed = speaking ? 1.9 : (thinking ? 2.4 : (listening ? 1.4 : 1.0));
    t += dt * speed;

    // Voix : montée immédiate, retombée douce.
    voice += (voiceTarget - voice) * (voiceTarget > voice ? 0.55 : 0.18);

    // Cœur : « boum-boum » (un coup fort, un plus léger).
    if (now >= nextBeat) {
      final strength = _rand(0.85, 1);
      _beats.add(_Beat(now, strength));
      colorTurn += _rand(70, 150);
      _beats.add(_Beat(now + _rand(230, 270), strength * _rand(0.6, 0.75)));
      nextBeat = now + (thinking ? _rand(650, 750) : _rand(1050, 1250));
    }
    _beats = _beats.where((b) => now - b.at < 700).toList();
    var h = 0.0;
    for (final b in _beats) {
      final d = now - b.at;
      if (d < 0) continue;
      h = math.max(
        h,
        b.strength * (d < 90 ? d / 90 : math.exp(-(d - 90) / 180)),
      );
    }
    heart = h;

    if (now >= nextJolt) {
      final a = _rand(0, math.pi * 2);
      _joltAt = now;
      _joltX = math.cos(a);
      _joltY = math.sin(a);
      nextJolt = now + _rand(2500, 7000);
    }
    final jd = (now - _joltAt) / 1000;
    final joltAmount = jd < 1.2
        ? math.sin(math.min(1.0, jd / 0.18) * math.pi * 0.5) *
              math.exp(-jd * 3.2)
        : 0.0;

    // Dérive et rotation.
    tx = _noise(t * 0.22 + 11) * 5 + _joltX * joltAmount * 6;
    ty = _noise(t * 0.19 + 47) * 5 + _joltY * joltAmount * 6;
    rotation += _noise(t * 0.12 + 300) * 55 * dt * speed;
    tilt = _noise(t * 0.3 + 700) * 8;

    // Taille : cœur, voix, sursaut.
    final grow =
        1 + h * 0.07 + voice * 0.2 + (thinking ? _noise(t * 3) * 0.03 : 0);
    sx = grow * (1 - voice * 0.06 + joltAmount * 0.08 * _joltX.abs());
    sy = grow * (1 + voice * 0.12 + joltAmount * 0.08 * _joltY.abs());

    // Les couleurs s'allument avec chaque coup du cœur, puis s'effacent.
    colorTurn += 120 * dt * speed;
    rainbow = double.parse(_clamp(h * 1.2, 0, 1).toStringAsFixed(3));
    if (rainbow != 0) rainbowTurn = colorTurn % 360;

    // Forme : huit rayons.
    final wobble = 14 + voice * 10 + (thinking ? 4 : 0);
    radii = [
      for (var i = 0; i < 8; i++)
        _clamp(50 + _noise(t * (0.35 + i * 0.04) + i * 37.3) * wobble, 28, 72),
    ];
    bodyRotation = rotation;

    // Gouttelettes.
    for (var i = 0; i < 3; i++) {
      final d = _drops[i];
      d.angle += (d.speed + _noise(t * 0.4 + d.seed) * 60) * dt * speed;
      dropAngle[i] = d.angle;
      dropDistance[i] = _clamp(
        55 +
            _noise(t * 0.33 + d.seed + 50) * 75 +
            voice * 45 +
            (thinking ? -25 : 0),
        0,
        150,
      );
      dropScale[i] = _clamp(
        0.75 + _noise(t * 0.5 + d.seed + 90) * 0.3 + voice * 0.15,
        0.4,
        1.2,
      );
    }

    glowOpacity = _clamp(0.5 + h * 0.35 + voice * 0.5, 0, 1);
    glowScale = 0.95 + h * 0.12 + voice * 0.3;
    shineTx = _noise(t * 0.25 + 900) * 8;
    shineTy = _noise(t * 0.25 + 950) * 6;

    // awa-float : 6 s, 0 -> -8 px -> 0, ease-in-out (voix seulement).
    if (float) {
      final p = (now / 6000) % 1.0;
      final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
      floatY = -8 * _easeInOut(tri);
    } else {
      floatY = 0;
    }

    // Prochain battement tout proche : on repasse à 30 images juste avant.
    lively =
        thinking ||
        state != OrbVoiceState.off ||
        voice > 0.01 ||
        h > 0.01 ||
        joltAmount > 0.01 ||
        nextBeat - now < 120 ||
        _beats.isNotEmpty;
  }

  /// Intervalle minimal entre deux images (ms), avec la même marge de 4 ms
  /// que le site (AwaBlob.tsx:111).
  double get minFrameMs => 1000 / (lively ? fpsActive : fpsIdle) - 4;

  /// Pose sans animation (animations réduites) : valeurs CSS par défaut des
  /// règles `.awa-blob*` quand `animation: none` (globals.css:2402-2412).
  void resetToRest() {
    tx = ty = tilt = 0;
    sx = sy = 1;
    rainbow = 0;
    radii = [42, 58, 63, 37, 41, 44, 56, 59];
    bodyRotation = 0;
    for (var i = 0; i < 3; i++) {
      dropAngle[i] = 0;
      dropDistance[i] = 0;
      dropScale[i] = 1;
    }
    glowOpacity = 1;
    glowScale = 1;
    shineTx = shineTy = 0;
    floatY = 0;
  }

  // cubic-bezier(0.42, 0, 0.58, 1) : on cherche u tel que x(u) = [x], puis y(u).
  static double _easeInOut(double x) {
    var u = x;
    for (var i = 0; i < 6; i++) {
      final bx =
          3 * (1 - u) * (1 - u) * u * 0.42 +
          3 * (1 - u) * u * u * 0.58 +
          u * u * u;
      final dx =
          3 * (1 - u) * (1 - u) * 0.42 +
          6 * (1 - u) * u * (0.58 - 0.42) +
          3 * u * u * (1 - 0.58);
      if (dx.abs() < 1e-6) break;
      u -= (bx - x) / dx;
    }
    u = u.clamp(0.0, 1.0);
    return 3 * (1 - u) * u * u + u * u * u;
  }
}
