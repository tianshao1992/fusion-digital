#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

for command in node install systemctl stat getent id realpath dirname flock useradd usermod \
  ln mv mktemp cp rm readlink logrotate chown chmod cmp grep; do
  command -v "$command" >/dev/null || {
    echo "missing prerequisite: $command" >&2
    exit 1
  }
done

install -d -m 0755 /run/lock
exec 9>/run/lock/fusiondigital-deploy.lock
flock -n 9 || {
  echo "another FusionDigital deployment or analytics installation is running" >&2
  exit 1
}

SCRIPT_DIR=$(realpath -e -- "$(dirname -- "${BASH_SOURCE[0]}")")
RELEASE_ROOT=$(realpath -e -- "$SCRIPT_DIR/../..")
ENV_DIR=/etc/fusiondigital
ENV_FILE=$ENV_DIR/analytics.env
STATE_DIR=/var/lib/fusiondigital-analytics
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

for source in analytics-collector.mjs analytics-forwarder.mjs direct-execution.mjs \
  fusiondigital-analytics-collector.service fusiondigital-analytics-forwarder.service \
  fusiondigital-analytics-forwarder.timer fusiondigital-analytics.logrotate; do
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
if (lines.length !== 1 || !lines[0].startsWith("FUSIONDIGITAL_ANALYTICS_INGEST_SECRET=")) process.exit(1);
const value = lines[0].slice(lines[0].indexOf("=") + 1);
if (!/^[A-Za-z0-9_-]{43,128}$/u.test(value)) process.exit(1);
NODE

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

[[ -f "$RELEASE_ROOT/.fusiondigital-release.json" && ! -L "$RELEASE_ROOT/.fusiondigital-release.json" ]] || {
  echo "release manifest is missing or unsafe" >&2
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
  for runtime_file in analytics-collector.mjs analytics-forwarder.mjs direct-execution.mjs; do
    install -m 0640 -o root -g fusionanalytics "$SCRIPT_DIR/$runtime_file" "$RUNTIME_PENDING/$runtime_file"
  done
  chown root:fusionanalytics "$RUNTIME_PENDING"
  chmod 0750 "$RUNTIME_PENDING"
  mv "$RUNTIME_PENDING" "$RUNTIME_TARGET"
  RUNTIME_PENDING=""
else
  [[ -d "$RUNTIME_TARGET" && ! -L "$RUNTIME_TARGET" ]] || {
    echo "unsafe analytics runtime target" >&2
    exit 1
  }
  for runtime_file in analytics-collector.mjs analytics-forwarder.mjs direct-execution.mjs; do
    [[ -f "$RUNTIME_TARGET/$runtime_file" && ! -L "$RUNTIME_TARGET/$runtime_file" ]] || exit 1
    cmp -s "$SCRIPT_DIR/$runtime_file" "$RUNTIME_TARGET/$runtime_file"
  done
fi
# mktemp creates root:root; the dedicated non-root services must be able to
# traverse the immutable target. Reapply this contract on idempotent retries.
chown root:fusionanalytics "$RUNTIME_TARGET"
chmod 0750 "$RUNTIME_TARGET"
for runtime_file in analytics-collector.mjs analytics-forwarder.mjs direct-execution.mjs; do
  chown root:fusionanalytics "$RUNTIME_TARGET/$runtime_file"
  chmod 0640 "$RUNTIME_TARGET/$runtime_file"
done

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
systemctl stop fusiondigital-analytics-forwarder.timer >/dev/null 2>&1 || true
systemctl stop fusiondigital-analytics-forwarder.service >/dev/null 2>&1 || true
systemctl stop fusiondigital-analytics-collector.service >/dev/null 2>&1 || true
ln -s "$RUNTIME_TARGET" "$RUNTIME_NEXT"
mv -Tf "$RUNTIME_NEXT" "$RUNTIME_CURRENT"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics-collector.service" "$COLLECTOR_SERVICE_FILE"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics-forwarder.service" "$FORWARDER_SERVICE_FILE"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics-forwarder.timer" "$TIMER_FILE"
install -m 0644 "$SCRIPT_DIR/fusiondigital-analytics.logrotate" "$LOGROTATE_FILE"
logrotate --debug "$LOGROTATE_FILE" >/dev/null
systemctl daemon-reload
systemctl enable fusiondigital-analytics-collector.service >/dev/null
systemctl restart fusiondigital-analytics-collector.service
node "$RUNTIME_CURRENT/analytics-collector.mjs" --probe >/dev/null
systemctl start fusiondigital-analytics-forwarder.service
systemctl enable --now fusiondigital-analytics-forwarder.timer >/dev/null

TRANSACTION_ACTIVE=false
echo "FusionDigital loopback analytics collector and signed forwarder are enabled."
