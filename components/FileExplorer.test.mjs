import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./FileExplorer.tsx", import.meta.url), "utf8");

test("lets the changed-files pane switch between list and compact tree views", () => {
  assert.match(source, /compactFolders\(buildSearchTree\(/);
  assert.match(source, /loadChangesViewMode/);
  assert.match(source, /saveChangesViewMode/);
  assert.match(source, /files\.viewAsTree/);
  assert.match(source, /files\.viewAsList/);
  assert.match(source, /changesViewMode === "tree"/);
  assert.equal((source.match(/modeHint: "diff"/g) ?? []).length, 2);
});

test("strikes through deleted files in list and tree views", () => {
  const changeRow = source.slice(source.indexOf("function ChangeRow"), source.indexOf("function collectDirectoryPaths"));
  const treeNode = source.slice(source.indexOf("function ChangeTreeNode"), source.indexOf("export const FileExplorer"));
  assert.match(changeRow, /status\.status === "deleted"[\s\S]*?textDecoration: deleted \? "line-through"/);
  assert.match(treeNode, /gitStatus\?\.status === "deleted"[\s\S]*?textDecoration: deleted \? "line-through"/);
});

test("puts list-mode git status letters on the right", () => {
  const changeRow = source.slice(source.indexOf("function ChangeRow"), source.indexOf("function collectDirectoryPaths"));
  assert.match(changeRow, /\{rel\}[\s\S]*?<GitStatusBadge status=\{status\} t=\{t\} \/>/);
  assert.doesNotMatch(changeRow, /<GitStatusBadge status=\{status\} t=\{t\} \/>[\s\S]*\{rel\}/);
});

test("re-expands every changed-files folder when switching back to tree", () => {
  assert.match(
    source,
    /if \(next === "tree"\) \{[\s\S]*?collectDirectoryPaths\(changeTree\)[\s\S]*?setChangeTreeExpanded/,
  );
  assert.doesNotMatch(
    source,
    /if \(changesCollapsed \|\| changesViewMode !== "tree"\) return/,
  );
});

test("opens changed-files tree rows with the original git file path", () => {
  const treeNode = source.slice(
    source.indexOf("function ChangeTreeNode"),
    source.indexOf("export const FileExplorer"),
  );
  assert.match(treeNode, /onOpenFile\(gitStatus\.filePath, getFileName\(gitStatus\.filePath\)/);
  assert.doesNotMatch(treeNode, /joinFilePath\(cwd, node\.path\)/);
});

test("colors changed-files folder dots from aggregated git status", () => {
  const treeNode = source.slice(
    source.indexOf("function ChangeTreeNode"),
    source.indexOf("export const FileExplorer"),
  );
  assert.match(source, /aggregateGitStatuses/);
  assert.match(treeNode, /GIT_STATUS_COLORS\[folderKind\]/);
  assert.match(treeNode, /GIT_STATUS_KEYS\[folderKind\]/);
});
