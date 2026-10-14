#!/usr/bin/env bash
# Install Pi Pad on this Raspberry Pi as a service that starts at boot.
#
#     bash pi/remote/install.sh          (as your normal user — not sudo)
#
# Safe to run again; it overwrites its own files and keeps the same PIN.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user, not with sudo. It asks for a password when it needs one."
  exit 1
fi

HERE=$(cd "$(dirname "$0")" && pwd)
USER_NAME=$(id -un)
DEST=/opt/pipad
PORT=${PIPAD_PORT:-8765}

echo "== 1/5 packages"
sudo apt-get install -y -qq python3-evdev qrencode >/dev/null

echo "== 2/5 /dev/uinput — loaded at boot, usable by the 'input' group"
echo uinput | sudo tee /etc/modules-load.d/pipad-uinput.conf >/dev/null
sudo modprobe uinput
echo 'KERNEL=="uinput", SUBSYSTEM=="misc", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"' \
  | sudo tee /etc/udev/rules.d/99-pipad-uinput.rules >/dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=misc --sysname-match=uinput || true
sudo chgrp input /dev/uinput && sudo chmod 0660 /dev/uinput     # for this boot, before udev re-applies
sudo usermod -aG input "$USER_NAME"

echo "== 3/5 files to $DEST"
sudo mkdir -p "$DEST"
sudo cp "$HERE/pipad.py" "$DEST/"
sudo rm -rf "$DEST/web" && sudo cp -R "$HERE/web" "$DEST/web"
sudo chmod -R a+rX "$DEST"

echo "== 4/5 PIN (kept across reinstalls)"
PIN=$(python3 -c "import sys, pathlib; sys.path.insert(0, '$DEST'); import pipad; \
print(pipad.load_or_create_pin(pathlib.Path('~/.config/pipad/pin').expanduser()))")

echo "== 5/5 service"
sed "s|__USER__|$USER_NAME|g; s|__HOME__|$HOME|g; s|__PORT__|$PORT|g" "$HERE/pipad.service" \
  | sudo tee /etc/systemd/system/pipad.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable pipad.service >/dev/null
sudo systemctl restart pipad.service
sleep 1
if ! systemctl is-active --quiet pipad.service; then
  echo "Pi Pad did not start. Last log lines:"
  sudo journalctl -u pipad.service -n 25 --no-pager
  exit 1
fi

URL="http://$(hostname).local:$PORT/?pin=$PIN"
echo
echo "Pi Pad is running."
echo
echo "On the iPhone or iPad, open this in Safari:"
echo "    $URL"
for ip in $(hostname -I); do
  case "$ip" in *:*) ;; *) echo "    or http://$ip:$PORT/?pin=$PIN" ;; esac
done
echo
echo "Then Share → Add to Home Screen. It opens full-screen from then on."
echo "Or point the iPhone camera at this:"
qrencode -t ansiutf8 "$URL" || true
