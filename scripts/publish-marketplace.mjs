import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;
const vsix = `deckbridge-${version}.vsix`;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!process.env.VSCE_PAT) {
  console.error("VSCE_PAT não está definido. Defina o token antes de publicar.");
  process.exit(1);
}

run("npm", ["ci"]);
run("npm", ["test"]);
run("npm", ["audit", "--omit=dev", "--audit-level=high"]);
run("npm", ["run", "package:release"]);

if (!existsSync(vsix)) {
  console.error(`VSIX não encontrado: ${vsix}`);
  process.exit(1);
}

run("npm", ["run", "validate:vsix", "--", vsix]);
run(npx, ["--no-install", "vsce", "publish", "--packagePath", vsix, "--pat", process.env.VSCE_PAT]);
