#!/usr/bin/env bash
# Low-latency tuning for live performance and studio recording on chorale-pi.
#
#     bash pi/music/tune_latency.sh        (as your normal user; reboot after)
#
# Each change is a standard, reversible setting. Nothing here overclocks.
set -euo pipefail
[ "$(id -u)" -eq 0 ] && { echo "Run as your normal user, not sudo."; exit 1; }
U=$(id -un)

echo "== real-time priority for audio, and no memory paging for it"
sudo mkdir -p /etc/security/limits.d
printf '@audio - rtprio 95\n@audio - memlock unlimited\n@audio - nice -19\n' \
  | sudo tee /etc/security/limits.d/95-audio.conf >/dev/null
sudo usermod -aG audio "$U"

echo "== CPU always at full speed (no ramp-up delay when a note arrives)"
sudo tee /etc/systemd/system/cpu-performance.service >/dev/null <<'UNIT'
[Unit]
Description=Hold every CPU core at full clock for low-latency audio
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo performance > "$g"; done'
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now cpu-performance.service

echo "== interrupts in their own threads, so audio can outrank them"
CMD=/boot/firmware/cmdline.txt
grep -qw threadirqs "$CMD" || sudo sed -i '1 s/$/ threadirqs/' "$CMD"

echo "== keep the system from swapping audio out of memory"
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-audio.conf >/dev/null
sudo sysctl -q -p /etc/sysctl.d/90-audio.conf

echo "== PipeWire: 48 kHz, 128-sample buffer by default, down to 32 when an app asks"
sudo mkdir -p /etc/pipewire/pipewire.conf.d
sudo tee /etc/pipewire/pipewire.conf.d/10-low-latency.conf >/dev/null <<'CONF'
context.properties = {
    default.clock.rate          = 48000
    default.clock.allowed-rates = [ 44100 48000 96000 ]
    default.clock.quantum       = 128
    default.clock.min-quantum   = 32
    default.clock.max-quantum   = 1024
}
CONF

echo "== Wi-Fi power saving off (it causes timing hiccups)"
sudo mkdir -p /etc/NetworkManager/conf.d
printf '[connection]\nwifi.powersave = 2\n' | sudo tee /etc/NetworkManager/conf.d/90-no-powersave.conf >/dev/null

echo "== a real-time kernel, if Raspberry Pi publishes one for the Pi 5"
RT=$(apt-cache search --names-only '^linux-image-.*2712.*rt' 2>/dev/null | awk '{print $1}' | head -1 || true)
if [ -n "$RT" ]; then
  echo "   found $RT — installing (takes effect after reboot)"
  sudo apt-get install -y -qq "$RT" >/dev/null
else
  echo "   none published; the standard kernel with threadirqs is used. That is fine down to ~5 ms."
fi
echo
echo "Done. Reboot for threadirqs and any new kernel to take effect."
