import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/shared/widgets/awa_orb.dart';
import 'package:tamilya_mobile/shared/widgets/awa_orb_sim.dart';

/// Fait avancer la simulation pendant [ms] à 30 images/s, rend les
/// intensités de `--rainbow` vues.
List<double> run(
  OrbSim sim,
  double ms, {
  OrbVoiceState st = OrbVoiceState.off,
  bool thinking = false,
  double voice = 0,
  double from = 0,
}) {
  final out = <double>[];
  for (var now = from; now < from + ms; now += 1000 / 30) {
    sim.step(now, 1 / 30, thinking: thinking, state: st, voiceTarget: voice);
    out.add(sim.rainbow);
  }
  return out;
}

void main() {
  test('les couleurs ne s\'allument qu\'au battement, puis s\'éteignent', () {
    final sim = OrbSim(random: math.Random(1));
    final r = run(sim, 10000);
    expect(r.any((v) => v > 0.5), isTrue, reason: 'un battement allume');
    final off = r.where((v) => v < 0.15).length;
    // Un battement dure ~0,5 s sur ~1,15 s : plus d'un tiers du temps éteint.
    expect(off / r.length, greaterThan(0.3));
    // Toute valeur est dans 0..1.
    expect(r.every((v) => v >= 0 && v <= 1), isTrue);
  });

  test('réflexion : battements plus rapides, voix : forme plus mobile', () {
    int beats(List<double> r) {
      var n = 0;
      for (var i = 1; i < r.length; i++) {
        if (r[i - 1] < 0.5 && r[i] >= 0.5) n++;
      }
      return n;
    }

    final calm = beats(run(OrbSim(random: math.Random(2)), 20000));
    final busy = beats(
      run(OrbSim(random: math.Random(2)), 20000, thinking: true),
    );
    expect(busy, greaterThan(calm));

    final s = OrbSim(random: math.Random(3));
    run(s, 2000, st: OrbVoiceState.speaking, voice: 1);
    expect(s.voice, greaterThan(0.9));
    expect(s.sy, greaterThan(s.sx));
    expect(s.lively, isTrue);
  });

  test('rayons bornés 28..72 et images par seconde 20 au repos / 30 vif', () {
    final sim = OrbSim(random: math.Random(4));
    run(sim, 5000, st: OrbVoiceState.speaking, voice: 1);
    expect(sim.radii.every((v) => v >= 28 && v <= 72), isTrue);
    expect(sim.minFrameMs, closeTo(1000 / 30 - 4, 0.01));
    sim.lively = false;
    expect(sim.minFrameMs, closeTo(1000 / 20 - 4, 0.01));
  });

  test('pose fixe : valeurs CSS sans animation', () {
    final sim = OrbSim(random: math.Random(5))..resetToRest();
    expect(sim.rainbow, 0);
    expect(sim.radii.first, 42);
    expect(sim.glowOpacity, 1);
  });

  testWidgets('animé : se peint sans erreur, un seul Ticker, se libère', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: AwaOrb(
            size: 136,
            voiceState: OrbVoiceState.speaking,
            voiceLevel: ValueNotifier<double>(0.6),
            random: math.Random(6),
            float: true,
          ),
        ),
      ),
    );
    for (var i = 0; i < 90; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('animations réduites : aucun Ticker actif, pose fixe', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Center(child: AwaOrb(size: 136, random: math.Random(7))),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 2));
    expect(tester.binding.transientCallbackCount, 0);
  });
}
