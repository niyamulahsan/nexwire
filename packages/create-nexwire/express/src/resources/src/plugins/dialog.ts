import type { App } from "vue";

type PromptOptions = {
  limit?: number;
  placeholder?: string;
  defaultValue?: string;
};

type DialogClient = {
  alert: (text?: string) => void;
  confirm: (text?: string, callback?: (ok: boolean) => void) => void;
  prompt: (text?: string, options?: PromptOptions, callback?: (result: { ok: boolean; value: string }) => void) => void;
};

function hostNode() {
  return document.querySelector("#modal-show") || document.body;
}

function siteLabel() {
  return `${location.protocol}//${location.hostname}`;
}

function buildShell(content: string) {
  const root = document.createElement("div");
  root.className = "position-fixed w-100 h-100 top-0 start-0";
  root.style.background = "var(--app-backdrop)";
  root.style.color = "var(--app-text)";
  root.style.zIndex = "100000";
  root.innerHTML = content;
  return root;
}

function closeShell(shell: HTMLElement) {
  shell.remove();
}

function bindKeys(shell: HTMLElement, onOk: () => void, onCancel: () => void) {
  shell.addEventListener(
    "keydown",
    (e) => {
      if (!shell.isConnected) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "TEXTAREA" || tag === "INPUT";

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === "Enter" && !isInput) {
        e.preventDefault();
        e.stopPropagation();
        onOk();
      }
    },
    true
  );
}

export const dialog: DialogClient = {
  alert(text = "") {
    const shell = buildShell(`
      <div class='card position-absolute top-50 start-50 translate-middle border' style='width:300px'>
        <div class='card-header d-flex justify-content-between align-items-center px-2 py-1 border-0'>
          <span class='d-flex align-items-center'>
            <i class="bi bi-exclamation-circle"></i> <span class='ms-2'>${siteLabel()}</span>
          </span>
          <button class='btn btn-sm p-0' type='button' data-dialog='close'>
            <i class='bi bi-x fs-3'></i>
          </button>
        </div>
        <div class='card-body overflow-x-hidden overflow-y-scroll p-2 text-center' style='max-height:200px'>
          ${text}
        </div>
        <div class='card-footer d-flex justify-content-end align-items-center px-2 py-1 border-0'>
          <button type='button' class='btn btn-primary btn-sm' data-dialog='ok'>OK</button>
        </div>
      </div>
    `);

    shell.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const action = target.closest("[data-dialog]")?.getAttribute("data-dialog");
      if (action === "ok" || action === "close") closeShell(shell);
    });

    bindKeys(
      shell,
      () => closeShell(shell),
      () => closeShell(shell)
    );
    hostNode().appendChild(shell);
    (shell.querySelector("[data-dialog='ok']") as HTMLElement)?.focus();
  },

  confirm(text = "", callback?: (ok: boolean) => void) {
    const shell = buildShell(`
      <div class='card position-absolute top-50 start-50 translate-middle border' style='width:300px'>
        <div class='card-header d-flex justify-content-between align-items-center px-2 py-1 border-0'>
          <span class='d-flex align-items-center'>
            <i class="bi bi-globe"></i> <span class='ms-2'>${siteLabel()}</span>
          </span>
          <button class='btn btn-sm p-0' type='button' data-dialog='cancel'>
            <i class='bi bi-x fs-3'></i>
          </button>
        </div>
        <div class='card-body overflow-x-hidden overflow-y-scroll p-2 text-center' style='max-height:200px'>
          ${text}
        </div>
        <div class='card-footer d-flex justify-content-end align-items-center px-2 py-1 border-0'>
          <button type='button' class='btn btn-primary btn-sm' data-dialog='ok'>OK</button>
          <button type='button' class='btn btn-secondary btn-sm ms-1' data-dialog='cancel'>Cancel</button>
        </div>
      </div>
    `);

    shell.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const action = target.closest("[data-dialog]")?.getAttribute("data-dialog");
      if (action === "ok") {
        closeShell(shell);
        callback?.(true);
      }
      if (action === "cancel") {
        closeShell(shell);
        callback?.(false);
      }
    });

    bindKeys(
      shell,
      () => {
        closeShell(shell);
        callback?.(true);
      },
      () => {
        closeShell(shell);
        callback?.(false);
      }
    );
    hostNode().appendChild(shell);
    (shell.querySelector("[data-dialog='ok']") as HTMLElement)?.focus();
  },

  prompt(text = "", options: PromptOptions = {}, callback?: (result: { ok: boolean; value: string }) => void) {
    const { limit = 0, placeholder = "Remarks...", defaultValue = "" } = options;

    const shell = buildShell(`
      <div class='card position-absolute top-50 start-50 translate-middle border' style='width:300px'>
        <div class='card-header d-flex justify-content-between align-items-center px-2 py-1 border-0'>
          <span class='d-flex align-items-center'>
            <i class="bi bi-globe"></i> <span class='ms-2'>${siteLabel()}</span>
          </span>
          <button class='btn btn-sm p-0' type='button' data-dialog='cancel'>
            <i class='bi bi-x fs-3'></i>
          </button>
        </div>
        <div class='card-body overflow-x-hidden overflow-y-scroll p-2 position-relative'>
          ${text} <sup style='font-size: 10px'>${limit} char</sup>
          <textarea class='form-control' rows='4' placeholder='${placeholder}' data-dialog='input' ${limit > 0 ? `maxlength='${limit}'` : ""}>${defaultValue}</textarea>
        </div>
        <div class='card-footer d-flex justify-content-end align-items-center px-2 py-1 border-0'>
          <button type='button' class='btn btn-primary btn-sm' data-dialog='ok'>OK</button>
          <button type='button' class='btn btn-secondary btn-sm ms-1' data-dialog='cancel'>Cancel</button>
        </div>
      </div>
    `);

    const input = shell.querySelector("textarea[data-dialog='input']") as HTMLTextAreaElement | null;

    shell.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const action = target.closest("[data-dialog]")?.getAttribute("data-dialog");

      if (action === "ok") {
        closeShell(shell);
        callback?.({ ok: true, value: input?.value || "" });
      }
      if (action === "cancel") {
        closeShell(shell);
        callback?.({ ok: false, value: "" });
      }
    });

    bindKeys(
      shell,
      () => {
        closeShell(shell);
        callback?.({ ok: true, value: input?.value || "" });
      },
      () => {
        closeShell(shell);
        callback?.({ ok: false, value: "" });
      }
    );
    hostNode().appendChild(shell);
    (shell.querySelector("textarea[data-dialog='input']") as HTMLElement)?.focus();
  }
};

export const DialogPlugin = {
  install(app: App) {
    app.config.globalProperties.$dialog = dialog;
  }
};

declare module "vue" {
  interface ComponentCustomProperties {
    $dialog: DialogClient;
  }
}
