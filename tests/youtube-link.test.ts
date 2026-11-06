import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { androidYouTubeIntent, groupYouTubeLines, parseYouTubeLink, youtubeSearchUrl } from "@/lib/youtube/link";

describe("liens YouTube proposés par Tamilya", () => {
  it("reconnaît une recherche et une vidéo", () => {
    assert.deepEqual(parseYouTubeLink("https://www.youtube.com/results?search_query=recette+mataba"), {
      kind: "search",
      query: "recette mataba",
      url: "https://www.youtube.com/results?search_query=recette%20mataba",
    });
    assert.equal(parseYouTubeLink("https://youtu.be/dQw4w9WgXcQ")?.kind, "video");
    assert.equal(parseYouTubeLink("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(parseYouTubeLink("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.kind, "video");
  });

  it("laisse les autres liens tels quels", () => {
    for (const href of [undefined, "https://example.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=court", "https://www.youtube.com/", "javascript:alert(1)", "https://youtube.com.evil.fr/watch?v=dQw4w9WgXcQ"]) {
      assert.equal(parseYouTubeLink(href), null, String(href));
    }
  });

  it("ouvre l'app YouTube sur Android, avec le site en secours", () => {
    const intent = androidYouTubeIntent(youtubeSearchUrl("chigoma"));
    assert.ok(intent.startsWith("intent://www.youtube.com/results?search_query=chigoma#Intent;"));
    assert.ok(intent.includes("package=com.google.android.youtube"));
    assert.ok(intent.includes(`S.browser_fallback_url=${encodeURIComponent("https://www.youtube.com/results?search_query=chigoma")}`));
  });
});

describe("vidéos proposées en rangée", () => {
  it("réunit les lignes de vidéos, même en liste ou séparées par une ligne vide", () => {
    const text = "Voici :\n\n- [Recette](https://www.youtube.com/results?search_query=a)\n\n- [Danse](https://www.youtube.com/results?search_query=b)\n\nBon appétit";
    assert.equal(
      groupYouTubeLines(text),
      "Voici :\n\n[Recette](https://www.youtube.com/results?search_query=a) [Danse](https://www.youtube.com/results?search_query=b)\n\nBon appétit",
    );
  });

  it("ne touche ni aux autres liens ni aux blocs de code", () => {
    const text = "- [Site](https://example.com)\n```\n[V](https://youtu.be/dQw4w9WgXcQ)\n```";
    assert.equal(groupYouTubeLines(text), text);
  });
});

describe("vidéos montrées à la voix", () => {
  it("transforme ses recherches en cartes YouTube, trois au plus", async () => {
    const { voiceVideosBlock } = await import("@/lib/youtube/voice-videos");
    const block = voiceVideosBlock(["Squeezie vidéos drôles", "Squeezie meilleurs moments", "Squeezie vidéos drôles", "a", "b"]) ?? "";
    const lines = block.split("\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], "[Squeezie vidéos drôles](https://www.youtube.com/results?search_query=Squeezie%20vid%C3%A9os%20dr%C3%B4les&sp=CAM%253D)");
    assert.ok(lines.every((line) => parseYouTubeLink(/\((\S+)\)$/.exec(line)?.[1])?.kind === "search"));
  });

  it("n'affiche rien sans recherche, et ne casse pas le lien", async () => {
    const { voiceVideosBlock } = await import("@/lib/youtube/voice-videos");
    assert.equal(voiceVideosBlock([]), null);
    assert.equal(voiceVideosBlock(undefined), null);
    assert.equal(voiceVideosBlock("[x](y)"), "[x y](https://www.youtube.com/results?search_query=x%20y&sp=CAM%253D)");
  });

  it("garde le tri par vues quand la carte relit le lien", () => {
    const url = youtubeSearchUrl("Squeezie", true);
    assert.equal(parseYouTubeLink(url)?.url, url);
  });
});
