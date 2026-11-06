/**
 * Micro-vibrations du téléphone pendant une réponse de Tamilya.
 *
 * Android : API Vibration. iPhone : Safari ne la propose pas, mais depuis
 * iOS 18 basculer un interrupteur natif (<input type="checkbox" switch>)
 * déclenche le petit retour haptique du système ; on en garde un, invisible.
 * Sans effet sur ordinateur et sur les appareils qui ne vibrent pas.
 */
let iosSwitch: HTMLLabelElement | null = null;

function pulse(android: number | number[]) {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return false;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(android);
    return false;
  }
  if (!iosSwitch) {
    iosSwitch = document.createElement("label");
    iosSwitch.ariaHidden = "true";
    iosSwitch.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.tabIndex = -1;
    input.setAttribute("switch", "");
    iosSwitch.append(input);
    document.body.append(iosSwitch);
  }
  iosSwitch.click();
  return true;
}

/** Appui sur un bouton : une impulsion nette. */
export function hapticPress() {
  pulse(15);
}

/** Tamilya commence à écrire : une seule petite impulsion. */
export function hapticWriting() {
  pulse(10);
}

/** Pendant que Tamilya écrit : vibration très légère, comme une frappe (cadencée par useTypewriter). */
export function hapticTick() {
  pulse(4);
}

/** Billet déchiré (commande reçue) : petites secousses, comme du papier qu'on arrache. */
export function hapticTear() {
  pulse([8, 25, 8, 25, 8, 25, 40]);
}

/** Réponse prête : deux impulsions rapprochées. */
export function hapticReady() {
  if (pulse([10, 70, 10])) setTimeout(() => iosSwitch?.click(), 90);
}
