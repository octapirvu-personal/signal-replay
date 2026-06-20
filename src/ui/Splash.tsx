import { useEffect, useState } from "react";

/**
 * First-load brand intro: a futuristic glacier mark + the "Svinafell" wordmark,
 * fading in and out smoothly, then removing itself to reveal the app. The app
 * mounts underneath during the intro, so it's ready the moment this clears.
 */
export function Splash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGone(true), 2700);
    return () => clearTimeout(id);
  }, []);
  if (gone) return null;

  return (
    <div className="svina-splash">
      <div className="svina-inner">
        <svg className="svina-mark" width="92" height="92" viewBox="0 0 120 120" fill="none">
          <defs>
            <linearGradient id="svina-grad" x1="12" y1="14" x2="108" y2="106" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3b82f6" />
              <stop offset="1" stopColor="#e6edf3" />
            </linearGradient>
          </defs>
          {/* ring */}
          <circle cx="60" cy="60" r="52" stroke="url(#svina-grad)" strokeWidth="1.5" opacity="0.45" />
          {/* glacier peaks */}
          <path
            d="M28 82 L50 44 L62 61 L75 41 L92 82"
            stroke="url(#svina-grad)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* horizon */}
          <path d="M30 82 L90 82" stroke="url(#svina-grad)" strokeWidth="1.5" opacity="0.6" strokeLinecap="round" />
        </svg>
        <div className="svina-word">Svinafell</div>
      </div>
    </div>
  );
}
