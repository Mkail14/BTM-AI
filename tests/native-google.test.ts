import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { googleButtonWorks, hasNativeGoogle, nativeGoogleSignIn } from "../src/lib/auth/google-identity";

function fakeApp(answer: (request: string, hashed: string) => [string, string]) {
  const win: Record<string, unknown> = {};
  win.TamilyaGoogle = {
    googleSignIn: (request: string, hashed: string) => {
      const [token, error] = answer(request, hashed);
      queueMicrotask(() => (win.__tamilyaGoogle as (id: string, token: string, error: string) => void)(request, token, error));
    },
  };
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  return () => Reflect.deleteProperty(globalThis, "window");
}

test("sans l'application, le bouton web reste", () => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  assert.equal(hasNativeGoogle(), false);
  Reflect.deleteProperty(globalThis, "window");
});

test("le téléphone reçoit l'empreinte du nonce, Supabase le nonce en clair", async () => {
  let hashed = "";
  const done = fakeApp((_, h) => {
    hashed = h;
    return ["jeton", ""];
  });
  assert.equal(hasNativeGoogle(), true);
  const picked = await nativeGoogleSignIn();
  done();
  assert.notEqual(picked, "cancelled");
  if (picked === "cancelled") return;
  assert.equal(picked.token, "jeton");
  assert.equal(hashed, createHash("sha256").update(picked.nonce).digest("hex"));
});

test("panneau fermé : pas d'erreur, rien ne se passe", async () => {
  const done = fakeApp(() => ["", "cancelled"]);
  assert.equal(await nativeGoogleSignIn(), "cancelled");
  done();
});

test("erreur du téléphone : elle remonte", async () => {
  const done = fakeApp(() => ["", "no-credential"]);
  await assert.rejects(nativeGoogleSignIn(), /no-credential/);
  done();
});

test("le bouton de Google ne compte que si son iframe a une taille (adresse acceptée par Google)", () => {
  const slot = (iframe: unknown) => ({ querySelector: () => iframe }) as unknown as Pick<HTMLElement, "querySelector">;
  const iframe = (width: number) => ({ getBoundingClientRect: () => ({ width }) });
  assert.equal(googleButtonWorks(slot(null)), false);
  assert.equal(googleButtonWorks(slot(iframe(0))), false);
  assert.equal(googleButtonWorks(slot(iframe(406))), true);
});
