#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# chorale-pi MUSIC setup — composition mode.
#
# Installs REAPER (latest stable, ARM64 Linux build), puts Pianoteq where
# REAPER finds it as a plugin, and installs the audio plumbing that connects
# them to whichever audio board is fitted.
#
#     bash pi/music/setup_music.sh      (as your normal user — not sudo)
#
# For the stage piano that boots straight into Pianoteq full-screen, use
# pi/piano/ instead. The two modes are deliberately separate: a composition
# box should open REAPER, not a piano.
#
# Safe to run again. Steps are independent and the summary says what worked.
# ---------------------------------------------------------------------------
set -uo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user, not with sudo."
  exit 1
fi

LOG="$HOME/music-setup-$(date +%Y%m%d-%H%M%S).log"
declare -a RESULTS=()
c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_bad()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_head() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
step() {
  local name="$1"; shift
  c_head "$name"
  if "$@" >>"$LOG" 2>&1; then c_ok "   ok"; RESULTS+=("OK   $name")
  else c_bad "   FAILED (see $LOG)"; RESULTS+=("FAIL $name"); fi
}

if [ "$(uname -m)" != "aarch64" ]; then
  c_bad "This is not a 64-bit ARM system. REAPER and Pianoteq here are ARM64 builds."
  exit 1
fi

# ---------------------------------------------------------------------------
# Raspberry Pi OS runs PipeWire. pipewire-jack gives REAPER a JACK device on
# top of it without a separate JACK server; qpwgraph is the visual patchbay.
step "Audio plumbing (PipeWire JACK, patchbay)" bash -c '
  sudo apt-get install -y -qq pipewire-jack qpwgraph alsa-utils libgtk-3-0'

# ---------------------------------------------------------------------------
# Resolve the current build from the download page rather than hardcoding a
# version that will be stale next month.
step "REAPER (latest stable, ARM64)" bash -c '
  set -e
  file=$(curl -fsSL https://www.reaper.fm/download.php \
         | grep -oE "files/[0-9]+\.x/reaper[0-9]+_linux_aarch64\.tar\.xz" | head -1)
  [ -n "$file" ] || { echo "no aarch64 build on the download page"; exit 1; }
  echo "downloading https://www.reaper.fm/$file"
  tmp=$(mktemp -d)
  curl -fsSL "https://www.reaper.fm/$file" -o "$tmp/reaper.tar.xz"
  tar -xJf "$tmp/reaper.tar.xz" -C "$tmp"
  sudo sh "$tmp/reaper_linux_aarch64/install-reaper.sh" \
    --install /opt --integrate-desktop --usr-local-bin-symlink --quiet
  rm -rf "$tmp"
  test -x /opt/REAPER/reaper'

# ---------------------------------------------------------------------------
# Pianoteq's download sits behind your Modartt login, so a person fetches it.
# Put the Linux zip in ~/pianoteq or ~/Downloads and this step does the rest.
c_head "Pianoteq"
ZIP=$(ls -t "$HOME"/pianoteq/[Pp]ianoteq*.zip "$HOME"/Downloads/[Pp]ianoteq*.zip 2>/dev/null | head -1 || true)
if [ -z "$ZIP" ] && ! find "$HOME/pianoteq" -maxdepth 4 -path "*arm-64bit*" 2>/dev/null | grep -q .; then
  echo "   No Pianoteq download found."
  echo "   Log in at modartt.com → your user area → download the Linux version,"
  echo "   put the zip in ~/Downloads, then run this script again."
  RESULTS+=("SKIP Pianoteq (no download yet)")
else
  step "Pianoteq as a REAPER plugin" bash -c '
    set -e
    mkdir -p "$HOME/pianoteq" "$HOME/.vst" "$HOME/.vst3" "$HOME/.lv2"
    if [ -n "'"$ZIP"'" ]; then unzip -o -q "'"$ZIP"'" -d "$HOME/pianoteq"; fi
    arm=$(find "$HOME/pianoteq" -type d -name "arm-64bit" | head -1)
    [ -n "$arm" ] || { echo "no arm-64bit folder in the Pianoteq package"; exit 1; }
    linked=0
    # Plugins are linked, not copied, so a Pianoteq update needs no re-run.
    while IFS= read -r p; do ln -sfn "$p" "$HOME/.vst3/"; linked=$((linked+1)); done \
      < <(find "$arm" -maxdepth 1 -name "*.vst3")
    while IFS= read -r p; do ln -sfn "$p" "$HOME/.lv2/";  linked=$((linked+1)); done \
      < <(find "$arm" -maxdepth 1 -name "*.lv2")
    while IFS= read -r p; do ln -sfn "$p" "$HOME/.vst/";  linked=$((linked+1)); done \
      < <(find "$arm" -maxdepth 1 -type f -name "*.so")
    bin=$(find "$arm" -maxdepth 1 -type f -perm -u+x ! -name "*.so" | head -1)
    if [ -n "$bin" ]; then
      mkdir -p "$HOME/.local/share/applications"
      printf "[Desktop Entry]\nType=Application\nName=Pianoteq\nExec=\"%s\"\nCategories=AudioVideo;Audio;Music;\n" "$bin" \
        > "$HOME/.local/share/applications/pianoteq.desktop"
    fi
    echo "linked $linked plugin(s) from $arm"
    [ "$linked" -gt 0 ]'
fi

# ---------------------------------------------------------------------------
c_head "Audio devices the Pi can see right now"
aplay -l 2>/dev/null | grep -E "^card" | sed 's/^/   /' || echo "   (none)"
echo "   No audio board is fitted yet, so expect only HDMI here. When the board"
echo "   arrives, it appears in this list and in REAPER's audio settings."

c_head "Summary"
for r in "${RESULTS[@]}"; do
  case "$r" in OK*) c_ok "   $r" ;; FAIL*) c_bad "   $r" ;; *) echo "   $r" ;; esac
done

c_head "What a person still does once"
echo "   1. REAPER licence: copy reaper-license.rk from the Mac into ~/.config/REAPER/"
echo "      (REAPER runs fully without it — it only stops the evaluation nag)."
echo "   2. Open REAPER → Preferences → Audio → Device → JACK. Buffer 128 to start."
echo "   3. First Pianoteq launch needs the internet once, to activate the licence."
echo
echo "   Full log: $LOG"
