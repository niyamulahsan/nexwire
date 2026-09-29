import type { App, ComputedRef } from "vue";
import { computed } from "vue";

export type BrowserDetectResult = {
  userAgent: string;
  isFirefox: ComputedRef<boolean>;
  isChrome: ComputedRef<boolean>;
  isSafari: ComputedRef<boolean>;
  isEdge: ComputedRef<boolean>;
  isOpera: ComputedRef<boolean>;
  isBrave: ComputedRef<boolean>;
  isAndroid: ComputedRef<boolean>;
  isIOS: ComputedRef<boolean>;
  isWindows: ComputedRef<boolean>;
  isMac: ComputedRef<boolean>;
};

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";

const isFirefoxRaw = userAgent.includes("firefox");
const isEdgeRaw = userAgent.includes("edg");
const isOperaRaw = userAgent.includes("opr") || userAgent.includes("opera");
const isBraveRaw = userAgent.includes("brave");
const isChromeRaw = userAgent.includes("chrome") && !isEdgeRaw && !isOperaRaw && !isBraveRaw;
const isAndroidRaw = userAgent.includes("android");
const isSafariRaw = userAgent.includes("safari") && !isChromeRaw && !isAndroidRaw;
const isIOSRaw = /iphone|ipad|ipod/.test(userAgent);
const isWindowsRaw = userAgent.includes("windows");
const isMacRaw = userAgent.includes("macintosh");

export const browserDetect: BrowserDetectResult = {
  userAgent,
  isFirefox: computed(() => isFirefoxRaw),
  isChrome: computed(() => isChromeRaw),
  isSafari: computed(() => isSafariRaw),
  isEdge: computed(() => isEdgeRaw),
  isOpera: computed(() => isOperaRaw),
  isBrave: computed(() => isBraveRaw),
  isAndroid: computed(() => isAndroidRaw),
  isIOS: computed(() => isIOSRaw),
  isWindows: computed(() => isWindowsRaw),
  isMac: computed(() => isMacRaw)
};

export const BrowserDetectPlugin = {
  install(app: App) {
    app.config.globalProperties.$browserDetect = browserDetect;
  }
};

declare module "vue" {
  interface ComponentCustomProperties {
    $browserDetect: BrowserDetectResult;
  }
}
