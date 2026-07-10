/** Usage: npm run build — gives every production service worker a unique version. */
import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../dist/sw.js", import.meta.url);
const source = await readFile(path, "utf8");
const buildId = `${Date.now().toString(36)}`;
await writeFile(path, source.replaceAll("__BUILD_ID__", buildId));
