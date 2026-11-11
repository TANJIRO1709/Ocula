"use client";

import type { FaceLandmarker as FL, FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { IRIS_MM } from "./optics";

const MODEL_URL =
  process.env.NEXT_PUBLIC_FACE_MODEL_URL ||
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FL> | null = null;

/** Load MediaPipe Face Landmarker once (WASM served from /public so it also works offline). */
export function getLandmarker(): Promise<FL> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const make = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      try {
        return await make("GPU");
      } catch {
        return await make("CPU");
      }
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

// MediaPipe mesh indices
export const IDX = {
  irisA: { center: 468, edges: [469, 471] },
  irisB: { center: 473, edges: [474, 476] },
  eyeA: { top: 159, bottom: 145, outer: 33, inner: 133 },
  eyeB: { top: 386, bottom: 374, outer: 263, inner: 362 },
  noseBridge: 168,
  faceTop: 10,
  chin: 152,
  cheeks: [234, 454],
  jaw: [172, 397],
  forehead: [54, 284],
};

export type Px = { x: number; y: number };
export const toPx = (p: NormalizedLandmark, w: number, h: number): Px => ({ x: p.x * w, y: p.y * h });
export const dist = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y);

const FOCAL_KEY = "ocula.focal_px_per_width";

/** Focal length in px. Uses a per-device calibration (A4-sheet check) if available, else ~60° horizontal FOV. */
export function focalPx(videoWidth: number): number {
  try {
    const k = Number(localStorage.getItem(FOCAL_KEY));
    if (k > 0) return k * videoWidth;
  } catch {
    /* ignore */
  }
  return videoWidth / 2 / Math.tan((60 * Math.PI) / 180 / 2);
}
export function saveFocalCalibration(irisPx: number, knownDistanceM: number, videoWidth: number) {
  const f = (irisPx * knownDistanceM * 1000) / IRIS_MM;
  try {
    localStorage.setItem(FOCAL_KEY, String(f / videoWidth));
  } catch {
    /* ignore */
  }
  return f;
}
export function hasFocalCalibration() {
  try {
    return Number(localStorage.getItem(FOCAL_KEY)) > 0;
  } catch {
    return false;
  }
}

export type FaceMetrics = {
  present: boolean;
  distanceM: number | null;
  irisPx: number | null;
  squint: number; // 0..1 (blendshape)
  blink: number; // 0..1
  gazeX: number | null; // 0 = looking to one corner, 0.5 = centred, 1 = other corner
  yawDeg: number | null;
  rollDeg: number | null;
  brightness: number | null; // 0..255 mean luma
};

export function analyse(res: FaceLandmarkerResult, w: number, h: number): { metrics: FaceMetrics; lm: NormalizedLandmark[] | null } {
  const lm = res.faceLandmarks?.[0];
  const empty: FaceMetrics = { present: false, distanceM: null, irisPx: null, squint: 0, blink: 0, gazeX: null, yawDeg: null, rollDeg: null, brightness: null };
  if (!lm || lm.length < 478) return { metrics: empty, lm: null };
  const P = (i: number) => toPx(lm[i], w, h);
  const irisA = dist(P(IDX.irisA.edges[0]), P(IDX.irisA.edges[1]));
  const irisB = dist(P(IDX.irisB.edges[0]), P(IDX.irisB.edges[1]));
  const irisPx = (irisA + irisB) / 2;
  const distanceM = irisPx > 2 ? (focalPx(w) * IRIS_MM) / irisPx / 1000 : null;

  const bs: Record<string, number> = {};
  for (const c of res.faceBlendshapes?.[0]?.categories ?? []) bs[c.categoryName] = c.score;
  const squint = ((bs.eyeSquintLeft ?? 0) + (bs.eyeSquintRight ?? 0)) / 2;
  const blink = ((bs.eyeBlinkLeft ?? 0) + (bs.eyeBlinkRight ?? 0)) / 2;

  const gazeOf = (iris: number, outer: number, inner: number) => {
    const a = P(outer), b = P(inner), c = P(iris);
    const span = b.x - a.x;
    return Math.abs(span) > 1 ? (c.x - a.x) / span : 0.5;
  };
  const gazeX = (gazeOf(IDX.irisA.center, IDX.eyeA.outer, IDX.eyeA.inner) + (1 - gazeOf(IDX.irisB.center, IDX.eyeB.inner, IDX.eyeB.outer))) / 2;

  let yawDeg: number | null = null, rollDeg: number | null = null;
  const m = res.facialTransformationMatrixes?.[0]?.data;
  if (m && m.length === 16) {
    // column-major rotation: yaw from r20 / r00, roll from r10 / r00
    yawDeg = (Math.atan2(-m[2], Math.hypot(m[0], m[1])) * 180) / Math.PI;
    rollDeg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  }
  return { metrics: { present: true, distanceM, irisPx, squint, blink, gazeX, yawDeg, rollDeg, brightness: null }, lm };
}

/** Named landmarks in image pixels for the backend's selfie analysis (no image is uploaded). */
export function selfieLandmarks(lm: NormalizedLandmark[], w: number, h: number) {
  const P = (i: number) => toPx(lm[i], w, h);
  const a = P(IDX.irisA.center), b = P(IDX.irisB.center);
  // subject's right eye appears on the image's left in an un-mirrored frame
  const [right, left] = a.x < b.x ? [IDX.irisA, IDX.irisB] : [IDX.irisB, IDX.irisA];
  const [rEye, lEye] = a.x < b.x ? [IDX.eyeA, IDX.eyeB] : [IDX.eyeB, IDX.eyeA];
  const pt = (p: Px) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  return {
    right_iris_center: pt(P(right.center)),
    left_iris_center: pt(P(left.center)),
    right_iris_diameter_px: dist(P(right.edges[0]), P(right.edges[1])),
    left_iris_diameter_px: dist(P(left.edges[0]), P(left.edges[1])),
    nose_bridge: pt(P(IDX.noseBridge)),
    face_top: pt(P(IDX.faceTop)),
    chin: pt(P(IDX.chin)),
    cheek_right: pt(P(IDX.cheeks[0])),
    cheek_left: pt(P(IDX.cheeks[1])),
    jaw_right: pt(P(IDX.jaw[0])),
    jaw_left: pt(P(IDX.jaw[1])),
    forehead_right: pt(P(IDX.forehead[0])),
    forehead_left: pt(P(IDX.forehead[1])),
    right_eye_aperture_px: dist(P(rEye.top), P(rEye.bottom)),
    left_eye_aperture_px: dist(P(lEye.top), P(lEye.bottom)),
    _iris_keys: { right: right.center, left: left.center },
  };
}

/** Find the corneal light reflex (brightest blob) inside an iris, relative to the iris centre, in iris-radius units. */
export function reflexOffset(img: ImageData, cx: number, cy: number, radius: number) {
  let best = 0, sx = 0, sy = 0, n = 0;
  const r2 = radius * radius;
  const lum = (i: number) => 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(img.height, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(img.width, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      best = Math.max(best, lum((y * img.width + x) * 4));
    }
  }
  const thr = best * 0.92;
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(img.height, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(img.width, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      if (lum((y * img.width + x) * 4) >= thr) {
        sx += x; sy += y; n++;
      }
    }
  }
  if (!n || best < 120) return null; // no clear reflex
  return { dx: (sx / n - cx) / radius, dy: (sy / n - cy) / radius };
}
