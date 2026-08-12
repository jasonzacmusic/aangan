import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addon = path.join(root, "aangan_bridge");
const web = path.join(addon, "web");

await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
await cp(path.join(root, "dist"), web, { recursive: true });
await cp(
  path.join(root, "pi", "house", "wrapper", "studio_wrapper.py"),
  path.join(addon, "studio_wrapper.py"),
);

console.log("Aangan Bridge payload refreshed: aangan_bridge/web + studio_wrapper.py");
