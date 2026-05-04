import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG = path.join(ROOT, "public", "opnrgg.svg");
const BUILD_DIR = path.join(ROOT, "build");
const PUBLIC_DIR = path.join(ROOT, "public");
const TAURI_ICON_DIR = path.join(ROOT, "src-tauri", "icons");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZES = [32, 128, 256, 512];
const SIZES = [...new Set([...ICO_SIZES, ...PNG_SIZES])];
const ICON_SCALE = 1.24;

await mkdir(BUILD_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });
await mkdir(TAURI_ICON_DIR, { recursive: true });

const pngBuffers = new Map(
  await Promise.all(
    SIZES.map(async (size) => {
    const scaledSize = Math.ceil(size * ICON_SCALE);
    const offset = Math.floor((scaledSize - size) / 2);

      const buffer = await sharp(SVG, { density: 24, limitInputPixels: false })
      .resize(scaledSize, scaledSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extract({ left: offset, top: offset, width: size, height: size })
      .png()
      .toBuffer();

      return [size, buffer];
    })
  )
);

const ico = await pngToIco(ICO_SIZES.map((size) => pngBuffers.get(size)));
await writeFile(path.join(BUILD_DIR, "icon.ico"), ico);
await writeFile(path.join(TAURI_ICON_DIR, "icon.ico"), ico);

const png256 = pngBuffers.get(256);
await writeFile(path.join(BUILD_DIR, "icon.png"), png256);
await writeFile(path.join(TAURI_ICON_DIR, "128x128@2x.png"), png256);

const png32 = pngBuffers.get(32);
await writeFile(path.join(PUBLIC_DIR, "favicon.png"), png32);
await writeFile(path.join(TAURI_ICON_DIR, "32x32.png"), png32);

const png128 = pngBuffers.get(128);
await writeFile(path.join(TAURI_ICON_DIR, "128x128.png"), png128);

const png512 = pngBuffers.get(512);
await writeFile(path.join(TAURI_ICON_DIR, "icon.png"), png512);

console.log("wrote build/icon.ico, build/icon.png, public/favicon.png, src-tauri/icons/*");
