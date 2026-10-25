import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasks = JSON.parse(readFileSync(".vscode/tasks.json", "utf8"));

test("Marketplace publish task invokes the guarded publish script", () => {
  const task = tasks.tasks.find((entry: { label?: string }) => entry.label === "publish extension to Marketplace");
  assert.ok(task);
  assert.equal(task.type, "process");
  assert.deepEqual(task.args, ["run", "publish:marketplace"]);
  assert.equal(task.options.env.VSCE_PAT, "${input:deckbridgeMarketplaceToken}");
  assert.equal(task.presentation.panel, "dedicated");

  const input = tasks.inputs.find((entry: { id?: string }) => entry.id === "deckbridgeMarketplaceToken");
  assert.ok(input);
  assert.equal(input.type, "promptString");
  assert.equal(input.password, true);
});
