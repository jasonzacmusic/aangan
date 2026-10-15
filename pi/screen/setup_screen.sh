#!/usr/bin/env bash
# The Pi's desktop in a browser on the Mac, with nothing exposed to the network.
#
# wayvnc shares the desktop and noVNC turns it into a web page, but BOTH listen
# only on the Pi itself (127.0.0.1). The Mac reaches them through SSH, which is
# locked to the key on Jason's Mac — so a student on the school Wi-Fi cannot
# open the Pi's screen even though no VNC password is set.
#
#     bash pi/screen/setup_screen.sh        (on the Pi, as the normal user)
#
# Then on the Mac:  ssh -fN -L 6080:127.0.0.1:6080 chorale-pi
# and open:         http://localhost:6080/vnc.html?autoconnect=1&resize=scale
set -euo pipefail
[ "$(id -u)" -eq 0 ] && { echo "Run as your normal user, not sudo."; exit 1; }

echo "== 1/3 packages"
sudo apt-get install -y -qq wayvnc novnc websockify >/dev/null

echo "== 2/3 wayvnc, local only"
sudo raspi-config nonint do_vnc 0 || true          # turns the service on (and writes its own config)
sudo mkdir -p /etc/wayvnc
printf 'address=127.0.0.1\nport=5900\nenable_auth=false\n' | sudo tee /etc/wayvnc/config >/dev/null
sudo systemctl restart wayvnc 2>/dev/null || systemctl --user restart wayvnc 2>/dev/null || true

echo "== 3/3 noVNC web viewer, local only"
sudo tee /etc/systemd/system/novnc-local.service >/dev/null <<'UNIT'
[Unit]
Description=noVNC viewer for the local desktop (reachable only through SSH)
After=network.target

[Service]
ExecStart=/usr/bin/websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900
Restart=on-failure
DynamicUser=yes

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now novnc-local.service
sleep 1
systemctl is-active --quiet novnc-local && echo "noVNC running on 127.0.0.1:6080" || { sudo journalctl -u novnc-local -n 20 --no-pager; exit 1; }
ss -ltn | grep -E '127.0.0.1:(5900|6080)' || echo "warning: wayvnc not listening yet (it starts with the desktop session)"
