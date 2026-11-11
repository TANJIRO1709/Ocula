"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { analyse, getLandmarker, type FaceMetrics } from "@/lib/face";

type Options = { facing?: "user" | "environment"; track?: boolean; width?: number };

export type Tracker = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
  metrics: FaceMetrics | null;
  latest: React.MutableRefObject<{ metrics: FaceMetrics | null; lm: NormalizedLandmark[] | null; w: number; h: number }>;
  blinks: React.MutableRefObject<number>;
  start: () => Promise<void>;
  stop: () => void;
};

/**
 * Opens the camera and (optionally) runs MediaPipe face tracking every animation frame.
 * Everything runs on-device — frames are never uploaded.
 */
export function useFaceTracker({ facing = "user", track = true, width = 1280 }: Options = {}): Tracker {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const latest = useRef<{ metrics: FaceMetrics | null; lm: NormalizedLandmark[] | null; w: number; h: number }>({ metrics: null, lm: null, w: 0, h: 0 });
  const blinks = useRef(0);
  const blinkState = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FaceMetrics | null>(null);
  const lastUi = useRef(0);
  const lumCanvas = useRef<HTMLCanvasElement | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: width }, height: { ideal: Math.round((width * 9) / 16) } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      await v.play();
      if (!track) {
        setReady(true);
        return;
      }
      const landmarker = await getLandmarker();
      setReady(true);
      let lastTs = -1;
      const loop = () => {
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2 && vid.videoWidth) {
          const ts = performance.now();
          if (ts > lastTs) {
            lastTs = ts;
            const res = landmarker.detectForVideo(vid, ts);
            const { metrics: m, lm } = analyse(res, vid.videoWidth, vid.videoHeight);
            // blink counter (rising edge)
            const closed = m.blink > 0.55;
            if (closed && !blinkState.current) blinks.current += 1;
            blinkState.current = closed;
            latest.current = { metrics: m, lm, w: vid.videoWidth, h: vid.videoHeight };
            if (ts - lastUi.current > 150) {
              lastUi.current = ts;
              m.brightness = sampleBrightness(vid, lumCanvas);
              setMetrics({ ...m });
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /Permission|NotAllowed/i.test(msg)
          ? "Camera permission was denied. Tests still work, but distance tracking and Honest Eye will be off."
          : `Camera / face tracking unavailable: ${msg}`,
      );
    }
  }, [facing, track, width]);

  useEffect(() => stop, [stop]);
  return { videoRef, ready, error, metrics, latest, blinks, start, stop };
}

function sampleBrightness(v: HTMLVideoElement, ref: React.MutableRefObject<HTMLCanvasElement | null>) {
  try {
    if (!ref.current) ref.current = document.createElement("canvas");
    const c = ref.current;
    c.width = 32;
    c.height = 18;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, 32, 18);
    const d = ctx.getImageData(0, 0, 32, 18).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  } catch {
    return null;
  }
}
