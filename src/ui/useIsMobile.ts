import { useEffect, useState } from "react";

/** True on narrow (phone-sized) viewports. Matches Tailwind's `md` breakpoint. */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
