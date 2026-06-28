import { useEffect, useRef, useState } from "react";
import { useSettings } from "../state/settings";
import { INDICATORS, type IndicatorKey } from "../signals/indicators";

const KEY_TO_SETTING: Record<IndicatorKey, "showBands" | "showEma"> = {
  bands: "showBands",
  ema: "showEma",
};

/** Dropdown listing the available indicators with a checkbox each. */
export function IndicatorsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const showBands = useSettings((s) => s.showBands);
  const showEma = useSettings((s) => s.showEma);
  const enabled: Record<IndicatorKey, boolean> = { bands: showBands, ema: showEma };
  const count = Object.values(enabled).filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button className={`btn ${count ? "btn-active" : ""}`} onClick={() => setOpen((v) => !v)}>
        Indicators{count ? ` (${count})` : ""} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-line bg-panel p-1 shadow-2xl">
          {INDICATORS.map((ind) => {
            const setting = KEY_TO_SETTING[ind.key];
            const on = enabled[ind.key];
            return (
              <button
                key={ind.key}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink hover:bg-panel2"
                onClick={() => useSettings.getState().set(setting, !on)}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                  {on ? "✓" : ""}
                </span>
                {ind.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
