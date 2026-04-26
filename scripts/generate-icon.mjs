import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG = path.join(ROOT, "public", "opnrgg.svg");
const BUILD_DIR = path.join(ROOT, "build");
const PUBLIC_DIR = path.join(ROOT, "public");

const SIZES = [16, 24, 32, 48, 64, 128, 256];

await mkdir(BUILD_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

const pngBuffers = await Promise.all(
  SIZES.map((size) =>
    sharp(SVG, { density: 24, limitInputPixels: false })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
);

const ico = await pngToIco(pngBuffers);
await writeFile(path.join(BUILD_DIR, "icon.ico"), ico);

const png256 = pngBuffers[SIZES.indexOf(256)];
await writeFile(path.join(BUILD_DIR, "icon.png"), png256);

const png32 = pngBuffers[SIZES.indexOf(32)];
await writeFile(path.join(PUBLIC_DIR, "favicon.png"), png32);

console.log("wrote build/icon.ico, build/icon.png, public/favicon.png");
