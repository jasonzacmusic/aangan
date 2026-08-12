#!/usr/bin/with-contenv bashio
set -euo pipefail

export PORT=8126
export HA_URL=http://supervisor/core
export HA_TOKEN="${SUPERVISOR_TOKEN}"
export STATE_FILE=/data/aangan-state.json
export WEB_ROOT=/app/web
export PIANO_URL="$(bashio::config 'piano_url')"
export ALLOWED_ORIGINS="$(bashio::config 'allowed_origins')"
export ALLOW_COMMISSIONING="$(bashio::config 'allow_commissioning')"
export FLEET_TARGETS="$(bashio::config 'fleet_targets')"

bashio::log.info "Starting Aangan on port ${PORT}"
exec python3 /app/studio_wrapper.py
