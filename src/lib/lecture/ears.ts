/**
 * Les deux oreilles, comme le cerveau s'en sert pour savoir d'où vient un son :
 * - le son arrive plus tôt à l'oreille la plus proche (jusqu'à 0,66 ms quand il est sur le côté :
 *   formule de Woodworth, tête de 8,75 cm) ; c'est ce qui place les sons graves ;
 * - la tête fait de l'ombre : l'oreille opposée l'entend plus bas et étouffé (aigus coupés) ;
 * - derrière, l'oreille externe étouffe un peu les aigus des deux côtés : c'est ce qui sépare
 *   devant et derrière ; au-dessus, un peu plus d'aigus.
 * Le premier essai ne jouait que sur le volume (StereoPanner) : l'utilisateur, au casque, ne
 * sentait pas le son passer d'une oreille à l'autre.
 *
 * Dans son propre fichier : les histoires (soundscape.ts) et les chansons (song-stage.ts) s'en
 * servent, et les chansons n'ont pas à charger tout le moteur des histoires.
 */
export function ears(ctx: BaseAudioContext, output: AudioNode) {
  const input = new GainNode(ctx, { gain: 1 });
  // Tout près, la voix gagne des graves (comme quelqu'un qui parle à l'oreille).
  const body = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 250, gain: 0 });
  input.connect(body);
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  merger.connect(output);
  const side = (channel: number) => {
    const delay = new DelayNode(ctx, { maxDelayTime: 0.002, delayTime: 0 });
    const shadow = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 18_000, Q: 0.5 });
    const air = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 6_000, gain: 0 });
    const gain = new GainNode(ctx, { gain: 0 });
    body.connect(delay).connect(shadow).connect(air).connect(gain).connect(merger, 0, channel);
    return { delay, shadow, air, gain };
  };
  const left = side(0);
  const right = side(1);
  const smooth = (param: AudioParam, value: number) => param.setTargetAtTime(value, ctx.currentTime, 0.015);
  return {
    input,
    set(angle: number, level: number, lift: number, meters: number) {
      const r = (angle * Math.PI) / 180;
      const lateral = Math.abs(Math.sin(r));
      const front = Math.cos(r);
      const itd = 0.000255 * (Math.asin(lateral) + lateral);
      const [near, far] = Math.sin(r) >= 0 ? [right, left] : [left, right];
      const behind = Math.max(0, -front);
      // L'air étouffe les aigus avec la distance (≈ 15 kHz à 1,6 m, 7 kHz à 6 m, 4,5 kHz à 14 m).
      const distant = 20_000 * Math.min(1, 1 / Math.max(1, meters) ** 0.55);
      const back = Math.min(distant, 18_000 * (4_500 / 18_000) ** behind);
      // Tout près, l'oreille opposée est encore plus dans l'ombre de la tête.
      const close = Math.max(0, Math.min(1, (1.2 - meters) / 0.5));
      smooth(body.gain, 5 * close);
      smooth(near.delay.delayTime, 0);
      smooth(far.delay.delayTime, itd);
      smooth(near.shadow.frequency, back);
      smooth(far.shadow.frequency, Math.min(back, 18_000 * (1_400 / 18_000) ** lateral));
      smooth(near.gain.gain, level * (1 + 0.25 * lateral));
      smooth(far.gain.gain, level * (1 - (0.8 + 0.12 * close) * lateral));
      const shine = lift >= 0 ? lift * 5.9 : lift * 8.9;
      smooth(near.air.gain, shine);
      smooth(far.air.gain, shine);
    },
  };
}
