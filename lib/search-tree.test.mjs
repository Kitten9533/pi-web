import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./search-tree.ts");
}

function names(nodes) {
  return nodes.map((node) => node.name);
}

test("groups flat paths into directories with files at the root level", async () => {
  const { buildSearchTree } = await loadSubject();
  const tree = buildSearchTree([
    "components/FileExplorer.tsx",
    "components/SessionSidebar.tsx",
    "lib/paths.ts",
    "README.md",
  ]);

  assert.deepEqual(names(tree), ["components", "lib", "README.md"]);

  const components = tree[0];
  assert.equal(components.isDir, true);
  assert.equal(components.path, "components");
  assert.deepEqual(names(components.children), ["FileExplorer.tsx", "SessionSidebar.tsx"]);
  assert.equal(components.children[0].isDir, false);
  assert.equal(components.children[0].path, "components/FileExplorer.tsx");

  assert.equal(tree[2].name, "README.md");
  assert.equal(tree[2].isDir, false);
  assert.deepEqual(tree[2].children, []);
});

test("builds arbitrarily deep nesting", async () => {
  const { buildSearchTree } = await loadSubject();
  const tree = buildSearchTree(["app/api/files/[...path]/route.ts"]);

  const [app] = tree;
  assert.deepEqual(names(tree), ["app"]);
  const [api] = app.children;
  const [files] = api.children;
  const [bracketDir] = files.children;
  assert.deepEqual([api.name, files.name, bracketDir.name], ["api", "files", "[...path]"]);
  for (const dir of [app, api, files, bracketDir]) assert.equal(dir.isDir, true);
  assert.deepEqual(names(bracketDir.children), ["route.ts"]);
  assert.equal(bracketDir.children[0].isDir, false);
});

test("sorts directories before files and alphabetically within each level", async () => {
  const { buildSearchTree } = await loadSubject();
  const tree = buildSearchTree([
    "z.txt",
    "a/b/c.ts",
    "a/b/d.ts",
    "m/n.ts",
    "a/a.ts",
    "b/x.ts",
  ]);

  assert.deepEqual(names(tree), ["a", "b", "m", "z.txt"]);

  const a = tree[0];
  // Directory "b" (from a/b/*) sorts before file "a.ts"
  assert.deepEqual(names(a.children), ["b", "a.ts"]);
  assert.deepEqual(names(a.children[0].children), ["c.ts", "d.ts"]);

  const b = tree[1];
  assert.deepEqual(names(b.children), ["x.ts"]);
});

test("deduplicates repeated paths", async () => {
  const { buildSearchTree } = await loadSubject();
  const tree = buildSearchTree(["a/b.ts", "a/b.ts", "a/b.ts"]);
  assert.deepEqual(names(tree), ["a"]);
  assert.deepEqual(names(tree[0].children), ["b.ts"]);
});

test("returns an empty tree for empty input", async () => {
  const { buildSearchTree } = await loadSubject();
  assert.deepEqual(buildSearchTree([]), []);
});

test("treats a lone segment as a root file, not a directory", async () => {
  const { buildSearchTree } = await loadSubject();
  const tree = buildSearchTree(["single.txt"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].isDir, false);
  assert.equal(tree[0].path, "single.txt");
  assert.deepEqual(tree[0].children, []);
});

test("compacts a single-child directory chain into one row", async () => {
  const { buildSearchTree, compactFolders } = await loadSubject();
  const [root] = compactFolders(buildSearchTree(["src/components/Button.tsx"]));

  assert.equal(root.isDir, true);
  assert.equal(root.name, "src/components");
  assert.equal(root.path, "src/components");
  assert.deepEqual(names(root.children), ["Button.tsx"]);
  assert.equal(root.children[0].isDir, false);
  assert.equal(root.children[0].path, "src/components/Button.tsx");
});

test("does not compact a directory that also contains a file", async () => {
  const { buildSearchTree, compactFolders } = await loadSubject();
  const [root] = compactFolders(buildSearchTree(["src/a.ts", "src/lib/b.ts"]));

  assert.equal(root.name, "src");
  assert.deepEqual(names(root.children), ["lib", "a.ts"]);
  assert.equal(root.children[0].name, "lib");
  assert.deepEqual(names(root.children[0].children), ["b.ts"]);
});

test("does not compact a directory whose only child is a file", async () => {
  const { buildSearchTree, compactFolders } = await loadSubject();
  const [root] = compactFolders(buildSearchTree(["src/a.ts"]));

  assert.equal(root.name, "src");
  assert.equal(root.path, "src");
  assert.deepEqual(names(root.children), ["a.ts"]);
});

test("leaves root files untouched while compacting sibling folders", async () => {
  const { buildSearchTree, compactFolders } = await loadSubject();
  const tree = compactFolders(buildSearchTree([
    "README.md",
    "app/api/files/route.ts",
  ]));

  assert.deepEqual(names(tree), ["app/api/files", "README.md"]);
  assert.equal(tree[0].path, "app/api/files");
  assert.deepEqual(names(tree[0].children), ["route.ts"]);
});

test("compactFolders does not mutate the original tree", async () => {
  const { buildSearchTree, compactFolders } = await loadSubject();
  const original = buildSearchTree(["a/b/c.ts"]);
  compactFolders(original);
  assert.equal(original[0].name, "a");
  assert.equal(original[0].children[0].name, "b");
});
