#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failure_count=0

report_path() {
  local relative_path="$1"
  local active_source_path

  if [[ -d "${repo_root}/${relative_path}" ]]; then
    # The retirement contract tests intentionally remain under the retired
    # route directories. Only active TypeScript source is a failure here.
    active_source_path="$(find "${repo_root}/${relative_path}" -type f \
      \( -name '*.ts' -o -name '*.tsx' \) \
      ! -path '*/__tests__/*' \
      ! -name '*.test.ts' \
      ! -name '*.test.tsx' \
      -print -quit)"
  else
    active_source_path="${repo_root}/${relative_path}"
  fi

  if [[ -n "${active_source_path}" && -e "${active_source_path}" ]]; then
    printf 'FAIL [retired-path]: %s\n' "$relative_path" >&2
    failure_count=$((failure_count + 1))
  fi
}

report_pattern() {
  local label="$1"
  local pattern="$2"
  shift 2

  local output
  local status

  set +e
  output="$(rg -n --no-heading --color never "$pattern" "$@" 2>&1)"
  status=$?
  set -e

  case "$status" in
    0)
      printf 'FAIL [%s]:\n%s\n' "$label" "$output" >&2
      failure_count=$((failure_count + 1))
      ;;
    1)
      ;;
    *)
      printf 'FAIL [scan-error:%s]: rg exited %d\n%s\n' \
        "$label" "$status" "$output" >&2
      failure_count=$((failure_count + 1))
      ;;
  esac
}

retired_paths=(
  'src/app/(auth)/sign-up'
  'src/app/(auth)/verify-email'
  'src/app/(protected)/dashboard/onboarding-wizard.tsx'
  'src/app/(protected)/dashboard/manage-billing-button.tsx'
  'src/app/(protected)/dashboard/provisioning-progress.tsx'
  'src/app/(protected)/dashboard/restart-button.tsx'
  'src/app/(protected)/dashboard/settings/delete-account.tsx'
  'src/app/(protected)/dashboard/setup-wizard.tsx'
  'src/app/api/account/delete'
  'src/app/api/admin/hermes/dashboard-auth'
  'src/app/api/engine/restart'
  'src/app/api/engine/sessions'
  'src/app/api/instance/auth-status'
  'src/app/api/instance/status'
  'src/app/api/instance/terminal-ticket'
  'src/app/api/provisioner/callback'
  'src/app/api/stripe'
  'src/app/api/subscription'
  'src/app/api/wizard'
  'src/app/checkout'
  'src/app/pricing'
  'src/lib/billing.ts'
  'src/lib/emails/payment-failure-email.tsx'
  'src/lib/stripe-webhook-handlers.ts'
  'src/lib/stripe.ts'
  'src/lib/require-pro-or-admin.ts'
)

for path in "${retired_paths[@]}"; do
  report_path "$path"
done

report_pattern \
  'stripe-dependency' \
  "\"stripe\"[[:space:]]*:|from[[:space:]]+[\"']stripe[\"']" \
  "${repo_root}/package.json" "${repo_root}/package-lock.json" \
  "${repo_root}/src"

report_pattern \
  'retired-environment' \
  '(^|[^A-Z])(STRIPE_[A-Z0-9_]*|NEXT_PUBLIC_STRIPE_[A-Z0-9_]*|BILLING_ENABLED|INVITED_EMAILS|PROVISIONER_CALLBACK_URL)([^A-Z0-9_]|$)' \
  "${repo_root}/.env.example" "${repo_root}/src" \
  --glob '!**/*.test.*' --glob '!**/__tests__/**'

report_pattern \
  'retired-provisioner-method' \
  '\.(provision|deprovision|restart|writeSecrets|configureDashboardAuth|getSessions)\(' \
  "${repo_root}/src" \
  --glob '!**/*.test.*' --glob '!**/__tests__/**'

report_pattern \
  'retired-provisioner-surface' \
  '(^|[^[:alnum:]_])(provision|deprovision|restart|writeSecrets|configureDashboardAuth|getSessions)[[:space:]]*\(' \
  "${repo_root}/src/lib/provisioner.ts"

report_pattern \
  'retired-route-reference' \
  "/api/(stripe|subscription|wizard)(/|[\"'])|/api/provisioner/callback" \
  "${repo_root}/src" \
  --glob '!**/*.test.*' --glob '!**/__tests__/**' \
  --glob '!**/middleware-utils.ts'

report_pattern \
  'subscription-authority' \
  'requireSubscription|requireProOrAdmin|isInvitedEmail|export const subscription|subscriptionRelations|/pricing' \
  "${repo_root}/src" \
  --glob '!**/*.test.*' --glob '!**/__tests__/**' \
  --glob '!**/middleware-utils.ts'

report_pattern \
  'customer-lifecycle-copy' \
  '(created after payment|manage billing|billing portal|choose (a )?plan|subscription required)' \
  "${repo_root}/src/app" "${repo_root}/src/lib" \
  --glob '!**/*.test.*' --glob '!**/__tests__/**'

if (( failure_count > 0 )); then
  printf 'legacy customer lifecycle qualification: FAIL (%d categories)\n' \
    "$failure_count" >&2
  printf '%s\n' \
    'NOTE: generic business terms and Telegram/Discord bridge wizards are intentionally not scanned.' >&2
  exit 1
fi

printf '%s\n' 'legacy customer lifecycle qualification: PASS'
