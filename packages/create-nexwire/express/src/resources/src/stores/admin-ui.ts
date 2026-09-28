import { defineStore } from "pinia";
import { computed, ref } from "vue";

const THEME_KEY = "app-theme";
const SIDEBAR_COLLAPSE_KEY = "sidebar-open-collapses";
const SIDEBAR_SCROLL_KEY = "sidebar-scroll-top";
type ThemeMode = "light" | "dark" | "auto";

export const useAdminUiStore = defineStore("admin-ui", () => {
  const sidebarOpen = ref(false);
  const themeMode = ref<ThemeMode>("auto");
  const sidebarOpenCollapseIds = ref<string[]>([]);
  const sidebarScrollTop = ref(0);
  let sidebarAccordionEl: HTMLElement | null = null;
  let sidebarScrollListener: (() => void) | null = null;

  const themeIcon = computed(() => {
    if (themeMode.value === "light") return "bi-brightness-high-fill";
    return "bi-moon-stars";
  });

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
  };

  const closeSidebar = () => {
    sidebarOpen.value = false;
  };

  const applyTheme = (mode: ThemeMode) => {
    themeMode.value = mode;
    document.body.classList.remove("theme-light", "theme-dark", "theme-auto");
    document.body.classList.add(`theme-${mode}`);
    localStorage.setItem(THEME_KEY, mode);
  };

  const cycleTheme = () => {
    const order: ThemeMode[] = ["light", "dark"];
    const index = order.indexOf(themeMode.value);
    applyTheme(order[(index + 1) % order.length]);
  };

  const initTheme = () => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
      return;
    }

    applyTheme("light");
  };

  const cleanupTheme = () => {};

  const loadSidebarCollapseIds = () => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      sidebarOpenCollapseIds.value = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      sidebarOpenCollapseIds.value = [];
    }
  };

  const persistSidebarCollapseIds = () => {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(sidebarOpenCollapseIds.value));
  };

  const setSidebarCollapseOpen = (id: string, open: boolean) => {
    const ids = new Set(sidebarOpenCollapseIds.value);
    if (open) ids.add(id);
    else ids.delete(id);
    sidebarOpenCollapseIds.value = Array.from(ids);
    persistSidebarCollapseIds();
  };

  const restoreSidebarCollapseState = () => {
    sidebarOpenCollapseIds.value.forEach((id) => {
      const collapse = document.getElementById(id);
      if (!collapse) return;
      collapse.classList.add("show");
      const trigger = document.querySelector(`[data-bs-target="#${id}"]`);
      if (trigger instanceof HTMLElement) {
        trigger.classList.remove("collapsed");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  };

  const onSidebarCollapseShown = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.id) return;
    setSidebarCollapseOpen(target.id, true);
  };

  const onSidebarCollapseHidden = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.id) return;
    setSidebarCollapseOpen(target.id, false);
  };

  const initSidebarCollapsePersistence = () => {
    loadSidebarCollapseIds();
    restoreSidebarCollapseState();

    const sidebarAccordion = document.querySelector(".sidebar .accordion");
    if (sidebarAccordion instanceof HTMLElement) {
      const storedTop = Number(localStorage.getItem(SIDEBAR_SCROLL_KEY) || "0");
      sidebarScrollTop.value = Number.isFinite(storedTop) ? storedTop : 0;
      sidebarAccordion.scrollTop = sidebarScrollTop.value;

      sidebarAccordionEl = sidebarAccordion;
      sidebarScrollListener = () => {
        sidebarScrollTop.value = sidebarAccordion.scrollTop;
        localStorage.setItem(SIDEBAR_SCROLL_KEY, String(sidebarScrollTop.value));
      };

      sidebarAccordion.addEventListener("scroll", sidebarScrollListener, { passive: true });
    }

    document.addEventListener("shown.bs.collapse", onSidebarCollapseShown);
    document.addEventListener("hidden.bs.collapse", onSidebarCollapseHidden);
  };

  const cleanupSidebarCollapsePersistence = () => {
    if (sidebarAccordionEl && sidebarScrollListener) {
      sidebarAccordionEl.removeEventListener("scroll", sidebarScrollListener);
    }
    sidebarAccordionEl = null;
    sidebarScrollListener = null;
    document.removeEventListener("shown.bs.collapse", onSidebarCollapseShown);
    document.removeEventListener("hidden.bs.collapse", onSidebarCollapseHidden);
  };

  return {
    sidebarOpen,
    themeMode,
    themeIcon,
    toggleSidebar,
    closeSidebar,
    applyTheme,
    cycleTheme,
    initTheme,
    cleanupTheme,
    sidebarOpenCollapseIds,
    initSidebarCollapsePersistence,
    cleanupSidebarCollapsePersistence
  };
});
