#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  export "$key"="$value"
done < "$ENV_FILE"

cd "$SCRIPT_DIR"
exec npm run verify -- \
  --network "$NETWORK" \
  --policy-id "$POLICY_ID" \
  --lazer-token "$LAZER_TOKEN" \
  --provider "$PROVIDER" \
  --provider-token "$PROVIDER_TOKEN"
