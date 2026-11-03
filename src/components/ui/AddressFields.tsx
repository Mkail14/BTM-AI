"use client";

import { useState } from "react";
import { geolocationErrorMessage, isInMayotte, MAX_GPS_ACCURACY_M, type GeoPoint } from "@/lib/address";
import { MAYOTTE_COMMUNES } from "@/lib/code-exam/candidate";

export type AddressDraft = { commune: string; line: string; geo: GeoPoint | null };
export const EMPTY_ADDRESS: AddressDraft = { commune: "", line: "", geo: null };

/**
 * Commune + adresse écrite (rue, quartier, repère) et, si `gps`, le bouton
 * « Me localiser » : la position aide le livreur quand l'adresse ne suffit pas.
 * Utilisé à l'inscription et à chaque livraison.
 */
export function AddressFields({
  id,
  value,
  onChange,
  errors,
  inputClass,
  labelClass = "block text-sm font-medium",
  communes = MAYOTTE_COMMUNES,
  gps = false,
}: {
  id: string;
  value: AddressDraft;
  onChange: (value: AddressDraft) => void;
  /** Messages à afficher sous les champs (null : rien à signaler). */
  errors: { commune: string | null; line: string | null };
  inputClass: string;
  labelClass?: string;
  communes?: readonly string[];
  gps?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setGpsError("Ton navigateur ne sait pas donner ta position. Écris ton adresse.");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (!isInMayotte(coords.latitude, coords.longitude)) {
          setGpsError("Ta position n'est pas à Mayotte : écris ton adresse.");
        } else if (coords.accuracy > MAX_GPS_ACCURACY_M) {
          setGpsError("Position trop imprécise : sors un peu, active le GPS, ou écris ton adresse.");
        } else {
          onChange({ ...value, geo: { lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) } });
        }
      },
      (error) => {
        setLocating(false);
        setGpsError(geolocationErrorMessage(error.code));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const errorLine = (message: string | null) => (message ? <p className="mt-1 text-xs text-danger">{message}</p> : null);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-commune`} className={labelClass}>
          Commune
        </label>
        <select
          id={`${id}-commune`}
          value={value.commune}
          onChange={(e) => onChange({ ...value, commune: e.target.value })}
          autoComplete="address-level2"
          aria-invalid={errors.commune ? true : undefined}
          className={`${inputClass} ${errors.commune ? "border-danger" : ""}`}
        >
          <option value="">Choisir…</option>
          {communes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errorLine(errors.commune)}
      </div>
      <div>
        <label htmlFor={`${id}-line`} className={labelClass}>
          Adresse exacte
        </label>
        <input
          id={`${id}-line`}
          value={value.line}
          onChange={(e) => onChange({ ...value, line: e.target.value })}
          autoComplete="street-address"
          maxLength={200}
          placeholder="Rue, quartier, repère (près de la mosquée…)"
          aria-invalid={errors.line ? true : undefined}
          className={`${inputClass} ${errors.line ? "border-danger" : ""}`}
        />
        {errorLine(errors.line)}
      </div>
      {gps ? (
        <div className="text-sm" aria-live="polite">
          {value.geo ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-muted">
              <span className="font-medium text-fg">📍 Position GPS ajoutée</span>
              <span>(à {value.geo.accuracy} m près)</span>
              <button type="button" onClick={() => onChange({ ...value, geo: null })} className="underline underline-offset-2">
                Retirer
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium hover:bg-bg-muted disabled:opacity-60"
            >
              📍 {locating ? "Localisation…" : "Utiliser ma position actuelle"}
            </button>
          )}
          {gpsError ? <p className="mt-1 text-xs text-danger">{gpsError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
