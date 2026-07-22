#!/usr/bin/env bash
# PIANO Pi one-shot setup — Raspberry Pi 5 + HiFiBerry DAC2 Pro XLR + Pianoteq 9.
# Run on the Pi as: sudo bash setup_piano_pi.sh
set -euo pipefail

CONFIG=/boot/firmware/config.txt
RUN_USER=${SUDO_USER:-pi}
HOME_DIR=$(getent passwd "$RUN_USER" | cut -d: -f6)
HERE=$(cd "$(dirname "$0")" && pwd)

echo "== 1/6 HiFiBerry overlay in $CONFIG"
cp "$CONFIG" "$CONFIG.bak.$(date +%s)"
sed -i 's/^dtparam=audio=on/#dtparam=audio=on  # disabled for HiFiBerry/' "$CONFIG"
sed -i 's/^dtoverlay=vc4-kms-v3d$/dtoverlay=vc4-kms-v3d,noaudio/' "$CONFIG"
grep -q '^dtoverlay=hifiberry-dacplus-pro' "$CONFIG" || echo 'dtoverlay=hifiberry-dacplus-pro' >> "$CONFIG"

echo "== 2/6 realtime audio limits"
mkdir -p /etc/security/limits.d
cat > /etc/security/limits.d/audio.conf <<'EOF'
@audio - rtprio 95
@audio - memlock unlimited
EOF
usermod -aG audio "$RUN_USER"

echo "== 3/6 performance governor"
apt-get update -qq && apt-get install -y -qq cpufrequtils unzip >/dev/null
echo 'GOVERNOR="performance"' > /etc/default/cpufrequtils

echo "== 4/6 unpack Pianoteq (drop the Modartt Linux zip in $HOME_DIR/pianoteq first)"
mkdir -p "$HOME_DIR/pianoteq"
ZIP=$(ls "$HOME_DIR"/pianoteq/pianoteq*.zip 2>/dev/null | head -1 || true)
if [ -n "$ZIP" ]; then
  sudo -u "$RUN_USER" unzip -o -q "$ZIP" -d "$HOME_DIR/pianoteq"
  echo "   unpacked $ZIP"
else
  echo "   ⚠ no zip found — download from your Modartt user area, then re-run this step"
fi
# The aarch64 binary lives under .../arm-64bit/ in the Modartt package.
BIN=$(find "$HOME_DIR/pianoteq" -type f -name "Pianoteq*" -path "*arm-64bit*" ! -name "*.so" | head -1 || true)
echo "   binary: ${BIN:-NOT FOUND YET}"

echo "== 5/6 systemd services"
sed "s|__BIN__|${BIN:-$HOME_DIR/pianoteq/Pianoteq}|g; s|__USER__|$RUN_USER|g; s|__HOME__|$HOME_DIR|g" \
  "$HERE/pianoteq.service" > /etc/systemd/system/pianoteq.service
install -m 0755 "$HERE/piano_status_server.py" /usr/local/bin/piano_status_server.py
sed "s|__USER__|$RUN_USER|g" "$HERE/piano-status.service" > /etc/systemd/system/piano-status.service
systemctl daemon-reload
systemctl enable pianoteq.service piano-status.service

echo "== 6/6 done — reboot to bring up the DAC + Pianoteq"
echo "   after reboot: 'aplay -l' must list the HiFiBerry; first Pianoteq launch needs"
echo "   internet once to activate the Pro licence."
