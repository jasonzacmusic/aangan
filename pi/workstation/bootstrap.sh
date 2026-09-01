#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# chorale-pi WORKSTATION bootstrap.
#
# Turns a freshly-powered Raspberry Pi 5 into a usable dev machine: remote
# access, AI coding tools, build toolchain, a file share for samples.
#
# Run on the Pi as the normal login user (NOT root, NOT with sudo):
#     bash bootstrap.sh
#
# Safe to run again. It never formats a disk and never deletes your files.
# Every step is independent — if one fails the rest still run, and the
# summary at the end tells you exactly what worked and what did not.
#
# What it deliberately does NOT do:
#   - configure any audio HAT (none is fitted yet — see pi/piano/ for that)
#   - format, partition or erase any drive (a human decides that)
# ---------------------------------------------------------------------------
set -uo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user, not with sudo. The script asks for a"
  echo "password itself when it needs one."
  exit 1
fi

USER_NAME="$(id -un)"
HOME_DIR="$HOME"
LOG="$HOME_DIR/bootstrap-$(date +%Y%m%d-%H%M%S).log"
declare -a RESULTS=()

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_bad()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_head() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step() {                       # step "name" command...
  local name="$1"; shift
  c_head "$name"
  if "$@" >>"$LOG" 2>&1; then
    c_ok   "   ok"
    RESULTS+=("OK   $name")
  else
    c_bad  "   FAILED (see $LOG)"
    RESULTS+=("FAIL $name")
  fi
}

# --------------------------------------------------------------------------
c_head "Where we are"
MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo unknown)
echo "   model : $MODEL"
echo "   os    : $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "   arch  : $(uname -m)"
echo "   kernel: $(uname -r)"
echo "   user  : $USER_NAME"
echo "   log   : $LOG"

case "$MODEL" in *"Raspberry Pi 5"*) ;; *)
  c_bad "   ⚠ This does not look like a Raspberry Pi 5. Continuing anyway." ;;
esac
if [ "$(uname -m)" != "aarch64" ]; then
  c_bad "   ⚠ Not a 64-bit OS. Claude Code, Codex and VS Code all need 64-bit."
  c_bad "     Stop here and re-flash with Raspberry Pi OS (64-bit)."
fi

# --------------------------------------------------------------------------
step "System update (this is the slow one)" bash -c '
  sudo apt-get update -qq && sudo apt-get -y -qq upgrade'

step "Build toolchain and everyday tools" bash -c '
  sudo apt-get install -y -qq \
    git curl wget unzip build-essential cmake pkg-config \
    python3 python3-pip python3-venv \
    htop tmux rsync jq ripgrep alsa-utils'

# --------------------------------------------------------------------------
# Remote access. rpi-connect gives a full desktop in any browser with no port
# forwarding; the -lite variant is shell-only and is what a headless Pi wants.
HAS_DESKTOP=no
[ "$(systemctl get-default 2>/dev/null)" = "graphical.target" ] && HAS_DESKTOP=yes
echo "   desktop: $HAS_DESKTOP"

step "Raspberry Pi Connect (browser access, no VPN needed)" bash -c '
  if [ "'"$HAS_DESKTOP"'" = yes ]; then
    sudo apt-get install -y -qq rpi-connect        # full: shell + screen sharing
  else
    sudo apt-get install -y -qq rpi-connect-lite   # headless: shell only
  fi'

step "Enable SSH" bash -c '
  sudo systemctl enable --now ssh'

# --------------------------------------------------------------------------
# Node is not needed by Claude Code (the native installer is self-contained)
# but plenty of other tooling wants it, and the repo is a Node project.
step "Node.js LTS" bash -c '
  if ! command -v node >/dev/null || [ "$(node -v | sed "s/v\([0-9]*\).*/\1/")" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi
  node -v'

step "Claude Code" bash -c '
  curl -fsSL https://claude.ai/install.sh | bash'

# Codex ships a statically-linked aarch64 musl binary. Resolve the real asset
# URL from the GitHub API rather than guessing a filename that may change.
step "OpenAI Codex CLI" bash -c '
  set -e
  url=$(curl -fsSL https://api.github.com/repos/openai/codex/releases/latest \
        | grep -o "https://[^\"]*codex-aarch64-unknown-linux-musl[^\"]*\.tar\.gz" \
        | head -1)
  [ -n "$url" ] || { echo "no aarch64 asset found in latest release"; exit 1; }
  tmp=$(mktemp -d)
  curl -fsSL "$url" -o "$tmp/codex.tar.gz"
  tar -xzf "$tmp/codex.tar.gz" -C "$tmp"
  bin=$(find "$tmp" -type f -name "codex*" ! -name "*.tar.gz" | head -1)
  [ -n "$bin" ] || { echo "no binary inside archive"; exit 1; }
  sudo install -m 0755 "$bin" /usr/local/bin/codex
  rm -rf "$tmp"
  codex --version'

if [ "$HAS_DESKTOP" = yes ]; then
step "VS Code (arm64)" bash -c '
  if ! command -v code >/dev/null; then
    wget -qO- https://packages.microsoft.com/keys/microsoft.asc \
      | gpg --dearmor > /tmp/ms.gpg
    sudo install -D -o root -g root -m 644 /tmp/ms.gpg \
      /etc/apt/keyrings/packages.microsoft.gpg
    echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" \
      | sudo tee /etc/apt/sources.list.d/vscode.list >/dev/null
    rm -f /tmp/ms.gpg
    sudo apt-get update -qq
  fi
  sudo apt-get install -y -qq code'
else
  c_head "VS Code"
  echo "   skipped — this is a headless (Lite) install, so a desktop editor has"
  echo "   nowhere to draw. Use VS Code on the Mac with the Remote-SSH extension"
  echo "   and point it at this Pi: you get the Mac's speed, the Pi's Linux."
  RESULTS+=("SKIP VS Code (headless)")
fi

# --------------------------------------------------------------------------
# Harmless now, needed the moment an audio board arrives. Doing it here means
# the audio setup later is purely "fit board, set overlay, reboot".
step "Realtime audio limits and performance governor" bash -c '
  sudo mkdir -p /etc/security/limits.d
  printf "@audio - rtprio 95\n@audio - memlock unlimited\n" \
    | sudo tee /etc/security/limits.d/audio.conf >/dev/null
  sudo usermod -aG audio "'"$USER_NAME"'"
  sudo apt-get install -y -qq cpufrequtils
  echo "GOVERNOR=\"performance\"" | sudo tee /etc/default/cpufrequtils >/dev/null'

# --------------------------------------------------------------------------
# A share so Jason can drag sample libraries straight from the Mac in Finder.
step "Samba share at /srv/samples (visible from the Mac as 'samples')" bash -c '
  sudo apt-get install -y -qq samba
  sudo mkdir -p /srv/samples
  sudo chown "'"$USER_NAME"'":"'"$USER_NAME"'" /srv/samples
  if ! grep -q "^\[samples\]" /etc/samba/smb.conf; then
    sudo tee -a /etc/samba/smb.conf >/dev/null <<EOF

[samples]
   path = /srv/samples
   browseable = yes
   read only = no
   guest ok = no
   valid users = '"$USER_NAME"'
EOF
  fi
  sudo systemctl restart smbd'

# --------------------------------------------------------------------------
c_head "Storage attached right now"
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT 2>/dev/null | sed 's/^/   /'
echo
echo "   Nothing above was formatted or mounted. That is deliberate — erasing"
echo "   a disk is a decision a person makes, not a script."
echo "   When a drive is fitted, say the word and I will mount it at /srv/samples."

# --------------------------------------------------------------------------
c_head "Summary"
for r in "${RESULTS[@]}"; do
  case "$r" in
    OK*)   c_ok  "   $r" ;;
    FAIL*) c_bad "   $r" ;;
    *)     echo  "   $r" ;;
  esac
done

c_head "How to reach this Pi"
echo "   hostname : $(hostname)"
echo "   addresses:"
hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | sed 's/^/     /'
echo "   temp     : $(vcgencmd measure_temp 2>/dev/null || echo n/a)"
echo
echo "   From the Mac:  ssh $USER_NAME@$(hostname).local"
echo
echo "   TWO THINGS A PERSON MUST DO (they need a login, so a script cannot):"
echo "     1. rpi-connect signin     → then open the link it prints, sign in once."
echo "                                 After that the Pi is reachable from any"
echo "                                 browser at connect.raspberrypi.com"
echo "     2. claude                 → sign in to Claude Code on first launch."
echo "        codex                  → sign in to Codex on first launch."
echo
echo "   Full log: $LOG"
