#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

for command in node install systemctl stat getent id realpath dirname flock useradd usermod \
  ln mv mktemp cp rm readlink logrotate chown chmod cmp grep sleep; do
  command -v "$command" >/dev/null || {
    echo "missing prerequisite: $command" >&2
    exit 1
  }
done

install -d -m 0755 /run/lock
if [[ ${FUSIONDIGITAL_DEPLOY_LOCK_HELD:-0} == 1 ]]; then
  [[ $(readlink "/proc/$$/fd/9" 2>/dev/null || true) == /run/lock/fusiondigital-deploy.lock ]] \
    && flock -n 9 || {
      echo "the parent deployment lock was not inherited" >&2
      exit 1
    }
else
  exec 9>/run/lock/fusiondigital-deploy.lock
  flock -n 9 || {
    echo "another FusionDigital deployment or analytics installation is running" >&2
    exit 1
  }
fi

SCRIPT_DIR=$(realpath -e -- "$(dirname -- "${BASH_SOURCE[0]}")")
RELEASE_ROOT=$(realpath -e -- "$SCRIPT_DIR/../..")
ENV_DIR=/etc/fusiondigital
ENV_FILE=$ENV_DIR/analytics.env
STATE_DIR=/var/lib/fusiondigital-analytics
DATABASE_FILE=$STATE_DIR/analytics.sqlite
LOG_DIR=/var/log/fusiondigital
LOG_FILE=$LOG_DIR/analytics.log
LOGROTATE_FILE=/etc/logrotate.d/fusiondigital-analytics
COLLECTOR_SERVICE_FILE=/etc/systemd/system/fusiondigital-analytics-collector.service
FORWARDER_SERVICE_FILE=/etc/systemd/system/fusiondigital-analytics-forwarder.service
TIMER_FILE=/etc/systemd/system/fusiondigital-analytics-forwarder.timer
RUNTIME_ROOT=/usr/local/lib/fusiondigital-analytics
RUNTIME_RELEASES=$RUNTIME_ROOT/releases
RUNTIME_CURRENT=$RUNTIME_ROOT/current
RUNTIME_NEXT=$RUNTIME_ROOT/.current.next.$$
RUNTIME_PENDING=""
LABEL_SOURCE=$RELEASE_ROOT/dist/client/data/fusion-knowledge-graph.json
BACKUP_DIR=""
PREVIOUS_RUNTIME=""
TRANSACTION_ACTIVE=false
HAD_COLLECTOR_SERVICE=false
HAD_FORWARDER_SERVICE=false
HAD_TIMER=false
HAD_LOGROTATE=false
COLLECTOR_WAS_ENABLED=false
COLLECTOR_WAS_ACTIVE=false
TIMER_WAS_ENABLED=false
TIMER_WAS_ACTIVE=false
DATABASE_EXISTED=false
DATABASE_BACKUP_READY=false

restore_file() {
  local existed=$1
  local backup=$2
  local destination=$3
  if "$existed"; then
    cp -a "$backup" "$destination"
  else
    rm -f -- "$destination"
  fi
}

rollback_transaction() {
  set +e
  systemctl disable --now fusiondigital-analytics-forwarder.timer >/dev/null 2>&1 || true
  systemctl stop fusiondigital-analytics-forwarder.service >/dev/null 2>&1 || true
  systemctl disable --now fusiondigital-analytics-collector.service >/dev/null 2>&1 || true

  rm -f -- "$RUNTIME_NEXT"
  if [[ -n $PREVIOUS_RUNTIME ]]; then
    ln -s "$PREVIOUS_RUNTIME" "$RUNTIME_NEXT"
    mv -Tf "$RUNTIME_NEXT" "$RUNTIME_CURRENT"
  else
    rm -f -- "$RUNTIME_CURRENT"
  fi

  restore_file "$HAD_COLLECTOR_SERVICE" "$BACKUP_DIR/collector.service" "$COLLECTOR_SERVICE_FILE"
  restore_file "$HAD_FORWARDER_SERVICE" "$BACKUP_DIR/forwarder.service" "$FORWARDER_SERVICE_FILE"
  restore_file "$HAD_TIMER" "$BACKUP_DIR/forwarder.timer" "$TIMER_FILE"
  restore_file "$HAD_LOGROTATE" "$BACKUP_DIR/logrotate" "$LOGROTATE_FILE"
  if "$DATABASE_BACKUP_READY"; then
    rm -f -- "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"
    cp -a "$BACKUP_DIR/analytics.sqlite" "$DATABASE_FILE"
    chown fusionanalytics:fusionanalytics "$DATABASE_FILE"
    chmod 0600 "$DATABASE_FILE"
  elif ! "$DATABASE_EXISTED"; then
    rm -f -- "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"
    rm -f -- "$DATABASE_FILE"
  fi
  systemctl daemon-reload || true

  "$COLLECTOR_WAS_ENABLED" && systemctl enable fusiondigital-analytics-collector.service >/dev/null 2>&1
  "$COLLECTOR_WAS_ACTIVE" && systemctl start fusiondigital-analytics-collector.service >/dev/null 2>&1
  "$TIMER_WAS_ENABLED" && systemctl enable fusiondigital-analytics-forwarder.timer >/dev/null 2>&1
  "$TIMER_WAS_ACTIVE" && systemctl start fusiondigital-analytics-forwarder.timer >/dev/null 2>&1
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 ]] && "$TRANSACTION_ACTIVE"; then
    echo "restoring the previous analytics collector and forwarder transaction" >&2
    rollback_transaction
  fi
  set +e
  rm -f -- "$RUNTIME_NEXT"
  if [[ -n $RUNTIME_PENDING && $RUNTIME_PENDING == "$RUNTIME_RELEASES/.pending."* ]]; then
    rm -rf -- "$RUNTIME_PENDING"
  fi
  if [[ -n $BACKUP_DIR && $BACKUP_DIR == /tmp/fusiondigital-analytics-install.* ]]; then
    rm -rf -- "$BACKUP_DIR"
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT

for source in analytics-collector.mjs analytics-store.mjs direct-execution.mjs \
  fusiondigital-analytics-collector.service fusiondigital-analytics.logrotate; do
  [[ -f "$SCRIPT_DIR/$source" && ! -L "$SCRIPT_DIR/$source" ]] || {
    echo "analytics runtime file is missing or unsafe: $source" >&2
    exit 1
  }
done

install -d -m 0700 -o root -g root "$ENV_DIR"
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" && $(stat -Lc '%h' "$ENV_FILE") == 1 ]] || {
  echo "create the root-only $ENV_FILE with sudoedit before enabling analytics" >&2
  exit 1
}
[[ $(stat -Lc '%u' "$ENV_FILE") == 0 ]] || {
  echo "$ENV_FILE must be owned by root" >&2
  exit 1
}
ENV_MODE=$(stat -Lc '%a' "$ENV_FILE")
(( (8#$ENV_MODE & 0077) == 0 )) || {
  echo "$ENV_FILE must not be accessible by group or other users" >&2
  exit 1
}

node --input-type=module - "$ENV_FILE" <<'NODE'
import { readFileSync } from "node:fs";
const lines = readFileSync(process.argv[2], "utf8").split(/\r?\n/u).filter(Boolean);
const allowed = new Set([
  "FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET",
  "FUSIONDIGITAL_ANALYTICS_REPORT_SECRET",
  "FUSIONDIGITAL_ANALYTICS_INGEST_SECRET",
]);
const values = new Map();
for (const line of lines) {
  const match = /^([A-Z0-9_]+)=([A-Za-z0-9_-]{43,128})$/u.exec(line);
  if (!match || !allowed.has(match[1]) || values.has(match[1])) process.exit(1);
  values.set(match[1], match[2]);
}
if (!values.has("FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET")
  || !values.has("FUSIONDIGITAL_ANALYTICS_REPORT_SECRET")
  || values.size > 3) process.exit(1);
NODE
node --input-type=module -e 'import("node:sqlite").then(({DatabaseSync}) => { const db = new DatabaseSync(":memory:"); db.exec("CREATE TABLE probe (id INTEGER) STRICT"); db.close(); })'

if ! getent passwd fusionanalytics >/dev/null; then
  if getent group fusionanalytics >/dev/null; then
    useradd --system --gid fusionanalytics --home-dir /nonexistent --no-create-home \
      --shell /usr/sbin/nologin fusionanalytics
  else
    useradd --system --user-group --home-dir /nonexistent --no-create-home \
      --shell /usr/sbin/nologin fusionanalytics
  fi
fi
getent group fusionanalytics >/dev/null || { echo "missing fusionanalytics group" >&2; exit 1; }
[[ $(id -gn fusionanalytics) == fusionanalytics ]] || {
  echo "fusionanalytics must use its dedicated primary group" >&2
  exit 1
}
# Earlier draft installers added this user to adm/fusiondigital. It needs no
# supplementary groups once the collector owns the dedicated log.
usermod -G "" fusionanalytics
[[ $(id -Gn fusionanalytics) == fusionanalytics ]] || {
  echo "fusionanalytics must not retain supplementary groups" >&2
  exit 1
}

[[ ! -e "$LOG_DIR" || ( -d "$LOG_DIR" && ! -L "$LOG_DIR" ) ]] || {
  echo "$LOG_DIR must be a real directory" >&2
  exit 1
}
install -d -m 0750 -o root -g fusionanalytics "$LOG_DIR"
if [[ -e "$LOG_FILE" || -L "$LOG_FILE" ]]; then
  [[ -f "$LOG_FILE" && ! -L "$LOG_FILE" && $(stat -Lc '%h' "$LOG_FILE") == 1 ]] || {
    echo "$LOG_FILE must be a single regular file" >&2
    exit 1
  }
  chown fusionanalytics:fusionanalytics "$LOG_FILE"
  chmod 0640 "$LOG_FILE"
else
  install -m 0640 -o fusionanalytics -g fusionanalytics /dev/null "$LOG_FILE"
fi
for rotated in "$LOG_FILE".*; do
  suffix=${rotated#"$LOG_FILE".}
  [[ $suffix =~ ^[1-9][0-9]*$ ]] || continue
  [[ -f "$rotated" && ! -L "$rotated" && $(stat -Lc '%h' "$rotated") == 1 ]] || {
    echo "unsafe analytics log rotation segment" >&2
    exit 1
  }
  chown fusionanalytics:fusionanalytics "$rotated"
  chmod 0640 "$rotated"
done

[[ ! -e "$STATE_DIR" || ( -d "$STATE_DIR" && ! -L "$STATE_DIR" ) ]] || {
  echo "$STATE_DIR must be a real directory" >&2
  exit 1
}
install -d -m 0700 -o fusionanalytics -g fusionanalytics "$STATE_DIR"
if [[ ! -e "$DATABASE_FILE" && ! -L "$DATABASE_FILE" ]]; then
  for orphan in "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"; do
    [[ ! -e "$orphan" && ! -L "$orphan" ]] || {
      echo "orphan analytics database sidecar must be reviewed manually: $orphan" >&2
      exit 1
    }
  done
fi

[[ -f "$RELEASE_ROOT/.fusiondigital-release.json" && ! -L "$RELEASE_ROOT/.fusiondigital-release.json" ]] || {
  echo "release manifest is missing or unsafe" >&2
  exit 1
}
[[ -f "$LABEL_SOURCE" && ! -L "$LABEL_SOURCE" && $(stat -Lc '%h' "$LABEL_SOURCE") == 1 ]] || {
  echo "analytics content label source is missing or unsafe" >&2
  exit 1
}
RELEASE_SHA=$(node -e '
  const manifest = require(process.argv[1]);
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(manifest.commitSha)) process.exit(1);
  process.stdout.write(manifest.commitSha);
' "$RELEASE_ROOT/.fusiondigital-release.json")
RUNTIME_TARGET=$RUNTIME_RELEASES/$RELEASE_SHA
[[ ! -e "$RUNTIME_ROOT" || ( -d "$RUNTIME_ROOT" && ! -L "$RUNTIME_ROOT" ) ]] || {
  echo "$RUNTIME_ROOT must be a real directory" >&2
  exit 1
}
install -d -m 0755 -o root -g root "$RUNTIME_ROOT" "$RUNTIME_RELEASES"
if [[ ! -e "$RUNTIME_TARGET" ]]; then
  RUNTIME_PENDING=$(mktemp -d "$RUNTIME_RELEASES/.pending.XXXXXX")
  for runtime_file in analytics-collector.mjs analytics-store.mjs direct-execution.mjs; do
    install -m 0640 -o root -g fusionanalytics "$SCRIPT_DIR/$runtime_file" "$RUNTIME_PENDING/$runtime_file"
  done
  node --input-type=module - "$LABEL_SOURCE" "$RUNTIME_PENDING/analytics-content-labels.json" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const snapshot = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!snapshot || !Array.isArray(snapshot.nodes) || snapshot.nodes.length > 2000) process.exit(1);
const digest = (value) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
};
const labels = Object.create(null);
for (const node of snapshot.nodes) {
  if (!node || typeof node.id !== "string" || typeof node.label !== "string" || node.label.length < 1 || node.label.length > 200) process.exit(1);
  labels[digest(node.id)] = node.label;
}
writeFileSync(process.argv[3], `${JSON.stringify(labels)}\n`, { encoding: "utf8", mode: 0o640, flag: "wx" });
NODE
  chown root:fusionanalytics "$RUNTIME_PENDING"
  chmod 0750 "$RUNTIME_PENDING"
  mv "$RUNTIME_PENDING" "$RUNTIME_TARGET"
  RUNTIME_PENDING=""
else
  [[ -d "$RUNTIME_TARGET" && ! -L "$RUNTIME_TARGET" ]] || {
    echo "unsafe analytics runtime target" >&2
    exit 1
  }
  for runtime_file in analytics-collector.mjs analytics-store.mjs direct-execution.mjs; do
    [[ -f "$RUNTIME_TARGET/$runtime_file" && ! -L "$RUNTIME_TARGET/$runtime_file" ]] || exit 1
    cmp -s "$SCRIPT_DIR/$runtime_file" "$RUNTIME_TARGET/$runtime_file"
  done
  [[ -f "$RUNTIME_TARGET/analytics-content-labels.json" && ! -L "$RUNTIME_TARGET/analytics-content-labels.json" ]] || exit 1
fi
# mktemp creates root:root; the dedicated non-root services must be able to
# traverse the immutable target. Reapply this contract on idempotent retries.
chown root:fusionanalytics "$RUNTIME_TARGET"
chmod 0750 "$RUNTIME_TARGET"
for runtime_file in analytics-collector.mjs analytics-store.mjs direct-execution.mjs; do
  chown root:fusionanalytics "$RUNTIME_TARGET/$runtime_file"
  chmod 0640 "$RUNTIME_TARGET/$runtime_file"
done
chown root:fusionanalytics "$RUNTIME_TARGET/analytics-content-labels.json"
chmod 0640 "$RUNTIME_TARGET/analytics-content-labels.json"

[[ ! -e "$RUNTIME_CURRENT" || -L "$RUNTIME_CURRENT" ]] || {
  echo "$RUNTIME_CURRENT must be a symlink" >&2
  exit 1
}
if [[ -L "$RUNTIME_CURRENT" ]]; then
  PREVIOUS_RUNTIME=$(readlink -f -- "$RUNTIME_CURRENT" 2>/dev/null || true)
  [[ -n $PREVIOUS_RUNTIME && -d $PREVIOUS_RUNTIME && $PREVIOUS_RUNTIME == "$RUNTIME_RELEASES/"* ]] || {
    echo "analytics current link must resolve inside its runtime release root" >&2
    exit 1
  }
fi

BACKUP_DIR=$(mktemp -d /tmp/fusiondigital-analytics-install.XXXXXX)
chmod 0700 "$BACKUP_DIR"
if [[ -e "$COLLECTOR_SERVICE_FILE" || -L "$COLLECTOR_SERVICE_FILE" ]]; then
  [[ -f "$COLLECTOR_SERVICE_FILE" && ! -L "$COLLECTOR_SERVICE_FILE" ]] || exit 1
  cp -a "$COLLECTOR_SERVICE_FILE" "$BACKUP_DIR/collector.service"
  HAD_COLLECTOR_SERVICE=true
fi
if [[ -e "$FORWARDER_SERVICE_FILE" || -L "$FORWARDER_SERVICE_FILE" ]]; then
  [[ -f "$FORWARDER_SERVICE_FILE" && ! -L "$FORWARDER_SERVICE_FILE" ]] || exit 1
  cp -a "$FORWARDER_SERVICE_FILE" "$BACKUP_DIR/forwarder.service"
  HAD_FORWARDER_SERVICE=true
fi
if [[ -e "$TIMER_FILE" || -L "$TIMER_FILE" ]]; then
  [[ -f "$TIMER_FILE" && ! -L "$TIMER_FILE" ]] || exit 1
  cp -a "$TIMER_FILE" "$BACKUP_DIR/forwarder.timer"
  HAD_TIMER=true
fi
if [[ -e "$LOGROTATE_FILE" || -L "$LOGROTATE_FILE" ]]; then
  [[ -f "$LOGROTATE_FILE" && ! -L "$LOGROTATE_FILE" ]] || exit 1
  cp -a "$LOGROTATE_FILE" "$BACKUP_DIR/logrotate"
  HAD_LOGROTATE=true
fi
systemctl is-enabled --quiet fusiondigital-analytics-collector.service 2>/dev/null && COLLECTOR_WAS_ENABLED=true
systemctl is-active --quiet fusiondigital-analytics-collector.service 2>/dev/null && COLLECTOR_WAS_ACTIVE=true
systemctl is-enabled --quiet fusiondigital-analytics-forwarder.timer 2>/dev/null && TIMER_WAS_ENABLED=true
systemctl is-active --quiet fusiondigital-analytics-forwarder.timer 2>/dev/null && TIMER_WAS_ACTIVE=true

TRANSACTION_ACTIVE=true
systemctl disable --now fusiondigital-analytics-forwarder.timer >/dev/null 2>&1 || true
systemctl stop fusiondigital-analytics-forwarder.service >/dev/null 2>&1 || true
systemctl stop fusiondigital-analytics-collector.service >/dev/null 2>&1 || true
if [[ -e "$DATABASE_FILE" || -L "$DATABASE_FILE" ]]; then
  DATABASE_EXISTED=true
  [[ -f "$DATABASE_FILE" && ! -L "$DATABASE_FILE" && $(stat -Lc '%h' "$DATABASE_FILE") == 1 ]] || {
    echo "$DATABASE_FILE must be a single regular file" >&2
    exit 1
  }
  [[ $(stat -Lc '%U:%G' "$DATABASE_FILE") == fusionanalytics:fusionanalytics ]] || {
    echo "$DATABASE_FILE must be owned by fusionanalytics" >&2
    exit 1
  }
  DATABASE_MODE=$(stat -Lc '%a' "$DATABASE_FILE")
  (( (8#$DATABASE_MODE & 0077) == 0 )) || {
    echo "$DATABASE_FILE must not be accessible by group or other users" >&2
    exit 1
  }
  for sidecar in "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"; do
    if [[ -e "$sidecar" || -L "$sidecar" ]]; then
      [[ -f "$sidecar" && ! -L "$sidecar" && $(stat -Lc '%h' "$sidecar") == 1 ]] || {
        echo "analytics database sidecar is unsafe" >&2
        exit 1
      }
      [[ $(stat -Lc '%U:%G' "$sidecar") == fusionanalytics:fusionanalytics ]] || {
        echo "analytics database sidecar must be owned by fusionanalytics" >&2
        exit 1
      }
      SIDECAR_MODE=$(stat -Lc '%a' "$sidecar")
      (( (8#$SIDECAR_MODE & 0077) == 0 )) || {
        echo "analytics database sidecar must not be accessible by group or other users" >&2
        exit 1
      }
    fi
  done
  node --input-type=module - "$DATABASE_FILE" <<'NODE'
import { DatabaseSync } from "node:sqlite";
const database = new DatabaseSync(process.argv[2]);
const result = database.prepare("PRAGMA quick_check").get();
if (result?.quick_check !== "ok") process.exit(1);
const checkpoint = database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
if (checkpoint?.busy !== 0 || checkpoint?.log !== checkpoint?.checkpointed) process.exit(1);
database.close();
NODE
  cp -a "$DATABASE_FILE" "$BACKUP_DIR/analytics.sqlite"
  cmp -s "$DATABASE_FILE" "$BACKUP_DIR/analytics.sqlite"
  DATABASE_BACKUP_READY=true
fi
ln -s "$RUNTIME_TARGET" "$RUNTIME_NEXT"
mv -Tf "$RUNTIME_NEXT" "$RUNTIME_CURRENT"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics-collector.service" "$COLLECTOR_SERVICE_FILE"
rm -f -- "$FORWARDER_SERVICE_FILE" "$TIMER_FILE"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics.logrotate" "$LOGROTATE_FILE"
logrotate --debug "$LOGROTATE_FILE" >/dev/null
systemctl daemon-reload
systemctl enable fusiondigital-analytics-collector.service >/dev/null
systemctl restart fusiondigital-analytics-collector.service
COLLECTOR_HEALTHY=false
for attempt in {1..120}; do
  if node "$RUNTIME_CURRENT/analytics-collector.mjs" --probe >/dev/null 2>&1; then
    COLLECTOR_HEALTHY=true
    break
  fi
  systemctl is-active --quiet fusiondigital-analytics-collector.service || break
  sleep 1
done
"$COLLECTOR_HEALTHY" || {
  echo "analytics collector did not become ready" >&2
  exit 1
}
node "$RUNTIME_CURRENT/analytics-collector.mjs" --report-probe >/dev/null
node "$RUNTIME_CURRENT/analytics-collector.mjs" --report-tls-probe >/dev/null
[[ -f "$DATABASE_FILE" && ! -L "$DATABASE_FILE" && $(stat -Lc '%h' "$DATABASE_FILE") == 1 ]] || exit 1
[[ $(stat -Lc '%U:%G' "$DATABASE_FILE") == fusionanalytics:fusionanalytics ]] || exit 1
DATABASE_MODE=$(stat -Lc '%a' "$DATABASE_FILE")
(( (8#$DATABASE_MODE & 0077) == 0 )) || exit 1
for sidecar in "$DATABASE_FILE-wal" "$DATABASE_FILE-shm"; do
  if [[ -e "$sidecar" || -L "$sidecar" ]]; then
    [[ -f "$sidecar" && ! -L "$sidecar" && $(stat -Lc '%h' "$sidecar") == 1 ]] || exit 1
    [[ $(stat -Lc '%U:%G' "$sidecar") == fusionanalytics:fusionanalytics ]] || exit 1
    SIDECAR_MODE=$(stat -Lc '%a' "$sidecar")
    (( (8#$SIDECAR_MODE & 0077) == 0 )) || exit 1
  fi
done
[[ ! -e "$FORWARDER_SERVICE_FILE" && ! -L "$FORWARDER_SERVICE_FILE" ]] || exit 1
[[ ! -e "$TIMER_FILE" && ! -L "$TIMER_FILE" ]] || exit 1
! systemctl is-enabled --quiet fusiondigital-analytics-forwarder.timer 2>/dev/null || exit 1
! systemctl is-active --quiet fusiondigital-analytics-forwarder.timer 2>/dev/null || exit 1
! systemctl is-active --quiet fusiondigital-analytics-forwarder.service 2>/dev/null || exit 1

TRANSACTION_ACTIVE=false
echo "FusionDigital loopback analytics collector and signed admin report bridge are enabled."
