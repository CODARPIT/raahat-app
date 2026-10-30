"use client";

// Quick exit: if someone walks in, one tap (or Esc twice) leaves for a neutral page and
// replaces this page in the tab history, so Back does not return here. Anything the case
// page holds lives only in memory and goes with it.

import { useEffect } from "react";

const NEUTRAL = "https://www.google.com/search?q=weather+today";

function leave() {
  try {
    sessionStorage.clear();
  } catch {
    // storage blocked: nothing stored to clear
  }
  window.location.replace(NEUTRAL);
}

export function QuickExit() {
  useEffect(() => {
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const now = Date.now();
      if (now - last < 600) leave();
      last = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button type="button" className="quick-exit" onClick={leave} title="Leave this site now (or press Esc twice)">
      <span aria-hidden>✕</span> Quick exit
    </button>
  );
}
