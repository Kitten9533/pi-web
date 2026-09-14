import type { AssistantContentBlock, ToolResultMessage } from "./types";
import { resolveLocalFilePath } from "./file-links";
import { getFileName, getRelativeFilePath } from "./file-paths";
import { TEXT_PREVIEW_MAX_BYTES } from "./file-types";
import { countPatchLineStats } from "./patch";
import { isEditToolName, isWriteToolName } from "./tool-names";

export interface WrittenFile {
  /** Resolved absolute path of a file this turn wrote. */
  filePath: string;
  /** Path relative to the session cwd, for labels and patch headers. */
  displayPath: string;
  /** Unified patch for this turn's writes/edits, when one can be derived. */
  patch?: string;
  additions: number;
  deletions: number;
}

function isFileWritingToolName(toolName: string): boolean {
  return isWriteToolName(toolName) || isEditToolName(toolName);
}

function readToolPath(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const value = input.file_path ?? input.path;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToolResultPatch(result: ToolResultMessage): string | null {
  if (!isRecord(result.details)) return null;
  if (typeof result.details.patch === "string" && result.details.patch.length > 0) {
    return result.details.patch;
  }
  if (typeof result.details.diff === "string" && result.details.diff.length > 0) {
    return result.details.diff;
  }
  return null;
}

function createAddedFilePatch(gitPath: string, content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const lines = content.split("\n");
  if (hasTrailingNewline) lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  const noNewlineMarker = !hasTrailingNewline && lines.length > 0
    ? "\n\\ No newline at end of file"
    : "";
  return [
    `diff --git a/${gitPath} b/${gitPath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${gitPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    `${body}${noNewlineMarker}`,
  ].join("\n");
}

function toPatchGitPath(filePath: string, cwd?: string): string {
  const relative = getRelativeFilePath(filePath, cwd);
  if (relative !== filePath) return relative;
  if (relative.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(relative)) {
    return getFileName(relative);
  }
  return relative;
}

function isRelativizablePatchPath(path: string): boolean {
  if (path === "/dev/null") return false;
  if (path.startsWith("a/") || path.startsWith("b/")) return true;
  if (path.startsWith("/")) return true;
  return /^[a-zA-Z]:[\\/]/.test(path);
}

function rewritePatchHeader(line: string, cwd: string): string {
  const header = line.match(/^(--- |\+\+\+)(.*)$/);
  if (header) {
    const [pathPart] = header[2].split("\t");
    const trimmed = pathPart.trim();
    if (!isRelativizablePatchPath(trimmed)) return line;
    const stripped = trimmed.replace(/^[ab]\//, "");
    const relative = toPatchGitPath(stripped, cwd);
    return header[1].startsWith("+++") ? `+++ b/${relative}` : `--- a/${relative}`;
  }
  const git = line.match(/^diff --git a\/(.*) b\/(.*)$/);
  if (!git) return line;
  const left = toPatchGitPath(git[1].replace(/^[ab]\//, ""), cwd);
  const right = toPatchGitPath(git[2].replace(/^[ab]\//, ""), cwd);
  return `diff --git a/${left} b/${right}`;
}

function relativizePatch(patch: string, cwd?: string): string {
  if (!cwd) return patch;
  let hunkOldRemaining = 0;
  let hunkNewRemaining = 0;
  return patch.split(/\r?\n/).map((line) => {
    const insideHunk = hunkOldRemaining > 0 || hunkNewRemaining > 0;
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      hunkOldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      hunkNewRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      return line;
    }
    if (!insideHunk) return rewritePatchHeader(line, cwd);
    const prefix = line[0];
    if (prefix === " " || prefix === "\\") {
      if (hunkOldRemaining > 0) hunkOldRemaining -= 1;
      if (hunkNewRemaining > 0) hunkNewRemaining -= 1;
    } else if (prefix === "-") {
      if (hunkOldRemaining > 0) hunkOldRemaining -= 1;
    } else if (prefix === "+") {
      if (hunkNewRemaining > 0) hunkNewRemaining -= 1;
    }
    return line;
  }).join("\n");
}

function readCallPatch(
  toolName: string,
  input: Record<string, unknown> | undefined,
  result: ToolResultMessage,
  displayPath: string,
  cwd?: string,
): string | null {
  const fromResult = readToolResultPatch(result);
  if (fromResult) return relativizePatch(fromResult, cwd);
  if (!isWriteToolName(toolName)) return null;
  const content = input?.content;
  if (typeof content !== "string") return null;
  if (content.length > TEXT_PREVIEW_MAX_BYTES) return null;
  return relativizePatch(createAddedFilePatch(displayPath, content), cwd);
}

/**
 * Collect the distinct files a single assistant turn actually wrote.
 *
 * Every entry is derived from a `write`/`edit` tool call whose result arrived
 * and did not error — never from the reply text. A path the assistant merely
 * mentions in prose is not evidence that any file was touched, so it is not a
 * source here; the tool call is the record of what happened.
 *
 * Paths are resolved against `cwd`, deduped, and kept in first-seen order.
 * When a patch can be derived from the tool result or write content, it is
 * attached. Later successful writes/edits to the same path replace it, so the
 * card shows this turn's latest change, not a stack of intermediate diffs.
 * Patch headers are rewritten relative to `cwd`.
 */
export function extractTurnWrittenFiles(
  content: AssistantContentBlock[],
  toolResults: Map<string, ToolResultMessage> | undefined,
  cwd?: string,
): WrittenFile[] {
  const byPath = new Map<string, WrittenFile>();
  const writtenFiles: WrittenFile[] = [];

  for (const block of content) {
    if (block.type !== "toolCall") continue;
    if (!isFileWritingToolName(block.toolName)) continue;

    // No result yet (still streaming) or the call failed — nothing was written.
    const result = toolResults?.get(block.toolCallId);
    if (!result || result.isError) continue;

    const rawPath = readToolPath(block.input);
    if (!rawPath) continue;

    // Tool arguments are filesystem paths, not hrefs: preserve characters such
    // as #, ?, and :digits that have special meaning in links and source refs.
    const filePath = resolveLocalFilePath(rawPath, cwd);
    if (!filePath) continue;

    let entry = byPath.get(filePath);
    if (!entry) {
      entry = { filePath, displayPath: toPatchGitPath(filePath, cwd), additions: 0, deletions: 0 };
      byPath.set(filePath, entry);
      writtenFiles.push(entry);
    }

    const patch = readCallPatch(
      block.toolName,
      block.input,
      result,
      toPatchGitPath(filePath, cwd),
      cwd,
    );
    if (patch) {
      entry.patch = patch;
      const stats = countPatchLineStats(patch);
      entry.additions = stats.additions;
      entry.deletions = stats.deletions;
    }
  }

  return writtenFiles;
}
