import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 300 * 1024;
const distDir = join(process.cwd(), "dist");
const assetsDir = join(distDir, "assets");
const html = await readFile(join(distDir, "index.html"), "utf8");
const names = (await readdir(assetsDir)).filter((name) => name.endsWith(".js")).sort();

if (names.length === 0) {
  console.error("no JS assets in dist/assets");
  process.exit(1);
}

let firstLoadGzip = 0;

for (const name of names) {
  const raw = await readFile(join(assetsDir, name));
  const gzip = gzipSync(raw, { level: 9 }).byteLength;
  const firstLoad = html.includes(name);
  if (firstLoad) {
    firstLoadGzip += gzip;
  }
  const kb = (n) => (n / 1024).toFixed(2);
  console.log(
    `${name}  ${raw.byteLength} B  gzip ${gzip} B (${kb(gzip)} KB)  ${firstLoad ? "first-load" : "lazy"}`,
  );
}

const kb = (n) => (n / 1024).toFixed(2);
console.log(
  `first-load JS gzip ${firstLoadGzip} B (${kb(firstLoadGzip)} KB) / ${BUDGET_BYTES} B (${kb(BUDGET_BYTES)} KB)`,
);

if (firstLoadGzip > BUDGET_BYTES) {
  console.error(
    `first-load JS gzip ${firstLoadGzip} B exceeds budget ${BUDGET_BYTES} B`,
  );
  process.exit(1);
}
