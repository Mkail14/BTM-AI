/**
 * Voix toutes faites de Gemini (synthèse vocale). Elles parlent toutes
 * français ; le nom vient de Google, la description est la nôtre.
 */
export const GEMINI_VOICES = [
  { id: "Leda", label: "Leda", gender: "femme", description: "Jeune et douce" },
  { id: "Aoede", label: "Aoede", gender: "femme", description: "Légère et naturelle" },
  { id: "Kore", label: "Kore", gender: "femme", description: "Posée et sûre d'elle" },
  { id: "Zephyr", label: "Zephyr", gender: "femme", description: "Lumineuse" },
  { id: "Despina", label: "Despina", gender: "femme", description: "Souriante" },
  { id: "Autonoe", label: "Autonoe", gender: "femme", description: "Claire" },
  { id: "Callirrhoe", label: "Callirrhoe", gender: "femme", description: "Détendue" },
  { id: "Erinome", label: "Erinome", gender: "femme", description: "Nette" },
  { id: "Laomedeia", label: "Laomedeia", gender: "femme", description: "Enjouée" },
  { id: "Achernar", label: "Achernar", gender: "femme", description: "Tendre" },
  { id: "Pulcherrima", label: "Pulcherrima", gender: "femme", description: "Franche" },
  { id: "Vindemiatrix", label: "Vindemiatrix", gender: "femme", description: "Calme" },
  { id: "Sulafat", label: "Sulafat", gender: "femme", description: "Chaleureuse" },
  { id: "Gacrux", label: "Gacrux", gender: "femme", description: "Mûre" },
  { id: "Puck", label: "Puck", gender: "homme", description: "Joyeux" },
  { id: "Charon", label: "Charon", gender: "homme", description: "Informatif" },
  { id: "Fenrir", label: "Fenrir", gender: "homme", description: "Vif" },
  { id: "Orus", label: "Orus", gender: "homme", description: "Ferme" },
  { id: "Achird", label: "Achird", gender: "homme", description: "Amical" },
  { id: "Algieba", label: "Algieba", gender: "homme", description: "Doux" },
  { id: "Iapetus", label: "Iapetus", gender: "homme", description: "Clair" },
  { id: "Umbriel", label: "Umbriel", gender: "homme", description: "Détendu" },
  { id: "Sadachbia", label: "Sadachbia", gender: "homme", description: "Animé" },
] as const;

export type GeminiVoiceId = (typeof GEMINI_VOICES)[number]["id"];

export const DEFAULT_VOICE: GeminiVoiceId = "Leda";

export const isGeminiVoice = (value: unknown): value is GeminiVoiceId =>
  typeof value === "string" && GEMINI_VOICES.some((v) => v.id === value);

/** Texte lu au plus par demande (une réponse vocale de Tamilya est bien plus courte). */
export const SPEECH_MAX_CHARS = 2_000;
