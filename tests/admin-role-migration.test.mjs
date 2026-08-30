import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const TARGET_USER_ID = "usr_2M07EMVVT966K1Q6JENHVR0Z8G";
const AUDIT_EVENT_ID = "aud_8Y5WJWC7J110X4DWNGGRDSH1HM";
const migrationSql = readFileSync(
  new URL("../drizzle/0003_owner_approved_admin_bootstrap.sql", import.meta.url),
  "utf8",
);
const migrationStatements = migrationSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const executableSql = migrationSql.replace(/^--.*$/gmu, "");

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted'))
    );
    CREATE TABLE user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('member', 'contributor', 'reviewer', 'admin', 'agent')),
      granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      granted_at TEXT NOT NULL,
      revoked_at TEXT,
      PRIMARY KEY (user_id, role)
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      request_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
      metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
      occurred_at TEXT NOT NULL
    );
  `);
  return database;
}

function applyMigration(database) {
  for (const statement of migrationStatements) database.exec(statement);
}

test("grants only the exact active Sites account and records an out-of-band audit", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run(TARGET_USER_ID);
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run("usr_other_active");
  database.prepare(
    "INSERT INTO user_roles (user_id, role, granted_by_user_id, granted_at, revoked_at) VALUES (?, 'member', NULL, '2026-08-13T01:07:04.860Z', NULL)",
  ).run(TARGET_USER_ID);

  applyMigration(database);

  const roles = database
    .prepare("SELECT user_id, role, granted_by_user_id, revoked_at FROM user_roles ORDER BY user_id, role")
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(roles, [
    {
      user_id: TARGET_USER_ID,
      role: "admin",
      granted_by_user_id: null,
      revoked_at: null,
    },
    {
      user_id: TARGET_USER_ID,
      role: "member",
      granted_by_user_id: null,
      revoked_at: null,
    },
  ]);

  const audit = database.prepare("SELECT * FROM audit_events WHERE id = ?").get(AUDIT_EVENT_ID);
  assert.equal(audit.actor_user_id, null);
  assert.equal(audit.action, "account.role.grant");
  assert.equal(audit.resource_type, "user_role");
  assert.equal(audit.resource_id, `${TARGET_USER_ID}:admin`);
  assert.equal(audit.outcome, "success");
  assert.deepEqual(JSON.parse(audit.metadata_json), {
    method: "sites_d1_migration",
    reason: "site_owner_approved_initial_admin",
    role: "admin",
    migration: "0003_owner_approved_admin_bootstrap",
  });
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("is idempotent when the migration SQL is evaluated again", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run(TARGET_USER_ID);

  applyMigration(database);
  applyMigration(database);

  assert.equal(
    database.prepare("SELECT count(*) AS count FROM user_roles WHERE user_id = ? AND role = 'admin'").get(TARGET_USER_ID).count,
    1,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM audit_events WHERE id = ?").get(AUDIT_EVENT_ID).count,
    1,
  );
  assert.equal(
    database.prepare("SELECT granted_at FROM user_roles WHERE user_id = ? AND role = 'admin'").get(TARGET_USER_ID).granted_at,
    "2026-08-30T01:34:13.751Z",
  );
});

test("does not rewrite or re-audit an existing active admin role", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run(TARGET_USER_ID);
  database.prepare(
    "INSERT INTO user_roles (user_id, role, granted_by_user_id, granted_at, revoked_at) VALUES (?, 'admin', NULL, '2026-08-01T00:00:00.000Z', NULL)",
  ).run(TARGET_USER_ID);

  applyMigration(database);

  assert.deepEqual(
    { ...database.prepare("SELECT granted_at, revoked_at FROM user_roles WHERE user_id = ? AND role = 'admin'").get(TARGET_USER_ID) },
    { granted_at: "2026-08-01T00:00:00.000Z", revoked_at: null },
  );
  assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events").get().count, 0);
});

test("reactivates a revoked admin role and audits the approved change", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run(TARGET_USER_ID);
  database.prepare(
    "INSERT INTO user_roles (user_id, role, granted_by_user_id, granted_at, revoked_at) VALUES (?, 'admin', NULL, '2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z')",
  ).run(TARGET_USER_ID);

  applyMigration(database);

  assert.deepEqual(
    { ...database.prepare("SELECT granted_at, revoked_at FROM user_roles WHERE user_id = ? AND role = 'admin'").get(TARGET_USER_ID) },
    { granted_at: "2026-08-30T01:34:13.751Z", revoked_at: null },
  );
  assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events").get().count, 1);
});

test("fails closed when the deterministic audit ID belongs to different content", () => {
  const database = createDatabase();
  database.prepare("INSERT INTO users (id, status) VALUES (?, 'active')").run(TARGET_USER_ID);
  database.prepare(
    `INSERT INTO audit_events
      (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json, occurred_at)
     VALUES (?, NULL, 'different-request', 'account.role.grant', 'user_role', ?, 'success', '{}', '2026-08-01T00:00:00.000Z')`,
  ).run(AUDIT_EVENT_ID, `${TARGET_USER_ID}:admin`);

  applyMigration(database);

  assert.equal(
    database.prepare("SELECT count(*) AS count FROM user_roles WHERE user_id = ? AND role = 'admin'").get(TARGET_USER_ID).count,
    0,
  );
  assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events").get().count, 1);
});

test("does nothing when the exact account is absent or inactive", () => {
  for (const status of [null, "suspended", "deleted"]) {
    const database = createDatabase();
    if (status) {
      database.prepare("INSERT INTO users (id, status) VALUES (?, ?)").run(TARGET_USER_ID, status);
    }

    applyMigration(database);

    assert.equal(database.prepare("SELECT count(*) AS count FROM user_roles").get().count, 0);
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_events").get().count, 0);
  }
});

test("contains no email-based or first-user authorization fallback", () => {
  assert.match(migrationSql, new RegExp(TARGET_USER_ID, "u"));
  assert.doesNotMatch(executableSql, /@/u);
  assert.doesNotMatch(executableSql, /email/iu);
  assert.doesNotMatch(executableSql, /LIMIT\s+1/iu);
});
