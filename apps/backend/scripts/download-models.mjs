#!/usr/bin/env node
/**
 * Downloads face-api.js model weights into `public/models` if they are not
 * already present. Mirrors the file layout `@vladmandic/face-api` expects when
 * loading from disk.
 *
 * Usage:  node scripts/download-models.mjs
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_DIR = path.resolve(__dirname, "..", "public", "models");
const BASE = "https://raw.githubusercontent.com/vladmandic/face-api/master/model";

const MODELS = [
  // SSD MobileNet v1 (face detector).
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model.bin",
  // 68-point face landmark detector.
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  // Face recognition (128-D embedding).
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buffer);
}

async function main() {
  await fsp.mkdir(TARGET_DIR, { recursive: true });
  let downloaded = 0;
  for (const filename of MODELS) {
    const dest = path.join(TARGET_DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`✓ ${filename} (already present)`);
      continue;
    }
    const url = `${BASE}/${filename}`;
    process.stdout.write(`↓ ${filename} ... `);
    await downloadFile(url, dest);
    process.stdout.write("ok\n");
    downloaded++;
  }
  console.log(
    downloaded === 0
      ? "All models already present."
      : `Downloaded ${downloaded} model file(s) to ${TARGET_DIR}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
