import type { BookProgress, StoredBook } from "./book";

/**
 * Les livres de la personne et son marque-page, gardés dans le téléphone (IndexedDB) : un livre
 * protégé par le droit d'auteur ne quitte pas l'appareil, seul le morceau en cours part à la
 * mise en scène. Module côté navigateur uniquement.
 */

const DB = "btm-livres";
const BOOKS = "livres";
const PROGRESS = "marque-pages";

export type BookSummary = Pick<StoredBook, "id" | "title" | "addedAt" | "pages"> & { chapters: { title: string; chunks: number }[]; progress: BookProgress | null };

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(BOOKS, { keyPath: "id" });
      request.result.createObjectStore(PROGRESS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = work(tx);
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("abort"));
  });
}

export async function saveBook(book: StoredBook) {
  await run([BOOKS], "readwrite", (tx) => {
    tx.objectStore(BOOKS).put(book);
  });
}

export const loadBook = (id: string) => run<StoredBook | undefined>([BOOKS], "readonly", (tx) => tx.objectStore(BOOKS).get(id)).then((book) => book ?? null);

export const loadProgress = (id: string) => run<BookProgress | undefined>([PROGRESS], "readonly", (tx) => tx.objectStore(PROGRESS).get(id)).then((p) => p ?? null);

export async function saveProgress(id: string, progress: BookProgress) {
  await run([PROGRESS], "readwrite", (tx) => {
    tx.objectStore(PROGRESS).put(progress, id);
  });
}

export async function deleteBook(id: string) {
  await run([BOOKS, PROGRESS], "readwrite", (tx) => {
    tx.objectStore(BOOKS).delete(id);
    tx.objectStore(PROGRESS).delete(id);
  });
}

/** La liste des livres (sans leur texte), les plus récents d'abord. */
export async function listBooks(): Promise<BookSummary[]> {
  const [books, progress] = await Promise.all([
    run<StoredBook[]>([BOOKS], "readonly", (tx) => tx.objectStore(BOOKS).getAll()),
    run<IDBValidKey[]>([PROGRESS], "readonly", (tx) => tx.objectStore(PROGRESS).getAllKeys()).then(async (keys) =>
      Promise.all((keys ?? []).map(async (key) => [String(key), await loadProgress(String(key))] as const)),
    ),
  ]);
  const marks = new Map(progress);
  return (books ?? [])
    .map((book) => ({
      id: book.id,
      title: book.title,
      addedAt: book.addedAt,
      pages: book.pages,
      chapters: book.chapters.map((c) => ({ title: c.title, chunks: c.chunks.length })),
      progress: marks.get(book.id) ?? null,
    }))
    .sort((a, b) => (b.progress?.updatedAt ?? b.addedAt) - (a.progress?.updatedAt ?? a.addedAt));
}
