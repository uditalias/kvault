#!/usr/bin/env node

const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const readline = require("readline");
const { tmpdir } = require("os");

const root = resolve(__dirname, "..");
const pkgPath = resolve(root, "package.json");
const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
const tauriConfPath = resolve(root, "src-tauri", "tauri.conf.json");

function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf-8" }).trim();
}

function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// ── version files ───────────────────────────────────────────────────────────

function readPkgVersion() {
  return JSON.parse(readFileSync(pkgPath, "utf-8")).version;
}

function writePkgVersion(v) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.version = v;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

function writeCargoVersion(v) {
  const toml = readFileSync(cargoPath, "utf-8");
  // Only replace the first `version = "..."` — it's the [package] one in this file.
  const updated = toml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${v}"`);
  if (updated === toml) die("Could not find version field in src-tauri/Cargo.toml");
  writeFileSync(cargoPath, updated);
}

function writeTauriConfVersion(v) {
  const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
  conf.version = v;
  writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + "\n");
}

function setAllVersions(v) {
  writePkgVersion(v);
  writeCargoVersion(v);
  writeTauriConfVersion(v);
}

// ── changelog ───────────────────────────────────────────────────────────────

function getLastTag() {
  try {
    return runCapture("git describe --tags --abbrev=0");
  } catch {
    return null;
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  try {
    return runCapture(`git log ${range} --pretty=format:"- %s (%h)"`)
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildChangelog(version, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const header = `## ${version} (${date})`;
  const body = commits.length > 0 ? commits.join("\n") : "- No notable changes";
  return `${header}\n\n${body}`;
}

function editInEditor(content) {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmpFile = resolve(tmpdir(), `kvault-changelog-${Date.now()}.md`);
  writeFileSync(tmpFile, content, "utf-8");

  try {
    execSync(`${editor} "${tmpFile}"`, { cwd: root, stdio: "inherit" });
  } catch {
    die("Editor exited with an error");
  }

  return readFileSync(tmpFile, "utf-8").trim();
}

function updateChangelog(entry) {
  const changelogPath = resolve(root, "CHANGELOG.md");
  if (existsSync(changelogPath)) {
    const existing = readFileSync(changelogPath, "utf-8");
    writeFileSync(changelogPath, entry + "\n\n" + existing);
  } else {
    writeFileSync(changelogPath, "# Changelog\n\n" + entry + "\n");
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure working tree is clean so we don't mix release commits with WIP.
  const status = runCapture("git status --porcelain");
  if (status) die("Working tree is dirty. Commit or stash your changes first.");

  const currentVersion = readPkgVersion();
  const parts = currentVersion.split(".").map(Number);
  const choices = {
    patch: [parts[0], parts[1], parts[2] + 1].join("."),
    minor: [parts[0], parts[1] + 1, 0].join("."),
    major: [parts[0] + 1, 0, 0].join("."),
  };

  console.log(`\nCurrent version: ${currentVersion}\n`);
  console.log(`  1) patch → ${choices.patch}`);
  console.log(`  2) minor → ${choices.minor}`);
  console.log(`  3) major → ${choices.major}`);
  console.log(`  4) custom\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  const choice = await ask("Select version bump [1-4]: ");

  let nextVersion;
  switch (choice.trim()) {
    case "1": nextVersion = choices.patch; break;
    case "2": nextVersion = choices.minor; break;
    case "3": nextVersion = choices.major; break;
    case "4": {
      const custom = await ask("Enter version (x.y.z): ");
      if (!SEMVER_RE.test(custom.trim())) { rl.close(); die(`Invalid version: "${custom.trim()}"`); }
      nextVersion = custom.trim();
      break;
    }
    default: rl.close(); die(`Invalid choice: "${choice.trim()}"`);
  }
  rl.close();

  console.log(`\nReleasing ${currentVersion} → ${nextVersion}\n`);

  // 1. Tests
  console.log("── Running Rust tests ──");
  try {
    run("cargo test", { cwd: resolve(root, "src-tauri") });
  } catch {
    die("Rust tests failed. Fix them before releasing.");
  }

  console.log("\n── Type-check + frontend build ──");
  try {
    run("npm run build");
  } catch {
    die("Frontend build failed. Fix it before releasing.");
  }

  // 2. Bump versions in all three files
  setAllVersions(nextVersion);
  console.log(`\n✓ package.json, Cargo.toml, tauri.conf.json → ${nextVersion}`);

  // 3. Changelog
  console.log("\n── Changelog ──");
  const lastTag = getLastTag();
  const commits = getCommitsSinceTag(lastTag);
  const draft = buildChangelog(nextVersion, commits);

  console.log("\nAuto-generated changelog:\n");
  console.log(draft);
  console.log("\nOpening editor to review and edit...\n");

  const finalEntry = editInEditor(draft);
  if (!finalEntry) {
    setAllVersions(currentVersion);
    die("Empty changelog. Aborting (version files restored).");
  }

  updateChangelog(finalEntry);
  console.log("✓ CHANGELOG.md updated");

  // 4. Commit + tag. Cargo.lock also bumps because Cargo.toml changed — include it.
  try {
    run("cargo check --manifest-path src-tauri/Cargo.toml");
  } catch {
    // non-fatal — Cargo.lock may still need committing if generated
  }
  run("git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md");
  run(`git commit -m "release: v${nextVersion}"`);
  run(`git tag v${nextVersion}`);

  console.log(`\n✓ Tagged v${nextVersion}`);
  console.log(`\nPush to trigger the Release workflow:\n`);
  console.log(`  git push && git push --tags\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
