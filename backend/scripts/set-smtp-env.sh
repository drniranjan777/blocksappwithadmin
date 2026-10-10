#!/usr/bin/env bash
# Sets up e-mail by SMTP in this backend's .env without the password ever appearing on a command
# line, in shell history, in a log, in `ps`, or in a chat: it is typed here (hidden) and written
# straight into the file, which is made readable by its owner only.
#
#   cd /path/to/BLOCKS/backend && bash scripts/set-smtp-env.sh
#
# What it does:
#   - sets EMAIL_PROVIDER=smtp and OTP_TTL_MINUTES=15 (the e-mail promises 15 minutes);
#   - adds the non-secret SMTP settings only if the file does not have them already;
#   - replaces SMTP_PASS (never duplicates it);
#   - runs `smtp:check` if the project has been built, which logs in and sends nothing.
# It never prints the password.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -e "$ENV_FILE" ]; then
  (umask 077 && : > "$ENV_FILE")
fi
chmod 600 "$ENV_FILE"

has() { grep -q -E "^[[:space:]]*$1=" "$ENV_FILE"; }
drop() {
  local tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  chmod 600 "$tmp"
  grep -v -E "^[[:space:]]*$1=" "$ENV_FILE" >"$tmp" || true
  mv "$tmp" "$ENV_FILE"
}
put() { drop "$1"; printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"; }
add_if_missing() { has "$1" || printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"; }

if [ -t 0 ]; then
  read -r -s -p "SMTP password (typed, not shown): " PASS
  echo
  read -r -s -p "Type it again: " AGAIN
  echo
  if [ "$PASS" != "$AGAIN" ]; then
    echo "The two entries differ; nothing was changed." >&2
    exit 1
  fi
else
  # Piped in (for automation or tests): one line.
  IFS= read -r PASS
fi
if [ -z "$PASS" ]; then
  echo "No password entered; nothing was changed." >&2
  exit 1
fi

# Node's --env-file reads a single-quoted value literally; fall back to double quotes if the
# password itself contains a single quote, and refuse the one combination that cannot be written.
case "$PASS" in
  *\'*)
    case "$PASS" in
      *\"* | *\\* | *'$'*)
        echo "This password mixes quote and backslash characters that a .env file cannot hold safely." >&2
        echo "Edit .env by hand (chmod 600) and set SMTP_PASS there; nothing was changed." >&2
        exit 1
        ;;
    esac
    VALUE="\"$PASS\""
    ;;
  *) VALUE="'$PASS'" ;;
esac

put EMAIL_PROVIDER smtp
put OTP_TTL_MINUTES 15
add_if_missing SMTP_HOST smtp.hostinger.com
add_if_missing SMTP_PORT 465
add_if_missing SMTP_SECURE true
add_if_missing SMTP_USER noreply@tallygen.com
add_if_missing SMTP_FROM_EMAIL noreply@tallygen.com
add_if_missing SMTP_FROM_NAME BLOCKS
drop SMTP_PASS
printf 'SMTP_PASS=%s\n' "$VALUE" >>"$ENV_FILE"
unset PASS AGAIN VALUE

echo "Wrote the SMTP settings to $ENV_FILE (mode 600). The password was not displayed."
if [ -f dist/cli/smtp-check.js ]; then
  echo "Checking the login (nothing is sent):"
  node --env-file="$ENV_FILE" dist/cli/smtp-check.js || true
else
  echo "Next: npm run build && npm run smtp:check"
fi
echo "Then restart only the BLOCKS API process, e.g.:  pm2 restart <its name from 'pm2 list'>"
