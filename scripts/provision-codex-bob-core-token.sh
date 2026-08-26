#!/usr/bin/env bash
set -euo pipefail

CODEX_DIR="${HOME}/.codex"
ENV_FILE="${CODEX_DIR}/.env"

mkdir -p "${CODEX_DIR}"
umask 077

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate the Codex Bob Core token." >&2
  exit 1
fi

if ! command -v shasum >/dev/null 2>&1; then
  echo "shasum is required to compute the Bob Core credential hash." >&2
  exit 1
fi

TOKEN="bobif_codex_$(openssl rand -hex 32)"
TMP_FILE="$(mktemp "${CODEX_DIR}/.env.XXXXXX")"
trap 'rm -f "${TMP_FILE}"' EXIT

if [[ -f "${ENV_FILE}" ]]; then
  grep -v '^BOB_CORE_CODEX_TOKEN=' "${ENV_FILE}" > "${TMP_FILE}" || true
fi

printf 'BOB_CORE_CODEX_TOKEN=%s\n' "${TOKEN}" >> "${TMP_FILE}"
mv "${TMP_FILE}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
trap - EXIT

TOKEN_HASH="$(printf '%s' "${TOKEN}" | shasum -a 256 | awk '{print $1}')"
unset TOKEN

printf '%s\n' "Codex Bob Core token saved securely to ${ENV_FILE}."
printf '%s\n' "Raw token was not printed."
printf 'SHA256: %s\n' "${TOKEN_HASH}"
printf '%s\n' "Restart the Codex desktop app after Bob Core registers this hash."
