import { preload } from "react-dom";

/**
 * Écran de lancement (téléphone), sur le modèle du site BTM : fond noir, le « b »
 * du logo en filigrane se remplit de rose de bas en haut au rythme du chargement
 * réel, puis grandit un peu et s'efface. Ordinateur et tablette ne l'affichent jamais.
 *
 * Il fait partie du premier HTML et son script s'exécute avant l'application.
 * L'élément n'est jamais retiré du DOM (React l'a rendu) : il est seulement
 * masqué ; suppressHydrationWarning couvre la classe et le style posés par le script.
 * SplashReady signale la fin, une fois l'application hydratée.
 */
const SCRIPT = `(function () {
  var ecran = document.getElementById("ecran-chargement");
  function rien() {}
  try {
    if (!ecran || !window.matchMedia("(max-width: 639px)").matches) {
      window.__btmAiPret = window.__btmAiProgres = rien;
      return;
    }
    var html = document.documentElement;
    html.classList.add("chargement");
    var premiereVisite = true;
    try { premiereVisite = !sessionStorage.getItem("btm-ai-accueilli"); sessionStorage.setItem("btm-ai-accueilli", "1"); } catch (e) {}
    // Durée minimale : on voit le logo se remplir au lieu d'un éclair, plus longtemps à la première visite.
    var dureeMin = premiereVisite ? 1600 : 900;
    var debut = Date.now();
    var progres = 0, palier = 0.15;
    // Le remplissage ne va jamais plus vite que la durée minimale (courbe qui ralentit en haut).
    function rampe() { var t = Math.min(1, (Date.now() - debut) / dureeMin); return 1 - Math.pow(1 - t, 2); }
    function dessiner() { ecran.style.setProperty("--p", Math.min(progres, rampe()).toFixed(3)); }
    // Entre deux étapes réelles, le logo monte doucement sans atteindre le palier, pour ne pas sembler figé.
    var glissement = setInterval(function () { if (progres < 1) progres += (palier - progres) * 0.08; dessiner(); }, 80);
    window.__btmAiProgres = function (v) {
      if (v <= palier) return;
      progres = Math.max(progres, palier * 0.98);
      palier = v;
      dessiner();
    };
    var fini = false;
    window.__btmAiPret = function () {
      if (fini) return;
      fini = true;
      progres = 1;
      dessiner();
      setTimeout(function () {
        clearInterval(glissement);
        dessiner();
        ecran.classList.add("fini");
        html.classList.remove("chargement");
      }, Math.max(0, dureeMin - (Date.now() - debut)) + 500);
    };
    document.addEventListener("DOMContentLoaded", function () { window.__btmAiProgres(0.5); });
    window.addEventListener("load", function () { window.__btmAiProgres(0.8); });
    // Filet de sécurité : jamais bloqué derrière l'écran si l'application plante au démarrage.
    setTimeout(window.__btmAiPret, 8000);
  } catch (e) {
    if (ecran) ecran.classList.add("fini");
    document.documentElement.classList.remove("chargement");
    window.__btmAiPret = window.__btmAiProgres = rien;
  }
})();`;

export function SplashScreen() {
  // Le « b » doit être là dès la première image : chargé en priorité, avant la feuille de style.
  preload("/brand/btm-b.png", { as: "image", fetchPriority: "high" });
  return (
    <>
      <div id="ecran-chargement" role="status" aria-label="Chargement de BTM AI" suppressHydrationWarning>
        <div className="logo" aria-hidden="true">
          <span className="ombre" />
          <span className="plein" />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
