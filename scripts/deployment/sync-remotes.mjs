#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const TARGET_SPECS = Object.freeze([
  Object.freeze({
    provider: "codeup",
    branch: "master",
    envName: "FUSIONDIGITAL_CODEUP_REMOTE",
    urlPatterns: Object.freeze([
      /^https:\/\/codeup\.aliyun\.com\/fiatlux\/DT\/FusionDigital(?:\.git)?\/?$/iu,
      /^ssh:\/\/git@codeup\.aliyun\.com(?::\d+)?\/fiatlux\/DT\/FusionDigital(?:\.git)?\/?$/iu,
      /^git@codeup\.aliyun\.com:fiatlux\/DT\/FusionDigital(?:\.git)?$/iu,
    ]),
  }),
  Object.freeze({
    provider: "github",
    branch: "main",
    envName: "FUSIONDIGITAL_GITHUB_REMOTE",
    urlPatterns: Object.freeze([
      /^https:\/\/github\.com\/tianshao1992\/fusion-digital(?:\.git)?\/?$/iu,
      /^ssh:\/\/git@github\.com(?::\d+)?\/tianshao1992\/fusion-digital(?:\.git)?\/?$/iu,
      /^ssh:\/\/git@ssh\.github\.com:443\/tianshao1992\/fusion-digital(?:\.git)?\/?$/iu,
      /^git@github\.com:tianshao1992\/fusion-digital(?:\.git)?$/iu,
    ]),
  }),
]);

const GIT_ENV = Object.freeze({
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
});

function runGit(args, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: GIT_ENV,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });

  if (result.error) {
    throw new Error(`Git could not run (${result.error.code ?? "unknown error"}).`);
  }
  if (!acceptedStatuses.includes(result.status)) {
    // Deliberately omit Git's raw output: a misconfigured remote URL or credential
    // helper can otherwise print secrets into CI or terminal logs.
    throw new Error(`Git command failed: git ${args.join(" ")}.`);
  }

  return {
    status: result.status,
    stdout: result.stdout.trim(),
  };
}

function readRemoteSha(remote, branch) {
  const ref = `refs/heads/${branch}`;
  const { stdout } = runGit(["ls-remote", "--exit-code", remote, ref]);
  const line = stdout.split(/\r?\n/u).find((candidate) => candidate.endsWith(`\t${ref}`));
  const sha = line?.split(/\s+/u, 1)[0];

  if (!sha || !/^[0-9a-f]{40,64}$/u.test(sha)) {
    throw new Error(`Could not resolve ${remote}/${branch}.`);
  }
  return sha;
}

function listRemoteNames() {
  const { stdout } = runGit(["remote"]);
  return stdout ? stdout.split(/\r?\n/u).filter(Boolean) : [];
}

function readConfiguredUrls(remote, key) {
  const { stdout } = runGit(
    ["config", "--get-all", `remote.${remote}.${key}`],
    { acceptedStatuses: [0, 1] },
  );
  return stdout ? stdout.split(/\r?\n/u).filter(Boolean) : [];
}

function readRemoteUrls(remote) {
  const fetchUrls = readConfiguredUrls(remote, "url");
  if (fetchUrls.length === 0) {
    throw new Error(`Git remote ${remote} has no configured URL.`);
  }
  const explicitPushUrls = readConfiguredUrls(remote, "pushurl");
  return {
    fetchUrls,
    pushUrls: explicitPushUrls.length > 0 ? explicitPushUrls : fetchUrls,
  };
}

function urlMatchesSpec(url, spec) {
  return spec.urlPatterns.some((pattern) => pattern.test(url));
}

function remoteMatchesSpec(remote, spec) {
  const { fetchUrls, pushUrls } = readRemoteUrls(remote);
  return [...fetchUrls, ...pushUrls].every((url) => urlMatchesSpec(url, spec));
}

function resolveRemote(spec, remoteNames) {
  const explicit = process.env[spec.envName]?.trim();
  if (explicit) {
    if (!remoteNames.includes(explicit)) {
      throw new Error(`${spec.envName} names an unknown Git remote.`);
    }
    if (!remoteMatchesSpec(explicit, spec)) {
      throw new Error(`${spec.envName} does not point to the approved ${spec.provider} repository.`);
    }
    return explicit;
  }

  const matching = remoteNames.filter((remote) => remoteMatchesSpec(remote, spec));
  if (matching.length === 1) {
    return matching[0];
  }
  if (matching.length > 1) {
    throw new Error(
      `Multiple ${spec.provider} remotes found; set ${spec.envName} explicitly.`,
    );
  }
  throw new Error(
    `No ${spec.provider} remote found; configure one or set ${spec.envName}.`,
  );
}

function resolveTargets() {
  const remoteNames = listRemoteNames();
  const targets = TARGET_SPECS.map((spec) => ({
    provider: spec.provider,
    remote: resolveRemote(spec, remoteNames),
    branch: spec.branch,
  }));
  if (new Set(targets.map(({ remote }) => remote)).size !== targets.length) {
    throw new Error("Codeup and GitHub must use different Git remotes.");
  }
  return targets;
}

function assertRepositoryReady(targets) {
  const { stdout: insideWorkTree } = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (insideWorkTree !== "true") {
    throw new Error("Current directory is not a Git working tree.");
  }

  const { stdout: changes } = runGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (changes) {
    throw new Error(
      "Working tree is not clean; run synchronization from a dedicated clean detached worktree. Do not stash, move, or delete unrelated user changes.",
    );
  }

  for (const { remote } of targets) {
    // Validate the configured push remote without ever printing its URL.
    runGit(["remote", "get-url", "--push", remote]);
  }
}

function assertRemoteIsContained({ remote, branch }, head) {
  const advertisedSha = readRemoteSha(remote, branch);
  const ref = `refs/heads/${branch}`;

  runGit(["fetch", "--no-tags", "--quiet", remote, ref]);
  const { stdout: fetchedSha } = runGit(["rev-parse", "--verify", "FETCH_HEAD"]);
  if (fetchedSha !== advertisedSha) {
    throw new Error(
      `${remote}/${branch} changed during preflight; retry after inspecting the remote.`,
    );
  }

  const ancestry = runGit(
    ["merge-base", "--is-ancestor", fetchedSha, head],
    { acceptedStatuses: [0, 1] },
  );
  if (ancestry.status !== 0) {
    throw new Error(
      `${remote}/${branch} contains commits not included in local HEAD; pull and reconcile first.`,
    );
  }
}

function assertHeadUnchanged(expectedHead) {
  const { stdout: currentHead } = runGit(["rev-parse", "--verify", "HEAD"]);
  if (currentHead !== expectedHead) {
    throw new Error("Local HEAD changed during mirror synchronization; retry from a stable checkout.");
  }
}

function synchronize() {
  const targets = resolveTargets();
  assertRepositoryReady(targets);
  const { stdout: head } = runGit(["rev-parse", "--verify", "HEAD"]);

  // Complete every divergence check before mutating either remote.
  for (const target of targets) {
    assertRemoteIsContained(target, head);
  }
  assertHeadUnchanged(head);

  // Check both write paths before the first real push. This cannot make two
  // independent Git servers transactional, but it avoids mutating Codeup when
  // GitHub is already known to reject the same normal update (or vice versa).
  for (const { remote, branch } of targets) {
    runGit(["push", "--dry-run", remote, `HEAD:${branch}`]);
  }
  assertHeadUnchanged(head);
  console.log(`Preflight passed for Codeup and GitHub at ${head}.`);

  for (const { provider, remote, branch } of targets) {
    assertHeadUnchanged(head);
    // Intentionally use a normal, explicit refspec. Never add --force or a '+' refspec.
    runGit(["push", remote, `HEAD:${branch}`]);
    console.log(`Pushed ${provider} HEAD:${branch}.`);
  }

  assertHeadUnchanged(head);
  const published = targets.map(({ provider, remote, branch }) => ({
    provider,
    remote,
    branch,
    sha: readRemoteSha(remote, branch),
  }));
  for (const target of published) {
    if (target.sha !== head) {
      throw new Error(
        `Post-push verification failed: ${target.provider}/${target.branch} is not local HEAD.`,
      );
    }
  }
  if (new Set(published.map(({ sha }) => sha)).size !== 1) {
    throw new Error("Post-push verification failed: Codeup and GitHub do not match.");
  }

  console.log(`Verified codeup/master and github/main at ${head}.`);
}

try {
  synchronize();
} catch (error) {
  console.error(`Remote synchronization aborted: ${error.message}`);
  process.exitCode = 1;
}
