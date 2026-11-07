// Resonance Audio (Google, Apache-2.0) : seules les parties utilisées par la lecture en 3D.
declare module "resonance-audio" {
  export type RoomDimensions = { width: number; height: number; depth: number };
  export type RoomMaterials = { left: string; right: string; front: string; back: string; up: string; down: string };

  export class Source {
    input: GainNode;
    setPosition(x: number, y: number, z: number): void;
    setGain(gain: number): void;
    setSourceWidth(degrees: number): void;
  }

  export class ResonanceAudio {
    constructor(
      context: BaseAudioContext,
      options?: { ambisonicOrder?: number; dimensions?: RoomDimensions; materials?: RoomMaterials },
    );
    output: GainNode;
    createSource(options?: { minDistance?: number; maxDistance?: number; rolloff?: "logarithmic" | "linear" | "none"; gain?: number; sourceWidth?: number }): Source;
    setRoomProperties(dimensions: RoomDimensions, materials: RoomMaterials): void;
  }
}
