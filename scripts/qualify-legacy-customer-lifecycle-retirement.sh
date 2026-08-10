#!/usr/bin/env bash
set -euo pipefail

repo_root="${LEGACY_LIFECYCLE_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
failure_count=0
temporary_paths=()

cleanup() {
  if ((${#temporary_paths[@]} > 0)); then
    rm -f -- "${temporary_paths[@]}"
  fi
}

trap cleanup EXIT

report_path() {
  local relative_path="$1"
  local active_source_path

  if [[ -d "${repo_root}/${relative_path}" ]]; then
    # The retirement contract tests intentionally remain under the retired
    # route directories. Every other file is active-source evidence.
    active_source_path="$(find "${repo_root}/${relative_path}" -type f \
      ! -path '*/__tests__/*' \
      ! -name '*.test.*' \
      ! -name '*.spec.*' \
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

expected_retired_routes=(
  "/sign-up"
  "/verify-email"
  "/pricing"
  "/checkout/success"
  "/api/stripe/checkout"
  "/api/stripe/portal"
  "/api/stripe/webhook"
  "/api/account/delete"
  "/api/subscription"
  "/api/waitlist"
  "/api/wizard/write-step"
  "/api/wizard/complete"
  "/api/provisioner/callback"
  "/api/instance/status"
  "/api/instance/auth-status"
  "/api/instance/terminal-ticket"
  "/api/engine/restart"
  "/api/engine/sessions"
  "/api/admin/hermes/dashboard-auth"
)

middleware_utils_path="${repo_root}/src/lib/middleware-utils.ts"
if [[ ! -f "$middleware_utils_path" ]]; then
  printf 'FAIL [middleware-registry]: missing %s\n' "$middleware_utils_path" >&2
  failure_count=$((failure_count + 1))
else
  actual_registry_routes="$({
    awk '
      /const RETIRED_ROUTES = new Set\(\[/ { in_registry = 1; next }
      in_registry && /^\]\);/ { exit }
      in_registry { print }
    ' "$middleware_utils_path" |
      sed -n 's/^[[:space:]]*"\([^"]*\)"[,]*$/\1/p' |
      sort
  })"
  expected_registry_routes="$(printf '%s\n' "${expected_retired_routes[@]}" | sort)"
  if [[ "$actual_registry_routes" != "$expected_registry_routes" ]]; then
    printf 'FAIL [middleware-registry]: retired route deny registry drifted\n' >&2
    failure_count=$((failure_count + 1))
  fi
fi

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
  'src/app/api/waitlist'
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

if [[ -f "$middleware_utils_path" ]]; then
  middleware_outside_registry="$(mktemp)"
  temporary_paths+=("$middleware_outside_registry")
  awk '
    /const RETIRED_ROUTES = new Set\(\[/ { in_registry = 1; next }
    in_registry && /^\]\);/ { in_registry = 0; next }
    !in_registry { print }
  ' "$middleware_utils_path" > "$middleware_outside_registry"

  report_pattern \
    'retired-route-reference' \
    "/api/(stripe|subscription|wizard)(/|[\"'])|/api/provisioner/callback" \
    "$middleware_outside_registry"

  report_pattern \
    'subscription-authority' \
    'requireSubscription|requireProOrAdmin|isInvitedEmail|export const subscription|subscriptionRelations|/pricing' \
    "$middleware_outside_registry"
fi

report_pattern \
  'residual-customer-lifecycle-source' \
  'waitlist|Waitlist|sendWelcomeEmail|sendProvisioningEmail|WelcomeEmail|ProvisioningEmail|createInstance|updateInstanceStatus|generateTenantId|allocatePort|generateBearerToken|hashToken' \
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
