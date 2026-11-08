#pragma once
#include <cstring>
#include "driver/uart.h"
#ifdef CONFIG_IDF_TARGET_ESP32S3
#include <cstdio>
#include <fcntl.h>
#include <unistd.h>
#include "driver/usb_serial_jtag.h"
#endif

inline int aangan_door_step(const char *s) {
  if (!s || !s[0]) return -1;
  if (!strcmp(s, "available") || !strcmp(s, "ok") || !strcmp(s, "0")) return 0;
  if (!strcmp(s, "class") || !strcmp(s, "wait") || !strcmp(s, "1")) return 1;
  if (!strcmp(s, "meeting") || !strcmp(s, "2")) return 2;
  if (!strcmp(s, "audio_rec") || !strcmp(s, "onair") || !strcmp(s, "3")) return 3;
  if (!strcmp(s, "video_rec") || !strcmp(s, "4")) return 4;
  if (!strcmp(s, "door") || !strcmp(s, "door_open") || !strcmp(s, "5")) return 5;
  if (!strcmp(s, "loud") || !strcmp(s, "too_loud") || !strcmp(s, "6")) return 6;
  if (!strcmp(s, "emergency") || !strcmp(s, "7")) return 7;
  if (!strcmp(s, "sos") || !strcmp(s, "8")) return 8;
  if (!strcmp(s, "delivery") || !strcmp(s, "9")) return 9;
  if (!strcmp(s, "preflight") || !strcmp(s, "prep") || !strcmp(s, "10")) return 10;
  if (!strcmp(s, "offline") || !strcmp(s, "11")) return 11;
  return -1;
}

inline int aangan_eat_line(uint8_t c, char *buf, int *n, int cap) {
  if (c == '\n' || c == '\r') {
    if (*n == 0) return -1;
    buf[*n] = 0;
    *n = 0;
    const char *s = buf;
    if (!strncmp(s, "SET ", 4)) s += 4;
    return aangan_door_step(s);
  }
  if (*n < cap - 1) buf[(*n)++] = (char)c;
  else *n = 0;
  return -1;
}

#ifdef CONFIG_IDF_TARGET_ESP32S3
// ESPHome's USB logger owns the JTAG driver via VFS. Bytes often never
// reach usb_serial_jtag_read_bytes, so also drain stdin (non-blocking).
inline int aangan_poll_usb(char *buf, int *n, int cap) {
  int step = -1;
  uint8_t tmp[32];
  int got = usb_serial_jtag_read_bytes(tmp, sizeof(tmp), 0);
  for (int k = 0; k < got; k++) {
    int i = aangan_eat_line(tmp[k], buf, n, cap);
    if (i >= 0) step = i;
  }
  int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
  fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);
  int c;
  while ((c = getchar()) != EOF) {
    int i = aangan_eat_line((uint8_t)c, buf, n, cap);
    if (i >= 0) step = i;
  }
  clearerr(stdin);
  fcntl(STDIN_FILENO, F_SETFL, flags);
  return step;
}
#endif
