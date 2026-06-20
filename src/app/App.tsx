import { useEffect, useState } from "react";
import { TopBar } from "../ui/TopBar";
import { StatusBar } from "../ui/StatusBar";
import { ChartPanel } from "../ui/ChartPanel";
import { Sidebar } from "../ui/Sidebar";
import { Scrubber } from "../ui/Scrubber";
import { MappingBar } from "../ui/MappingBar";
import { ShortcutsOverlay } from "../ui/ShortcutsOverlay";
import { DrawToolbar } from "../ui/DrawToolbar";
import { JournalDrawer } from "../ui/JournalDrawer";
import { useApp } from "../state/app";
import { useSettings } from "../state/settings";
import { useDrawings } from "../state/drawings";
import { useAuth } from "../state/auth";
import { AuthGate } from "../ui/AuthGate";
import { MobileActionBar } from "../ui/MobileActionBar";
import { useIsMobile } from "../ui/useIsMobile";
import { restoreLastDataset } from "./dataset";
import { tradeFromCurrentSignal, tradeAtFrontier } from "./drawingControls";
import {
  nextSignal,
  prevSignal,
  revealMore,
  hideSome,
  stepForward,
  stepBack,
  decide,
} from "./controls";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const hasDataset = useApp((s) => s.datasetId != null);
  const mobile = useIsMobile();
  const showSidebarPref = useSettings((s) => s.showSidebar);
  // Desktop uses the persisted preference; mobile uses a local overlay toggle so
  // dismissing the sidebar on a phone doesn't change the desktop preference.
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const sidebarOpen = mobile ? mobileSidebar : showSidebarPref;
  const openSidebar = () => (mobile ? setMobileSidebar(true) : useSettings.getState().set("showSidebar", true));
  const closeSidebar = () => (mobile ? setMobileSidebar(false) : useSettings.getState().set("showSidebar", false));

  const authReady = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const userId = session?.user?.id ?? null;

  // start the auth listener once
  useEffect(() => {
    useAuth.getState().init();
  }, []);

  // once signed in, hydrate settings then restore the last dataset (per user)
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      await useSettings.getState().hydrate();
      await restoreLastDataset();
    })();
  }, [userId]);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?") {
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
        const d = useDrawings.getState();
        if (d.tool !== "cursor" || d.selection) {
          d.setTool("cursor");
          d.select(null);
        }
        return;
      }
      if (isTyping(e.target)) return;

      // drawing tools & journaling
      if (useApp.getState().bars.length) {
        if (e.key === "1") {
          useDrawings.getState().setTool("cursor");
          return;
        }
        if (e.key === "2") {
          useDrawings.getState().setTool("trendline");
          return;
        }
        if (e.key === "3") {
          tradeAtFrontier("long");
          return;
        }
        if (e.key === "4") {
          tradeAtFrontier("short");
          return;
        }
        if (e.key === "e" || e.key === "E") {
          tradeFromCurrentSignal();
          return;
        }
        if (e.key === "j" || e.key === "J") {
          setShowJournal((v) => !v);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && useDrawings.getState().selection) {
          e.preventDefault();
          useDrawings.getState().deleteSelected();
          return;
        }
      }

      const step = Math.max(1, useSettings.getState().revealStep);
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          e.shiftKey ? stepForward() : nextSignal();
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.shiftKey ? stepBack() : prevSignal();
          break;
        case "ArrowUp":
        case " ":
          e.preventDefault();
          revealMore(step);
          break;
        case "ArrowDown":
          e.preventDefault();
          hideSome(step);
          break;
        case "t":
        case "T":
          decide("take");
          break;
        case "k":
        case "K":
        case "s":
        case "S":
          decide("skip");
          break;
        case "f":
        case "F": {
          const s = useSettings.getState();
          s.set("followFrontier", !s.followFrontier);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!authReady) {
    return <div className="flex h-full items-center justify-center bg-bg text-sm text-muted">Loading…</div>;
  }
  if (!session) {
    return <AuthGate />;
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar onShowShortcuts={() => setShowShortcuts(true)} onOpenJournal={() => setShowJournal(true)} />
      <MappingBar />
      {/* The status strip (signal/date/close/decision/nav) is desktop-only — on
          mobile those live in the bottom bar and scrubber, keeping the chart big. */}
      {!mobile && <StatusBar />}
      <div className="relative flex min-h-0 flex-1">
        {hasDataset && <DrawToolbar />}
        <ChartPanel />
        {mobile && sidebarOpen && <div className="absolute inset-0 z-20 bg-black/40 md:hidden" onClick={closeSidebar} />}
        {sidebarOpen ? (
          <Sidebar onHide={closeSidebar} />
        ) : (
          <button
            className="border-l border-line bg-panel px-1 text-muted hover:text-ink"
            title="Show sidebar"
            onClick={openSidebar}
          >
            ‹
          </button>
        )}
      </div>
      <Scrubber />
      <MobileActionBar />
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      <JournalDrawer open={showJournal} onClose={() => setShowJournal(false)} />
    </div>
  );
}
