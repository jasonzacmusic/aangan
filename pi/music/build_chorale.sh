#!/usr/bin/env bash
# Build Chorale for Linux on the Pi: the standalone app and the VST3 for REAPER.
#
#     bash pi/music/build_chorale.sh /path/to/chorale-source     (as your normal user)
#
# The source is copied from the Mac (the repo is private). First build of JUCE on
# a Pi 5 takes a while; -j3 keeps it inside 8 GB of RAM.
set -euo pipefail
SRC=${1:?usage: build_chorale.sh <chorale source dir>}
cd "$SRC"
echo "== JUCE's Linux build dependencies"
sudo apt-get install -y -qq build-essential cmake pkg-config git \
  libasound2-dev libjack-jackd2-dev libfreetype-dev libfontconfig1-dev \
  libx11-dev libxext-dev libxinerama-dev libxrandr-dev libxcursor-dev \
  libxcomposite-dev libxrender-dev libglu1-mesa-dev libcurl4-openssl-dev \
  libwebkit2gtk-4.1-dev >/dev/null || true
echo "== configure"
cmake -B build-linux -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="-mcpu=cortex-a76"
echo "== build (standalone + VST3)"
cmake --build build-linux --target Chorale_Standalone Chorale_VST3 -j3
ART=build-linux/Chorale_artefacts/Release
mkdir -p "$HOME/.vst3" "$HOME/.local/bin" "$HOME/.local/share/applications"
rm -rf "$HOME/.vst3/Chorale.vst3" && cp -R "$ART/VST3/Chorale.vst3" "$HOME/.vst3/"
install -m 0755 "$ART/Standalone/Chorale" "$HOME/.local/bin/Chorale"
printf '[Desktop Entry]\nType=Application\nName=Chorale\nExec=%s\nCategories=AudioVideo;Audio;Music;\n' \
  "$HOME/.local/bin/Chorale" > "$HOME/.local/share/applications/chorale.desktop"
echo "Chorale installed: standalone in the menu, VST3 in ~/.vst3 for REAPER."
