import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./git-status.ts");
}

test("aggregateGitStatuses uses a single shared kind", async () => {
  const { aggregateGitStatuses } = await loadSubject();
  assert.equal(aggregateGitStatuses(["added", "added"]), "added");
  assert.equal(aggregateGitStatuses(["deleted"]), "deleted");
  assert.equal(aggregateGitStatuses(["renamed", "renamed"]), "renamed");
  assert.equal(aggregateGitStatuses(["untracked"]), "untracked");
  assert.equal(aggregateGitStatuses(["modified", "modified"]), "modified");
});

test("aggregateGitStatuses treats mixed kinds as modified and conflicts as conflict", async () => {
  const { aggregateGitStatuses } = await loadSubject();
  assert.equal(aggregateGitStatuses(["added", "deleted"]), "modified");
  assert.equal(aggregateGitStatuses(["added", "modified"]), "modified");
  assert.equal(aggregateGitStatuses(["conflict", "added"]), "conflict");
  assert.equal(aggregateGitStatuses([]), null);
});
