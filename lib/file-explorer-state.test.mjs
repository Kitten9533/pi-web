import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  loadExplorerOpen,
  saveExplorerOpen,
  loadChangesViewMode,
  saveChangesViewMode,
} = await jiti.import("./file-explorer-state.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("defaults to an open file explorer", () => {
  assert.equal(loadExplorerOpen(createStorage()), true);
});

test("saves and restores the file explorer panel state", () => {
  const storage = createStorage();

  saveExplorerOpen(false, storage);
  assert.equal(loadExplorerOpen(storage), false);

  saveExplorerOpen(true, storage);
  assert.equal(loadExplorerOpen(storage), true);
});

test("falls back to open when browser storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };

  assert.equal(loadExplorerOpen(unavailable), true);
  assert.doesNotThrow(() => saveExplorerOpen(false, unavailable));
});

test("defaults changed-files view to a list", () => {
  assert.equal(loadChangesViewMode(createStorage()), "list");
});

test("saves and restores the changed-files view mode", () => {
  const storage = createStorage();

  saveChangesViewMode("tree", storage);
  assert.equal(loadChangesViewMode(storage), "tree");

  saveChangesViewMode("list", storage);
  assert.equal(loadChangesViewMode(storage), "list");
});

test("falls back to list for invalid changed-files view values", () => {
  assert.equal(loadChangesViewMode(createStorage({ "pi-web:file-explorer:changes-view": "grid" })), "list");
});

test("falls back to list when changed-files view storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };

  assert.equal(loadChangesViewMode(unavailable), "list");
  assert.doesNotThrow(() => saveChangesViewMode("tree", unavailable));
});

test("falls back when accessing browser storage throws", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const blockedWindow = {};
  Object.defineProperty(blockedWindow, "localStorage", {
    get() { throw new DOMException("blocked", "SecurityError"); },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: blockedWindow,
  });

  try {
    assert.equal(loadExplorerOpen(), true);
    assert.doesNotThrow(() => saveExplorerOpen(false));
    assert.equal(loadChangesViewMode(), "list");
    assert.doesNotThrow(() => saveChangesViewMode("tree"));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
  }
});
