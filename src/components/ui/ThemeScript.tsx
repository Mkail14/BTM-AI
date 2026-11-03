/**
 * Thème clair / sombre : posé sur <html data-theme> avant le premier affichage,
 * d'après le choix enregistré (ThemeToggle), sinon le réglage du téléphone ou
 * de l'ordinateur (suivi tant que la personne n'a rien choisi).
 */
export const THEME_STORAGE_KEY = "btm-theme";
const COLORS = { light: "#ffffff", dark: "#131516" } as const;

const SCRIPT = `(function () {
  var html = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function choix() { try { return localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) { return null; } }
  function poser(theme) {
    html.dataset.theme = theme;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].content = theme === "dark" ? "${COLORS.dark}" : "${COLORS.light}";
  }
  window.__btmTheme = poser;
  var enregistre = choix();
  poser(enregistre === "light" || enregistre === "dark" ? enregistre : media.matches ? "dark" : "light");
  media.addEventListener("change", function (e) { if (!choix()) poser(e.matches ? "dark" : "light"); });
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
