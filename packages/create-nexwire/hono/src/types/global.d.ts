declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module "bootstrap/js/dist/modal.js" {
  export default class Modal {
    constructor(element: Element, options?: { backdrop?: boolean | "static"; keyboard?: boolean });
    show(): void;
    hide(): void;
    dispose(): void;
  }
}

declare module "bootstrap/js/dist/toast.js" {
  export default class Toast {
    static getOrCreateInstance(element: Element): Toast;
    show(): void;
  }
}

declare module "luxon";
declare module "nodemailer";
declare module "vue-select";
