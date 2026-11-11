"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Mode = "adult" | "kids" | "camp" | "phone";
export type Lang = "en" | "hi" | "or";

type ScreeningState = {
  sessionId: string | null;
  token: string | null;
  passport: string | null;
  mode: Mode;
  lang: Lang;
  pxPerMm: number | null; // screen calibration (kept per device)
  cardCalibrated: boolean;
  wearingGlasses: boolean;
  testsDone: string[];
  step: number;
  set: (p: Partial<ScreeningState>) => void;
  markTest: (key: string) => void;
  reset: () => void;
};

export const useScreening = create<ScreeningState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      token: null,
      passport: null,
      mode: "adult",
      lang: "en",
      pxPerMm: null,
      cardCalibrated: false,
      wearingGlasses: false,
      testsDone: [],
      step: 0,
      set: (p) => set(p),
      markTest: (key) => set({ testsDone: Array.from(new Set([...get().testsDone, key])) }),
      reset: () => set({ sessionId: null, token: null, passport: null, testsDone: [], step: 0, wearingGlasses: false }),
    }),
    {
      name: "ocula.screening",
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          const mem: Record<string, string> = {};
          return { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] };
        }
      }),
    },
  ),
);

/** Fallback screen density when the card calibration was skipped (CSS px per mm at 96 dpi, adjusted for DPR). */
export function defaultPxPerMm() {
  return 96 / 25.4;
}
