import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "deployment", "sync-remotes.mjs");
const CODEUP_URL = "git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git";
const GITHUB_URL = "https://github.com/tianshao1992/fusion-digital.git";

function run(command, args, cwd, { expectFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!expectFailure && result.status !== 0) {
    assert.fail(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function git(cwd, ...args) {
  return run("git", args, cwd).stdout.trim();
}

async function createFixture(t, { codeupRemote = "codeup" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "fusiondigital-mirror-sync-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const codeup = join(directory, "codeup.git");
  const github = join(directory, "github.git");
  const worktree = join(directory, "worktree");
  await mkdir(worktree);
  git(directory, "init", "--bare", "--initial-branch=master", codeup);
  git(directory, "init", "--bare", "--initial-branch=main", github);
  git(worktree, "init", "--initial-branch=main");
  git(worktree, "config", "user.name", "Mirror Test");
  git(worktree, "config", "user.email", "mirror-test@example.invalid");
  await writeFile(join(worktree, "README.md"), "initial\n", "utf8");
  git(worktree, "add", "README.md");
  git(worktree, "commit", "-m", "initial");
  git(worktree, "config", `url.${pathToFileURL(codeup).href}.insteadOf`, CODEUP_URL);
  git(worktree, "config", `url.${pathToFileURL(github).href}.insteadOf`, GITHUB_URL);
  git(worktree, "remote", "add", codeupRemote, CODEUP_URL);
  git(worktree, "remote", "add", "github", GITHUB_URL);
  git(worktree, "push", codeupRemote, "HEAD:master");
  git(worktree, "push", "github", "HEAD:main");

  return { codeup, directory, github, worktree };
}

test("sync-remotes discovers Codeup when the remote is named origin", async (t) => {
  const fixture = await createFixture(t, { codeupRemote: "origin" });
  await writeFile(join(fixture.worktree, "README.md"), "origin alias\n", "utf8");
  git(fixture.worktree, "add", "README.md");
  git(fixture.worktree, "commit", "-m", "origin alias");
  const head = git(fixture.worktree, "rev-parse", "HEAD");

  const result = run(process.execPath, [SCRIPT], fixture.worktree);
  assert.match(result.stdout, /Verified codeup\/master and github\/main/u);
  assert.equal(remoteSha(fixture.codeup, "master"), head);
  assert.equal(remoteSha(fixture.github, "main"), head);
});

test("sync-remotes rejects a lookalike provider URL", async (t) => {
  const fixture = await createFixture(t, { codeupRemote: "origin" });
  git(
    fixture.worktree,
    "remote",
    "set-url",
    "origin",
    "https://evil.invalid/codeup.aliyun.com/fiatlux/DT/FusionDigital.git",
  );

  const result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No codeup remote found/u);
});

test("sync-remotes rejects an unapproved additional push URL", async (t) => {
  const fixture = await createFixture(t, { codeupRemote: "origin" });
  git(fixture.worktree, "remote", "set-url", "--add", "--push", "origin", CODEUP_URL);
  git(
    fixture.worktree,
    "remote",
    "set-url",
    "--add",
    "--push",
    "origin",
    "https://evil.invalid/codeup.git",
  );

  const result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No codeup remote found/u);
});

test("sync-remotes requires explicit disambiguation for duplicate provider remotes", async (t) => {
  const fixture = await createFixture(t, { codeupRemote: "origin" });
  git(fixture.worktree, "remote", "add", "codeup", CODEUP_URL);

  const result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Multiple codeup remotes found/u);
});

test("sync-remotes rejects plaintext and credential-bearing repository URLs", async (t) => {
  const fixture = await createFixture(t, { codeupRemote: "origin" });

  git(
    fixture.worktree,
    "remote",
    "set-url",
    "origin",
    "http://codeup.aliyun.com/fiatlux/DT/FusionDigital.git",
  );
  let result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No codeup remote found/u);

  git(fixture.worktree, "remote", "set-url", "origin", CODEUP_URL);
  git(
    fixture.worktree,
    "remote",
    "set-url",
    "github",
    "https://token@github.com/tianshao1992/fusion-digital.git",
  );
  result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No github remote found/u);
});

function remoteSha(remote, branch) {
  return git(remote, "rev-parse", `refs/heads/${branch}`);
}

test("sync-remotes publishes one clean HEAD to Codeup master and GitHub main", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.worktree, "README.md"), "next\n", "utf8");
  git(fixture.worktree, "add", "README.md");
  git(fixture.worktree, "commit", "-m", "next");
  const head = git(fixture.worktree, "rev-parse", "HEAD");

  const result = run(process.execPath, [SCRIPT], fixture.worktree);
  assert.match(result.stdout, /Verified codeup\/master and github\/main/u);
  assert.equal(remoteSha(fixture.codeup, "master"), head);
  assert.equal(remoteSha(fixture.github, "main"), head);
});

test("sync-remotes refuses a dirty worktree without changing either remote", async (t) => {
  const fixture = await createFixture(t);
  const codeupBefore = remoteSha(fixture.codeup, "master");
  const githubBefore = remoteSha(fixture.github, "main");
  await writeFile(join(fixture.worktree, "uncommitted.txt"), "dirty\n", "utf8");

  const result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Working tree is not clean/u);
  assert.equal(remoteSha(fixture.codeup, "master"), codeupBefore);
  assert.equal(remoteSha(fixture.github, "main"), githubBefore);
});

test("sync-remotes refuses remote commits missing from local HEAD before any push", async (t) => {
  const fixture = await createFixture(t);
  const outsider = join(fixture.directory, "outsider");
  git(fixture.directory, "clone", fixture.codeup, outsider);
  git(outsider, "config", "user.name", "Remote Test");
  git(outsider, "config", "user.email", "remote-test@example.invalid");
  await writeFile(join(outsider, "remote.txt"), "remote ahead\n", "utf8");
  git(outsider, "add", "remote.txt");
  git(outsider, "commit", "-m", "remote ahead");
  git(outsider, "push", "origin", "HEAD:master");
  const githubBefore = remoteSha(fixture.github, "main");

  const result = run(process.execPath, [SCRIPT], fixture.worktree, { expectFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains commits not included in local HEAD/u);
  assert.equal(remoteSha(fixture.github, "main"), githubBefore);
  assert.notEqual(remoteSha(fixture.codeup, "master"), githubBefore);
});
