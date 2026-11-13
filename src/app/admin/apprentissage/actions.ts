"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { getAIProvider } from "@/lib/ai";
import { invalidateTamilyaBrain } from "@/lib/ai/brain";
import { completeText } from "@/lib/ai/complete";
import { tidy, type EntryTable } from "@/lib/language/cleanup";
import { GRAMMAR_LIMITS } from "./limits";

const MIGRATION = "20261125000000_apprentissage_shimaore.sql";
const TABLES: Record<EntryTable, "awa_words" | "awa_lexicon"> = { words: "awa_words", lexicon: "awa_lexicon" };
const MAX_LENGTH: Record<EntryTable, number> = { words: 80, lexicon: 200 };

function done(message: string): ActionResult {
  invalidateTamilyaBrain();
  revalidatePath("/admin/apprentissage");
  revalidatePath("/admin/lexique");
  return { ok: true, message };
}

/* ───────────── Grammaire ───────────── */

const grammarSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(1, "Donnez un titre à la règle.").max(GRAMMAR_LIMITS.title, "Titre trop long."),
  rule: z.string().trim().min(1, "Écrivez la règle.").max(GRAMMAR_LIMITS.rule, "Règle trop longue : coupez-la en deux."),
  examples: z.string().trim().max(GRAMMAR_LIMITS.examples, "Exemples trop longs."),
  isActive: z.boolean(),
});

/** Crée (id null) ou met à jour une règle de grammaire. */
export async function saveGrammarAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = grammarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { id, title, rule, examples, isActive } = parsed.data;
  const row = { title, rule, examples, is_active: isActive, updated_at: new Date().toISOString() };

  let error;
  if (id) {
    ({ error } = await auth.supabase.from("awa_grammar").update(row).eq("id", id));
  } else {
    // Nouvelle règle : à la fin de la liste.
    const { data: last } = await auth.supabase.from("awa_grammar").select("position").order("position", { ascending: false }).limit(1);
    ({ error } = await auth.supabase
      .from("awa_grammar")
      .insert({ ...row, position: (last?.[0]?.position ?? 0) + 1, created_by: auth.user.id }));
  }
  if (error) {
    console.error("[admin] Règle de grammaire non enregistrée", error);
    return { ok: false, message: `L'enregistrement a échoué (migration ${MIGRATION} appliquée ?).` };
  }
  return done(id ? "Règle enregistrée." : "Règle ajoutée : Tamilya l'applique dès le prochain message.");
}

export async function deleteGrammarAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Règle inconnue." };
  const { error } = await auth.supabase.from("awa_grammar").delete().eq("id", parsed.data);
  if (error) {
    console.error("[admin] Règle de grammaire non supprimée", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  return done("Règle supprimée.");
}

/** Nouvel ordre des règles (les plus importantes en haut : elles passent en premier). */
export async function reorderGrammarAction(ids: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.array(z.uuid()).max(100).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Ordre invalide." };
  const results = await Promise.all(
    parsed.data.map((id, position) => auth.supabase.from("awa_grammar").update({ position }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[admin] Ordre de la grammaire non enregistré", failed.error);
    return { ok: false, message: "L'ordre n'a pas été enregistré." };
  }
  return done("Ordre enregistré.");
}

/* ───────────── Nettoyage ───────────── */

const entrySchema = z.object({ table: z.enum(["words", "lexicon"]), id: z.uuid() });

const updateSchema = entrySchema.extend({
  french: z.string().trim().min(1, "Le français est vide."),
  shimaore: z.string().trim().min(1, "Le shimaoré est vide."),
});

/** Corrige une entrée du lexique (mot ou expression). */
export async function updateEntryAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { table, id } = parsed.data;
  const french = tidy(parsed.data.french);
  const shimaore = tidy(parsed.data.shimaore);
  if (french.length > MAX_LENGTH[table] || shimaore.length > MAX_LENGTH[table]) {
    return { ok: false, message: `${MAX_LENGTH[table]} caractères au plus.` };
  }
  const { error } = await auth.supabase.from(TABLES[table]).update({ french, shimaore }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Cette traduction existe déjà : supprimez plutôt celle-ci." };
    console.error("[admin] Entrée du lexique non corrigée", error);
    return { ok: false, message: "La correction a échoué." };
  }
  return done(`Corrigé : ${french} → ${shimaore}`);
}

export async function deleteEntryAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Entrée inconnue." };
  const { error } = await auth.supabase.from(TABLES[parsed.data.table]).delete().eq("id", parsed.data.id);
  if (error) {
    console.error("[admin] Entrée du lexique non supprimée", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  return done("Supprimé.");
}

/** Espaces en trop (début, fin, doubles) retirés partout d'un coup. */
export async function fixAllSpacesAction(): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  let fixed = 0;
  let skipped = 0;
  for (const table of ["words", "lexicon"] as const) {
    const { data, error } = await auth.supabase.from(TABLES[table]).select("id, french, shimaore").limit(10000);
    if (error) return { ok: false, message: "Lexique illisible." };
    for (const row of data ?? []) {
      const french = tidy(row.french);
      const shimaore = tidy(row.shimaore);
      if (french === row.french && shimaore === row.shimaore) continue;
      const { error: updateError } = await auth.supabase.from(TABLES[table]).update({ french, shimaore }).eq("id", row.id);
      if (updateError) skipped++;
      else fixed++;
    }
  }
  const rest = skipped ? ` ${skipped} en double, à supprimer à la main.` : "";
  return done(`${fixed} entrée${fixed > 1 ? "s" : ""} nettoyée${fixed > 1 ? "s" : ""}.${rest}`);
}

const ignoreSchema = z.object({ kind: z.string().min(1).max(30), ref: z.string().min(1).max(400) });

/** Remarque « c'est voulu » (mot emprunté, deux sens…) : elle ne revient plus. */
export async function ignoreIssueAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = ignoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Remarque inconnue." };
  const { error } = await auth.supabase.from("awa_cleanup_ignored").upsert(parsed.data);
  if (error) {
    console.error("[admin] Remarque non ignorée", error);
    return { ok: false, message: `L'opération a échoué (migration ${MIGRATION} appliquée ?).` };
  }
  revalidatePath("/admin/apprentissage");
  return { ok: true, message: "C'est noté, cette remarque ne reviendra plus." };
}

export type SpellingFix = { table: EntryTable; id: string; french: string; shimaore: string; fix: string };

const SPELLING_PROMPT = `Tu relis la colonne française d'un lexique français → shimaoré.
Pour chaque ligne numérotée, repère les vraies fautes d'orthographe, d'accord ou de frappe dans le FRANÇAIS seulement (ex. « horraires » → « horaires », « Pense de demander le chauffer » → « Pense à demander au chauffeur »).
Ne touche pas au sens, ne reformule pas une phrase correcte, ne traduis rien, garde les majuscules et la ponctuation.
Réponds uniquement par un tableau JSON des lignes à corriger : [{"n": numéro, "fix": "phrase corrigée"}]. Aucune faute : [].`;

/** L'IA relit le français du lexique et propose des corrections, appliquées une à une par l'administrateur. */
export async function checkSpellingAction(): Promise<{ ok: true; fixes: SpellingFix[] } | { ok: false; message: string }> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const [words, lexicon] = await Promise.all([
    auth.supabase.from("awa_words").select("id, french, shimaore").order("created_at", { ascending: false }).limit(500),
    auth.supabase.from("awa_lexicon").select("id, french, shimaore").order("created_at", { ascending: false }).limit(300),
  ]);
  if (words.error || lexicon.error) return { ok: false, message: "Lexique illisible." };
  const entries = [
    ...(lexicon.data ?? []).map((r) => ({ table: "lexicon" as const, ...r })),
    ...(words.data ?? []).map((r) => ({ table: "words" as const, ...r })),
  ];
  if (entries.length === 0) return { ok: true, fixes: [] };

  const ai = await getAIProvider();
  if (!ai.ok) return { ok: false, message: "L'IA n'est pas disponible pour l'instant." };
  const output = await completeText(ai.provider, {
    system: SPELLING_PROMPT,
    content: entries.map((e, i) => `${i + 1}. ${e.french.replace(/\s+/g, " ")}`).join("\n"),
    maxOutputTokens: 4000,
    timeoutMs: 60_000,
  }).catch((error: unknown) => {
    console.error("[admin] Relecture du lexique impossible", error);
    return null;
  });
  if (output === null) return { ok: false, message: "La relecture a échoué, réessayez." };

  const json = output.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return { ok: false, message: "Réponse de l'IA illisible, réessayez." };
  }
  const parsed = z.array(z.object({ n: z.number().int(), fix: z.string().trim().min(1).max(200) })).safeParse(rows);
  if (!parsed.success) return { ok: false, message: "Réponse de l'IA illisible, réessayez." };

  const fixes: SpellingFix[] = [];
  for (const { n, fix } of parsed.data) {
    const entry = entries[n - 1];
    if (!entry || tidy(fix) === tidy(entry.french) || fix.length > MAX_LENGTH[entry.table]) continue;
    fixes.push({ table: entry.table, id: entry.id, french: entry.french, shimaore: entry.shimaore, fix: tidy(fix) });
  }
  return { ok: true, fixes };
}
