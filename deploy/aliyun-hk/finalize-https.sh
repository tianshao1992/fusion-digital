#!/usr/bin/env bash

set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

ADMIN_EMAIL=${1:-}

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
node /srv/fusiondigital/current/deploy/aliyun-hk/render-nginx-config.mjs \
  --require-tls \
  /srv/fusiondigital/current/deploy/aliyun-hk/nginx.conf \
  /etc/nginx/sites-available/fusiondigital
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

echo "HTTPS is active for fusiondigital.club and www.fusiondigital.club."
