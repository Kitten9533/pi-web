const EXPLORER_OPEN_STORAGE_KEY = "pi-web:file-explorer:open";
const CHANGES_VIEW_STORAGE_KEY = "pi-web:file-explorer:changes-view";

export type ChangesViewMode = "list" | "tree";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadExplorerOpen(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(EXPLORER_OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveExplorerOpen(
  open: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(EXPLORER_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Persistence is best-effort; privacy mode and storage quotas must not break the explorer.
  }
}

export function loadChangesViewMode(
  storage: StorageLike | null = getBrowserStorage(),
): ChangesViewMode {
  if (!storage) return "list";
  try {
    return storage.getItem(CHANGES_VIEW_STORAGE_KEY) === "tree" ? "tree" : "list";
  } catch {
    return "list";
  }
}

export function saveChangesViewMode(
  mode: ChangesViewMode,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CHANGES_VIEW_STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort; privacy mode and storage quotas must not break the explorer.
  }
}
