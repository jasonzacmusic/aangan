#!/usr/bin/env python3
"""Generate Studio Command app icons — a gold rotary dial on true black.
Stdlib only (struct+zlib PNG writer), supersampled for clean edges."""
import math
import os
import struct
import zlib

MASTER = 1024
SS = 2  # supersample factor
W = MASTER * SS

INK = (10, 10, 14)
CARD = (16, 16, 22)
GOLD = (201, 168, 76)
GOLDB = (230, 195, 106)
GREEN = (47, 191, 113)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render():
    cx = cy = W / 2
    r_out = W * 0.335
    r_in = W * 0.23
    r_hub = W * 0.16
    corner = W * 0.22
    px = bytearray(W * W * 3)

    seg_gap_deg = 9
    for y in range(W):
        for x in range(W):
            # rounded-square card mask
            dx = min(x, W - 1 - x)
            dy = min(y, W - 1 - y)
            inside = True
            if dx < corner and dy < corner:
                if math.hypot(corner - dx, corner - dy) > corner:
                    inside = False
            i = (y * W + x) * 3
            if not inside:
                px[i : i + 3] = bytes((0, 0, 0))
                continue
            # subtle vertical card gradient
            t = y / W
            base = lerp(CARD, INK, t)
            r, g, b = base

            ddx = x - cx
            ddy = y - cy
            dist = math.hypot(ddx, ddy)
            ang = math.degrees(math.atan2(ddy, ddx))  # -180..180

            # ring of 6 segments
            if r_in <= dist <= r_out:
                a = (ang + 90) % 360
                seg = int(a // 60)
                within = a % 60
                if seg_gap_deg / 2 < within < 60 - seg_gap_deg / 2:
                    if seg == 0:  # top segment glows green (Available)
                        r, g, b = lerp(base, GREEN, 0.92)
                    else:
                        r, g, b = lerp(base, GOLD, 0.28)
            # thin outer engraved circle
            if abs(dist - r_out * 1.09) < W * 0.004:
                r, g, b = lerp((r, g, b), GOLD, 0.5)
            # hub
            if dist <= r_hub:
                hub_t = dist / r_hub
                r, g, b = lerp((30, 30, 38), (14, 14, 18), hub_t)
                # needle pointing up
                if abs(ddx) < W * 0.012 and -r_hub * 0.92 < ddy < -r_hub * 0.25:
                    r, g, b = GOLDB
                if dist < W * 0.018:
                    r, g, b = GOLD
            px[i : i + 3] = bytes((r, g, b))
    return px


def downsample(px):
    out = bytearray(MASTER * MASTER * 3)
    for y in range(MASTER):
        for x in range(MASTER):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    i = ((y * SS + sy) * W + (x * SS + sx)) * 3
                    for c in range(3):
                        acc[c] += px[i + c]
            o = (y * MASTER + x) * 3
            n = SS * SS
            out[o : o + 3] = bytes((acc[0] // n, acc[1] // n, acc[2] // n))
    return out


def write_png(path, w, h, rgb):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(rgb[y * w * 3 : (y + 1) * w * 3]) for y in range(h))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    master_path = os.path.join(out_dir, "icon-1024.png")
    print("rendering…")
    write_png(master_path, MASTER, MASTER, downsample(render()))
    print("done:", master_path)
