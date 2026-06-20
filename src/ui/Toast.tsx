import { useEffect } from "react";
import { useApp } from "../state/app";

/** Transient bottom toast for notices (e.g. a cloud-save failure). Auto-dismisses. */
export function Toast() {
  const notice = useApp((s) => s.notice);
  const setNotice = useApp((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice, setNotice]);

  if (!notice) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4">
      <div
        className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-sell/60 bg-panel px-4 py-2.5 text-[13px] text-ink shadow-2xl"
        onClick={() => setNotice(null)}
        role="alert"
      >
        <span className="text-sell">⚠</span>
        <span className="flex-1">{notice}</span>
        <button className="text-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
