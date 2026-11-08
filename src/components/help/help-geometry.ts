/** Placement du rond et du panneau d'aide, partagé par HelpBubble et HelpPanel. */

/** Marge au bord de l'écran (px). */
export const EDGE = 16;

/**
 * Encoche et barre d'accueil (iPhone, Android plein écran) : hauteurs lues dans le CSS
 * (env(safe-area-inset-*)), que le script ne connaît pas autrement. Un élément invisible
 * prend ces hauteurs le temps d'une mesure.
 */
export function safeArea(): { top: number; bottom: number } {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}
