#!/usr/bin/env bash
set -euo pipefail

local_iso="$(TZ=America/Chicago date '+%Y-%m-%dT%H:%M:%S%z')"
local_dow="$(TZ=America/Chicago date '+%u')"
local_hour="$(TZ=America/Chicago date '+%H')"

if [[ "$local_dow" == "6" && "$local_hour" == "23" ]]; then
  echo "Central local time gate passed for weekly prospect automation: $local_iso"
  echo '{"wakeAgent": true}'
else
  echo "Central local time gate skipped weekly prospect automation: $local_iso; requires Saturday 23:00 America/Chicago."
  echo '{"wakeAgent": false}'
fi
