#!/usr/bin/env bash
# prune_backups.sh — optional hook to delete local backups/ snapshots older than
# the last N commits (default 5). Not enabled in .pre-commit-config.yaml by default.
#
# Usage:
#   bash hooks/scripts/prune_backups.sh
#   POLICY_BACKUP_KEEP_COMMITS=5 bash hooks/scripts/prune_backups.sh
#
# Expects timestamped dirs under backups/ (e.g. backups/20260709-inventory-policies/).
# Only removes directories whose mtime is older than the author date of HEAD~N.

set -euo pipefail

KEEP_COMMITS="${POLICY_BACKUP_KEEP_COMMITS:-5}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
BACKUP_DIR="${ROOT}/backups"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  exit 0
fi

if ! git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[prune-backups] not a git repo; skip" >&2
  exit 0
fi

# Unix timestamp of the oldest commit we still care about
KEEP_SINCE="$(git -C "${ROOT}" log -"${KEEP_COMMITS}" --pretty=format:%ct | tail -1 || true)"
if [[ -z "${KEEP_SINCE}" ]]; then
  exit 0
fi

shopt -s nullglob
for d in "${BACKUP_DIR}"/*; do
  [[ -d "${d}" ]] || continue
  # Skip if name looks like a reserved path
  base="$(basename "${d}")"
  [[ "${base}" == .* ]] && continue

  mtime="$(stat -c %Y "${d}" 2>/dev/null || stat -f %m "${d}")"
  if (( mtime < KEEP_SINCE )); then
    echo "[prune-backups] removing stale backup: ${d}"
    rm -rf "${d}"
  fi
done

exit 0
