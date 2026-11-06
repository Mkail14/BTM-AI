"use client";

import { useEffect } from "react";
import { hapticPress } from "@/lib/chat/haptics";

const PRESSABLE = 'button,a,summary,select,[role=button],[role=tab],[role=menuitem],[role=switch],[role=option],input[type=checkbox],input[type=radio]';

/** Petite vibration sur tous les boutons du site. Dans l'app Android, c'est l'app qui s'en charge. */
export function PressHaptics() {
  useEffect(() => {
    if ("TamilyaNative" in window) return;
    const onClick = (event: MouseEvent) => {
      // click() de l'interrupteur iPhone : ce n'est pas un appui de la personne.
      if (!event.isTrusted) return;
      if (event.target instanceof Element && event.target.closest(PRESSABLE)) hapticPress();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
