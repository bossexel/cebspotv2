#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${STAGING_PROJECT_REF:-}" ]]; then
  echo "Refusing: STAGING_PROJECT_REF is required." >&2
  exit 2
fi
if [[ ! "$STAGING_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Refusing: project reference has an invalid format." >&2
  exit 2
fi

deployment_doc="$(dirname "$0")/../docs/deployment-2026-10-28.md"
if [[ ! -f "$deployment_doc" ]]; then
  echo "Refusing: deployment reference document is unavailable." >&2
  exit 2
fi
if grep -Fq "$STAGING_PROJECT_REF" "$deployment_doc"; then
  echo "Refusing: target matches a production/beta reference documented for CebSpot." >&2
  exit 2
fi

functions=(payment-maintenance private-upload private-upload-maintenance delete-account)
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf 'Validated isolated staging target; no deploy invoked. Functions: %s\n' "${functions[*]}"
  exit 0
fi
if [[ "${DEPLOY_STAGING_ACK:-}" != "I_HAVE_VERIFIED_THIS_ISOLATED_STAGING_PROJECT" ]]; then
  echo "Refusing: set DEPLOY_STAGING_ACK only after independently verifying the isolated staging project." >&2
  exit 2
fi
for function_name in "${functions[@]}"; do
  supabase functions deploy "$function_name" --project-ref "$STAGING_PROJECT_REF"
done
