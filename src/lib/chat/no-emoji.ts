/** Un emoji, composé ou non. Les symboles de texte (→, ✓, ★, ©) ne sont pas touchés. */
const EMOJI = /[ \t]*(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)*/gu;

/** Texte de Tamilya sans emoji, y compris dans les anciennes conversations. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "");
}
