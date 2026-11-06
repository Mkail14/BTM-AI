/**
 * Banque de documents : les dossiers rangés dans le Google Drive de la personne
 * (Tamilya / Identité, Tamilya / Logement…). Sans dépendance : sert au serveur
 * et à la page.
 */

export const DRIVE_FOLDERS = [
  { id: "identite", label: "Identité", words: ["identite", "passeport", "cni", "titre de sejour", "sejour", "recepisse", "naissance", "livret de famille", "mariage", "nationalite"] },
  { id: "logement", label: "Logement", words: ["bail", "loyer", "quittance", "hebergement", "domicile", "assurance habitation", "etat des lieux", "taxe fonciere", "taxe d habitation"] },
  { id: "sante", label: "Santé", words: ["ordonnance", "carte vitale", "vitale", "mutuelle", "vaccin", "analyse", "radio", "certificat medical", "hopital", "chm", "ameli", "cssm"] },
  { id: "travail", label: "Travail", words: ["cv", "contrat", "fiche de paie", "fiche de paye", "bulletin de salaire", "bulletin de paie", "salaire", "france travail", "pole emploi", "attestation employeur", "lettre de motivation"] },
  { id: "argent", label: "Argent et impôts", words: ["rib", "banque", "releve", "impot", "impots", "avis d imposition", "caf", "allocation", "pret", "credit"] },
  { id: "ecole", label: "École", words: ["diplome", "certificat de scolarite", "scolarite", "bulletin scolaire", "bulletin", "bac", "brevet", "parcoursup", "ecole", "college", "lycee", "universite"] },
  { id: "vehicule", label: "Véhicule", words: ["permis", "carte grise", "assurance auto", "assurance voiture", "controle technique", "neph", "code de la route", "voiture", "scooter"] },
  { id: "factures", label: "Factures", words: ["facture", "ticket", "recu", "edm", "smae", "sfr", "orange", "telma", "devis"] },
  { id: "autres", label: "Autres", words: [] },
] as const;

export type DriveFolderId = (typeof DRIVE_FOLDERS)[number]["id"];

export const DRIVE_FOLDER_IDS = DRIVE_FOLDERS.map((folder) => folder.id) as [DriveFolderId, ...DriveFolderId[]];

export const DRIVE_FALLBACK_FOLDER: DriveFolderId = "autres";

/** 100 Mo : assez pour un scan ou une vidéo courte, sans bloquer une connexion mobile pendant une heure. */
export const DRIVE_MAX_FILE_BYTES = 100 * 1024 * 1024;

export function isDriveFolderId(value: unknown): value is DriveFolderId {
  return DRIVE_FOLDERS.some((folder) => folder.id === value);
}

/** Sans accents ni majuscules, tout ce qui n'est ni lettre ni chiffre en espaces : « Fiche_de-Paie.PDF » → « fiche de paie pdf ». */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Dossier proposé d'après le nom du fichier. Mots entiers (« cni » ne se trouve
 * pas dans « technique ») et le plus long gagne : « bulletin de salaire » (Travail)
 * passe devant « bulletin » (École).
 */
export function guessDriveFolder(fileName: string): DriveFolderId {
  const name = ` ${normalize(fileName)} `;
  let best: { id: DriveFolderId; length: number } | null = null;
  for (const folder of DRIVE_FOLDERS) {
    for (const word of folder.words) {
      if (name.includes(` ${word} `) && word.length > (best?.length ?? 0)) best = { id: folder.id, length: word.length };
    }
  }
  return best?.id ?? DRIVE_FALLBACK_FOLDER;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedAt: string;
  link: string | null;
  folder: DriveFolderId;
};

/** Élément tel que renvoyé par Google. */
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
};

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
/** Marque posée sur nos dossiers : « root » pour Tamilya, sinon l'identifiant du dossier. */
export const DRIVE_MARK = "tamilya";
export const DRIVE_ROOT_MARK = "root";

export type DriveTree = {
  rootId: string | null;
  /** Dossier Drive de chaque rubrique ; absent tant que rien n'y a été rangé. */
  folderIds: Partial<Record<DriveFolderId, string>>;
  files: DriveFile[];
};

/**
 * Remet en ordre la liste de Google. L'accès étant limité aux fichiers créés par
 * Tamilya, cette liste est toute la banque. Un fichier sorti de ses dossiers
 * depuis le Drive reste affiché, dans « Autres ».
 */
export function organizeDrive(items: readonly DriveItem[]): DriveTree {
  const tree: DriveTree = { rootId: null, folderIds: {}, files: [] };
  const folderOf = new Map<string, DriveFolderId>();

  for (const item of items) {
    if (item.mimeType !== DRIVE_FOLDER_MIME) continue;
    const mark = item.appProperties?.[DRIVE_MARK];
    if (mark === DRIVE_ROOT_MARK) tree.rootId ??= item.id;
    else if (isDriveFolderId(mark)) {
      folderOf.set(item.id, mark);
      tree.folderIds[mark] ??= item.id;
    }
  }

  for (const item of items) {
    if (item.mimeType === DRIVE_FOLDER_MIME) continue;
    const parent = item.parents?.find((id) => folderOf.has(id));
    const size = Number(item.size);
    tree.files.push({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size !== undefined && Number.isFinite(size) ? size : null,
      modifiedAt: item.modifiedTime ?? "",
      link: item.webViewLink ?? null,
      folder: parent ? folderOf.get(parent)! : DRIVE_FALLBACK_FOLDER,
    });
  }

  tree.files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return tree;
}

/** « 2,4 Mo », « 340 Ko ». */
export function formatBytes(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}
