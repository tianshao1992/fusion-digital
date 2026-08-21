#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

ADMIN_EMAIL=
ALLOW_HTTP01=false
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for ARGUMENT in "$@"; do
  case "$ARGUMENT" in
    --http-01)
      ALLOW_HTTP01=true
      ;;
    --help|-h)
      echo "Usage: finalize-https.sh [--http-01] [ADMIN_EMAIL]"
      exit 0
      ;;
    *)
      if [[ -n $ADMIN_EMAIL ]]; then
        echo "only one administrator email may be supplied" >&2
        exit 1
      fi
      ADMIN_EMAIL=$ARGUMENT
      ;;
  esac
done

NGINX_CONFIG=/etc/nginx/sites-available/fusiondigital
CERTIFICATE_ROOT=/etc/letsencrypt/live/fusiondigital.club
RENEWAL_CONFIG=/etc/letsencrypt/renewal/fusiondigital.club.conf
CERTIFICATE_FILES=(
  "$CERTIFICATE_ROOT/fullchain.pem"
  "$CERTIFICATE_ROOT/privkey.pem"
)

validate_managed_certificate() {
  local certificate_key_digest
  local private_key_digest
  openssl x509 -checkend 604800 -noout -in "$CERTIFICATE_ROOT/fullchain.pem" >/dev/null
  openssl x509 -checkhost fusiondigital.club -noout \
    -in "$CERTIFICATE_ROOT/fullchain.pem" >/dev/null
  openssl x509 -checkhost www.fusiondigital.club -noout \
    -in "$CERTIFICATE_ROOT/fullchain.pem" >/dev/null
  certificate_key_digest=$(
    openssl x509 -in "$CERTIFICATE_ROOT/fullchain.pem" -pubkey -noout \
      | openssl pkey -pubin -outform DER 2>/dev/null \
      | sha256sum \
      | cut -d ' ' -f 1
  )
  private_key_digest=$(
    openssl pkey -in "$CERTIFICATE_ROOT/privkey.pem" -pubout -outform DER 2>/dev/null \
      | sha256sum \
      | cut -d ' ' -f 1
  )
  [[ -n $certificate_key_digest && $certificate_key_digest == "$private_key_digest" ]]
}

warn_if_manual_renewal() {
  if [[ -f $RENEWAL_CONFIG ]] \
    && grep -Eq '^[[:space:]]*authenticator[[:space:]]*=[[:space:]]*manual([[:space:]]|$)' \
      "$RENEWAL_CONFIG"; then
    cat >&2 <<'EOF'
WARNING: this certificate still uses Certbot's manual renewal authenticator.
It may be used for pre-cutover SNI verification, but production is not complete.
After DNS points both names to this EIP, run:
  certbot reconfigure --cert-name fusiondigital.club --nginx
  certbot renew --dry-run
Do not declare the release complete until the renewal authenticator is no longer manual and the dry run passes.
EOF
  fi
}

# TLS activation must never create, replace, validate, or reload SSH
# configuration. The ECS may still rely on Workbench/Cloud Assistant and may
# not have a tested ordinary public key. SSH hardening is a separate operator
# task after an independent access path has been verified.
PORT_443_LISTENERS=$(ss -H -ltnp '( sport = :443 )' 2>/dev/null || true)
if [[ $PORT_443_LISTENERS == *sshd* ]]; then
  echo "TCP 443 is occupied by sshd; HTTPS finalization will not modify SSH." >&2
  printf '%s\n' "$PORT_443_LISTENERS" >&2
  exit 1
fi
if [[ -n $PORT_443_LISTENERS && $PORT_443_LISTENERS != *nginx* ]]; then
  echo "TCP 443 is occupied by a non-Nginx service; HTTPS finalization stopped." >&2
  printf '%s\n' "$PORT_443_LISTENERS" >&2
  exit 1
fi

PRESENT_CERTIFICATE_FILES=0
PRESENT_CERTIFICATE_PATHS=0
for CERTIFICATE_FILE in "${CERTIFICATE_FILES[@]}"; do
  if [[ -e $CERTIFICATE_FILE || -L $CERTIFICATE_FILE ]]; then
    ((PRESENT_CERTIFICATE_PATHS += 1))
  fi
  if [[ -s $CERTIFICATE_FILE ]]; then
    ((PRESENT_CERTIFICATE_FILES += 1))
  fi
done

if [[ $PRESENT_CERTIFICATE_PATHS -ne 0 \
  && $PRESENT_CERTIFICATE_FILES -ne ${#CERTIFICATE_FILES[@]} ]]; then
  echo "managed certificate pair is incomplete or invalid; refusing to overwrite it" >&2
  exit 1
fi

CERTIFICATE_READY=false
if [[ $PRESENT_CERTIFICATE_FILES -eq ${#CERTIFICATE_FILES[@]} ]]; then
  if ! validate_managed_certificate; then
    echo "managed certificate is expired, near expiry, missing a hostname, or mismatched to its key" >&2
    exit 1
  fi
  CERTIFICATE_READY=true
  echo "Reusing the complete managed fusiondigital.club certificate."
elif [[ $ALLOW_HTTP01 != true ]]; then
  echo "No complete managed certificate exists." >&2
  echo "Pre-issue and install both names with DNS-01, or rerun with --http-01 in a declared maintenance window." >&2
  exit 1
fi

CONFIG_BACKUP_DIR=$(mktemp -d /var/tmp/fusiondigital-https.XXXXXX)
CONFIG_EXISTED=false
TRANSACTION_ACTIVE=false

rollback_nginx() {
  local rollback_failed=false
  set +e
  if [[ $CONFIG_EXISTED == true ]]; then
    rm -f -- "$NGINX_CONFIG"
    cp -a -- "$CONFIG_BACKUP_DIR/nginx.conf" "$NGINX_CONFIG" || rollback_failed=true
  else
    rm -f -- "$NGINX_CONFIG" || rollback_failed=true
  fi
  if nginx -t; then
    systemctl reload nginx || rollback_failed=true
  else
    rollback_failed=true
  fi
  if [[ $rollback_failed == true ]]; then
    echo "HTTPS activation failed and the previous Nginx configuration could not be fully restored." >&2
  else
    echo "HTTPS activation failed; restored the previous Nginx configuration." >&2
  fi
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ $TRANSACTION_ACTIVE == true ]]; then
    rollback_nginx
  fi
  rm -rf -- "$CONFIG_BACKUP_DIR"
  exit "$status"
}
trap cleanup_on_exit EXIT

if [[ -e $NGINX_CONFIG || -L $NGINX_CONFIG ]]; then
  cp -a -- "$NGINX_CONFIG" "$CONFIG_BACKUP_DIR/nginx.conf"
  CONFIG_EXISTED=true
fi
TRANSACTION_ACTIVE=true

if [[ $CERTIFICATE_READY != true ]]; then
  CERTBOT_ARGS=(
    certonly
    --nginx
    --non-interactive
    --agree-tos
    --keep-until-expiring
    --cert-name fusiondigital.club
    -d fusiondigital.club
    -d www.fusiondigital.club
  )

  if [[ -n $ADMIN_EMAIL ]]; then
    CERTBOT_ARGS+=(--email "$ADMIN_EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi

  certbot "${CERTBOT_ARGS[@]}"
else
  echo "Certificate issuance skipped; activating the existing managed certificate."
fi

for CERTIFICATE_FILE in "${CERTIFICATE_FILES[@]}"; do
  if [[ ! -s $CERTIFICATE_FILE ]]; then
    echo "required managed certificate file is missing: $CERTIFICATE_FILE" >&2
    exit 1
  fi
done
if ! validate_managed_certificate; then
  echo "managed certificate failed hostname, lifetime, or private-key validation" >&2
  exit 1
fi
node "$SCRIPT_DIR/certbot-nginx-support.mjs"
warn_if_manual_renewal

node /srv/fusiondigital/current/deploy/aliyun-hk/render-nginx-config.mjs \
  --require-tls \
  /srv/fusiondigital/current/deploy/aliyun-hk/nginx.conf \
  "$NGINX_CONFIG"
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer

curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --resolve fusiondigital.club:443:127.0.0.1 \
  -o /dev/null https://fusiondigital.club/
curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --resolve www.fusiondigital.club:443:127.0.0.1 \
  -o /dev/null https://www.fusiondigital.club/
HTTP_VERSION=$(curl -fsS --noproxy '*' --connect-timeout 2 --max-time 10 \
  --http2 --resolve fusiondigital.club:443:127.0.0.1 \
  -o /dev/null -w '%{http_version}' https://fusiondigital.club/)
test "$HTTP_VERSION" = 2

TRANSACTION_ACTIVE=false
echo "HTTPS is active for fusiondigital.club and www.fusiondigital.club."
