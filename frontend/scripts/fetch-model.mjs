// Optional: self-host the MediaPipe face model (for offline / air-gapped stores).
// Usage: node scripts/fetch-model.mjs  then set NEXT_PUBLIC_FACE_MODEL_URL=/models/face_landmarker.task
import { mkdirSync, writeFileSync } from "node:fs";
const url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/face_landmarker.task", Buffer.from(await res.arrayBuffer()));
console.log("Saved public/models/face_landmarker.task");
