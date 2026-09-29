import type { Router } from "vue-router";

const BAR_ID = "app-route-progress";

function ensureBar(): HTMLElement {
  const existing = document.getElementById(BAR_ID);
  if (existing) return existing;

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.style.position = "fixed";
  bar.style.top = "0";
  bar.style.left = "0";
  bar.style.right = "0";
  bar.style.height = "2px";
  bar.style.width = "100vw";
  bar.style.opacity = "0";
  bar.style.zIndex = "99999";
  bar.style.pointerEvents = "none";
  bar.style.background = "linear-gradient(90deg, #2563eb, #06b6d4)";
  bar.style.boxShadow = "0 0 8px rgba(37, 99, 235, 0.5)";
  bar.style.transformOrigin = "left center";
  bar.style.transform = "scaleX(0)";
  bar.style.transition = "transform 0.25s ease, opacity 0.2s ease";
  document.body.appendChild(bar);
  return bar;
}

export function setupRouteProgress(router: Router) {
  if (typeof window === "undefined") return;

  const bar = ensureBar();
  let trickleTimer: number | null = null;
  let finishTimer: number | null = null;

  const clearTimers = () => {
    if (trickleTimer !== null) {
      window.clearInterval(trickleTimer);
      trickleTimer = null;
    }
    if (finishTimer !== null) {
      window.clearTimeout(finishTimer);
      finishTimer = null;
    }
  };

  const start = () => {
    clearTimers();
    bar.style.opacity = "1";
    bar.dataset.progress = "0.18";
    bar.style.transform = "scaleX(0.18)";

    trickleTimer = window.setInterval(() => {
      const current = Number.parseFloat(bar.dataset.progress || "0.18");
      if (current >= 0.85) return;
      const next = Math.min(current + Math.random() * 0.09, 0.85);
      bar.dataset.progress = String(next);
      bar.style.transform = `scaleX(${next})`;
    }, 180);
  };

  const done = () => {
    clearTimers();
    bar.dataset.progress = "1";
    bar.style.transform = "scaleX(1)";
    finishTimer = window.setTimeout(() => {
      bar.style.opacity = "0";
      bar.style.transform = "scaleX(0)";
      bar.dataset.progress = "0";
    }, 220);
  };

  router.beforeEach((to, from) => {
    if (to.path !== from.path) {
      start();
    }
    return true;
  });

  router.afterEach(() => {
    done();
  });

  router.onError(() => {
    done();
  });
}
