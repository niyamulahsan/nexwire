// ./src/resources/src/plugins/gum.ts

import { useStorage } from "@vueuse/core";
import axios, { type AxiosError, type AxiosProgressEvent, type AxiosResponse } from "axios";
import type { App } from "vue";
import { computed, nextTick, reactive, ref, toRaw } from "vue";
import { type LocationQueryRaw, useRoute, useRouter } from "vue-router";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type GumPluginOptions = {
  rememberPrefix?: string;
  recentlySuccessfulDuration?: number;
};

type GumMethod = "get" | "post" | "put" | "patch" | "delete";
type FormMethod = "post" | "put" | "patch" | "delete";

type LifecycleHooks = {
  onBefore?: () => boolean | undefined | Promise<boolean | undefined>;
  onStart?: () => void | Promise<void>;
  onProgress?: (event: AxiosProgressEvent) => void;
  onSuccess?: (response: AxiosResponse) => void | Promise<void>;
  onError?: (errors: NormalizedErrors, error: AxiosError) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
};

/**
 * A fetcher returns either an AxiosResponse or any plain payload.
 * Gum wraps plain values into `{ data, status: 200 }`, so store methods
 * returning `Promise<string>` / `Promise<User>` work without a wrapper.
 *
 * Typing is intentionally loose (`Promise<unknown>`); callers should not
 * rely on the fetcher's return type being narrow.
 */
type Fetcher = (payload: Record<string, unknown> | FormData) => Promise<unknown>;

type GumVisitOptions = LifecycleHooks & {
  method?: GumMethod;
  data?: Record<string, unknown> | FormData;
  query?: Record<string, unknown>;
  routePath?: string;
  replace?: boolean;
  preserveState?: boolean;
  preserveScroll?: boolean;
  skipFetch?: boolean;
  fetcher?: Fetcher;
};

/** URL-less visit: fetcher REQUIRED, method injected by the helper. */
type VisitWithFetcherOptions = Omit<GumVisitOptions, "method" | "fetcher"> & { fetcher: Fetcher };
/** For body-carrying methods (post/put/patch/delete). */
type VisitWithFetcherDataOptions = VisitWithFetcherOptions & {
  data?: Record<string, unknown> | FormData;
};

type FormSubmitOptions<T> = LifecycleHooks & {
  validate?: (data: T) => Record<string, string> | null | undefined;
  transform?: (data: T) => Record<string, unknown> | FormData;
  fetcher?: Fetcher;
};

/** URL-less form submit: fetcher REQUIRED, method injected by the helper. */
type FormWithFetcherOptions<T> = Omit<FormSubmitOptions<T>, "fetcher"> & { fetcher: Fetcher };

type FormErrors<T> = Partial<Record<keyof T | string, string>>;
type NormalizedErrors = Record<string, string[] | string>;

type ValidationErrorPayload = {
  errors?: Record<string, string[] | string>;
  error?: { issues?: Array<{ path?: Array<string | number>; message?: string }> };
};

/* -------------------------------------------------------------------------- */
/* Config + registry                                                          */
/* -------------------------------------------------------------------------- */

const config: Required<GumPluginOptions> = {
  rememberPrefix: "gum",
  recentlySuccessfulDuration: 2000
};

const routeRememberKeys = new Map<string, Set<string>>();

function normalizePath(path: string) {
  const clean = (path || "/").split("?")[0];
  return clean || "/";
}

function registerRememberKey(path: string, key: string) {
  const routePath = normalizePath(path);
  if (!routeRememberKeys.has(routePath)) routeRememberKeys.set(routePath, new Set());
  routeRememberKeys.get(routePath)!.add(key);
}

export function clearRememberForPath(path: string) {
  const routePath = normalizePath(path);
  const keys = routeRememberKeys.get(routePath);
  if (!keys) return;
  keys.forEach((key) => localStorage.removeItem(`${config.rememberPrefix}:${key}`));
}

/* -------------------------------------------------------------------------- */
/* Global processing tracker (shared across all useGum() instances)           */
/* -------------------------------------------------------------------------- */

const globalProcessing = ref(false);
let activeRequests = 0;

function trackStart() {
  activeRequests++;
  globalProcessing.value = true;
}

function trackEnd() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) globalProcessing.value = false;
}

/* -------------------------------------------------------------------------- */
/* Small shared helpers                                                       */
/* -------------------------------------------------------------------------- */

export function normalizeValidationErrors(payload?: ValidationErrorPayload): NormalizedErrors {
  const normalized: NormalizedErrors = { ...payload?.errors };
  const issues = payload?.error?.issues;
  if (Array.isArray(issues)) {
    issues.forEach((issue) => {
      const key = issue.path?.map(String).join(".");
      if (key) normalized[key] = String(issue.message || "Invalid value");
    });
  }
  return normalized;
}

async function runBefore(onBefore?: LifecycleHooks["onBefore"]) {
  const allow = await onBefore?.();
  return allow !== false;
}

async function restoreScroll(enabled: boolean, y: number) {
  if (!enabled || y <= 0) return;
  await nextTick();
  // Restore once, then keep re-applying while the document is still settling —
  // e.g. a list page swapping a loading skeleton for the real table, which makes
  // the document shorter and would otherwise clamp the target out of reach. The
  // loop stops as soon as the position is reached, the user scrolls, or a short
  // deadline passes, so it never fights a deliberate scroll.
  let stop = false;
  const cancel = () => {
    stop = true;
  };
  window.addEventListener("wheel", cancel, { passive: true, once: true });
  window.addEventListener("touchstart", cancel, { passive: true, once: true });
  const deadline = performance.now() + 800;
  const apply = () => {
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    if (stop || Math.abs(window.scrollY - y) < 1 || performance.now() > deadline) {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      return;
    }
    requestAnimationFrame(apply);
  };
  requestAnimationFrame(apply);
}

function startRecentTimer(target: { recentlySuccessful: { value: boolean } }) {
  target.recentlySuccessful.value = true;
  setTimeout(() => {
    target.recentlySuccessful.value = false;
  }, config.recentlySuccessfulDuration);
}

function assertSource(url: string | undefined, fetcher: Fetcher | undefined, ctx: string) {
  if (!url && !fetcher) {
    throw new Error(
      `gum: ${ctx} requires either "url" or "fetcher". Pass a URL for axios, or a fetcher (e.g. a store method) to delegate the call.`
    );
  }
  if (import.meta.env?.DEV && url && fetcher) {
    console.warn(`gum: ${ctx} — "url" is ignored when "fetcher" is provided.`);
  }
}

/** Read the current scroll position — plain read, no per-instance listeners. */
function readScrollY(): number {
  return typeof window !== "undefined" ? window.scrollY : 0;
}

/* -------------------------------------------------------------------------- */
/* Shared core executor — dumb transport, never swallows errors               */
/* -------------------------------------------------------------------------- */

type ExecuteOptions = {
  method: GumMethod;
  url?: string;
  payload: Record<string, unknown> | FormData | undefined;
  query?: Record<string, unknown>;
  fetcher?: Fetcher;
  onProgress?: (event: AxiosProgressEvent) => void;
};

/**
 * Execute the network call. Throws on error — the caller normalizes and
 * decides whether to rethrow based on whether `onError` was provided.
 *
 * Fetcher results:
 * - If it looks like an AxiosResponse (object with `data` and a numeric `status`),
 *   it is returned as-is.
 * - Otherwise it is wrapped into `{ data: result, status: 200 }`.
 */
async function execute(options: ExecuteOptions): Promise<AxiosResponse> {
  if (options.fetcher) {
    const result = await options.fetcher(options.payload ?? {});
    const looksLikeResponse =
      result !== null &&
      typeof result === "object" &&
      "data" in (result as Record<string, unknown>) &&
      typeof (result as { status?: unknown }).status === "number";
    if (looksLikeResponse) return result as AxiosResponse;
    return { data: result, status: 200, statusText: "OK", headers: {}, config: {} } as AxiosResponse;
  }

  return await axios.request({
    method: options.method,
    url: options.url,
    params: options.query,
    data: options.method === "get" ? undefined : options.payload,
    onUploadProgress: options.onProgress
  });
}

/* -------------------------------------------------------------------------- */
/* Remember                                                                   */
/* -------------------------------------------------------------------------- */

export function useGumRemember<T extends object>(key: string, initial: T) {
  const route = useRoute();
  registerRememberKey(route.path, key);
  return useStorage<T>(`${config.rememberPrefix}:${key}`, initial, localStorage, {
    mergeDefaults: true
  });
}

/* -------------------------------------------------------------------------- */
/* Visit API                                                                  */
/* -------------------------------------------------------------------------- */

function buildVisitApi() {
  const router = useRouter();
  const route = useRoute();

  /* ---------------------------- visit core ------------------------------- */

  async function runVisit(params: {
    method: GumMethod;
    url?: string;
    data?: Record<string, unknown> | FormData;
    query?: Record<string, unknown>;
    routePath?: string;
    replace?: boolean;
    preserveState?: boolean;
    preserveScroll?: boolean;
    skipFetch?: boolean;
    fetcher?: Fetcher;
    hooks?: GumVisitOptions;
  }) {
    const {
      method,
      url,
      data,
      query,
      routePath,
      replace = false,
      preserveState = method !== "get",
      preserveScroll = false,
      skipFetch = false,
      fetcher,
      hooks = {}
    } = params;

    const { onBefore, onStart, onProgress, onSuccess, onError, onFinish } = hooks;

    if (!(await runBefore(onBefore))) return;

    const savedY = readScrollY();
    trackStart();

    let response: AxiosResponse | undefined;
    try {
      // onStart is inside try so a throw still unwinds processing.
      await onStart?.();

      if (!skipFetch) {
        assertSource(url, fetcher, "visit");
        try {
          response = await execute({ method, url, payload: data, query, fetcher, onProgress });
        } catch (error) {
          const err = error as AxiosError<ValidationErrorPayload>;
          const normalized = normalizeValidationErrors(err.response?.data);
          await onError?.(normalized, err);
          if (!onError) throw error;
          return;
        }
      }

      if (method === "get") {
        const targetPath = routePath ?? route.path;
        if (!preserveState) clearRememberForPath(targetPath);
        const payload = { path: targetPath, query: (query ?? route.query) as LocationQueryRaw };
        if (replace) await router.replace(payload);
        else await router.push(payload);
      }

      await onSuccess?.(response!);
      return response;
    } finally {
      trackEnd();
      await onFinish?.();
      await restoreScroll(preserveScroll, savedY);
    }
  }

  function visit(url: string, options?: GumVisitOptions): Promise<AxiosResponse | undefined>;
  function visit(options: GumVisitOptions & { fetcher: Fetcher }): Promise<AxiosResponse | undefined>;
  function visit(urlOrOptions: string | (GumVisitOptions & { fetcher: Fetcher }), options: GumVisitOptions = {}) {
    if (typeof urlOrOptions === "object") {
      return runVisit({
        method: urlOrOptions.method ?? "get",
        fetcher: urlOrOptions.fetcher,
        data: urlOrOptions.data,
        query: urlOrOptions.query,
        routePath: urlOrOptions.routePath,
        replace: urlOrOptions.replace,
        preserveState: urlOrOptions.preserveState,
        preserveScroll: urlOrOptions.preserveScroll,
        skipFetch: urlOrOptions.skipFetch,
        hooks: urlOrOptions
      });
    }
    return runVisit({
      method: options.method ?? "get",
      url: urlOrOptions,
      data: options.data,
      query: options.query,
      routePath: options.routePath,
      replace: options.replace,
      preserveState: options.preserveState,
      preserveScroll: options.preserveScroll,
      skipFetch: options.skipFetch,
      fetcher: options.fetcher,
      hooks: options
    });
  }

  const api = {
    processing: globalProcessing,
    visit,
    get: (url: string, o: GumVisitOptions = {}) =>
      runVisit({
        method: "get",
        url,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    post: (url: string, data?: GumVisitOptions["data"], o: GumVisitOptions = {}) =>
      runVisit({
        method: "post",
        url,
        data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    put: (url: string, data?: GumVisitOptions["data"], o: GumVisitOptions = {}) =>
      runVisit({
        method: "put",
        url,
        data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    patch: (url: string, data?: GumVisitOptions["data"], o: GumVisitOptions = {}) =>
      runVisit({
        method: "patch",
        url,
        data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    delete: (url: string, o: GumVisitOptions = {}) =>
      // Forward o.data so DELETE bodies keep working (legacy behavior).
      runVisit({
        method: "delete",
        url,
        data: o.data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    reload: (o: GumVisitOptions = {}) =>
      runVisit({
        method: "get",
        url: route.path,
        query: route.query as Record<string, unknown>,
        replace: true,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),

    /* URL-less, fetcher-based variants */
    getWith: (o: VisitWithFetcherOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "get",
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    postWith: (o: VisitWithFetcherDataOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "post",
        data: o.data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    putWith: (o: VisitWithFetcherDataOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "put",
        data: o.data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    patchWith: (o: VisitWithFetcherDataOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "patch",
        data: o.data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    deleteWith: (o: VisitWithFetcherDataOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "delete",
        data: o.data,
        query: o.query,
        routePath: o.routePath,
        replace: o.replace,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      }),
    reloadWith: (o: VisitWithFetcherOptions): Promise<AxiosResponse | undefined> =>
      runVisit({
        method: "get",
        query: (o.query ?? route.query) as Record<string, unknown>,
        routePath: o.routePath,
        replace: true,
        preserveState: o.preserveState,
        preserveScroll: o.preserveScroll,
        skipFetch: o.skipFetch,
        fetcher: o.fetcher,
        hooks: o
      })
  };

  return api;
}

type GumApi = ReturnType<typeof buildVisitApi>;

/* -------------------------------------------------------------------------- */
/* Form state                                                                 */
/* -------------------------------------------------------------------------- */

function createForm<T extends Record<string, unknown>>(defaults: T) {
  /* ------------------------ form state ----------------------------------- */
  const initial = structuredClone(defaults);
  const data = reactive(structuredClone(defaults)) as T;
  const errors = reactive<Record<string, string>>({});
  const progress = ref<number | null>(null);
  const formProcessing = ref(false);
  const wasSuccessful = ref(false);
  const recentlySuccessful = ref(false);
  const isDirty = computed(() => JSON.stringify(toRaw(data)) !== JSON.stringify(initial));

  function setError(field: keyof T | string, message: string) {
    errors[String(field)] = message;
  }

  function clearErrors(...fields: (keyof T | string)[]) {
    if (!fields.length) {
      Object.keys(errors).forEach((k) => delete errors[k]);
      return;
    }
    fields.forEach((f) => delete errors[String(f)]);
  }

  function reset(...fields: (keyof T)[]) {
    if (!fields.length) {
      Object.assign(data, structuredClone(initial));
      clearErrors();
      return;
    }
    fields.forEach((f) => {
      (data as any)[f] = structuredClone(initial[f]);
      delete errors[String(f)];
    });
  }

  async function submitForm(
    method: FormMethod,
    url: string | undefined,
    payload: Record<string, unknown> | undefined,
    opts: FormSubmitOptions<T>
  ): Promise<AxiosResponse | undefined> {
    const { onBefore, onStart, onProgress, onSuccess, onError, onFinish, validate, transform, fetcher } = opts;
    const userOnError = onError;

    if (!(await runBefore(onBefore))) return;

    assertSource(url, fetcher, "submit");

    // Local validation — only abort if there ARE errors (empty {} passes through).
    const validationErrors = validate?.(toRaw(data) as T);
    if (validationErrors && Object.keys(validationErrors).length > 0) {
      clearErrors();
      Object.entries(validationErrors).forEach(([k, v]) => setError(k, v));
      return;
    }

    const body = transform ? transform(toRaw(data) as T) : (payload ?? toRaw(data));

    wasSuccessful.value = false;
    clearErrors();
    formProcessing.value = true;
    trackStart();

    try {
      // onStart inside try — a throw still unwinds processing.
      await onStart?.();

      let response: AxiosResponse;
      try {
        response = await execute({
          method,
          url,
          payload: body,
          fetcher,
          onProgress: (event) => {
            onProgress?.(event);
            if (event.total) progress.value = Math.round((event.loaded * 100) / event.total);
          }
        });
      } catch (error) {
        const err = error as AxiosError<ValidationErrorPayload>;
        const normalized = normalizeValidationErrors(err.response?.data);
        Object.entries(normalized).forEach(([k, v]) => setError(k, Array.isArray(v) ? v[0] : v));
        await userOnError?.(normalized, err);
        if (!userOnError) throw error;
        return;
      }

      wasSuccessful.value = true;
      startRecentTimer({ recentlySuccessful });
      await onSuccess?.(response);
      return response;
    } finally {
      formProcessing.value = false;
      progress.value = null;
      trackEnd();
      await onFinish?.();
    }
  }

  return {
    data,
    errors: errors as FormErrors<T>,
    progress,
    processing: formProcessing,
    wasSuccessful,
    recentlySuccessful,
    isDirty,
    setError,
    clearErrors,
    reset,
    submit: (method: FormMethod, url: string | undefined, payload?: Record<string, unknown>, opts?: FormSubmitOptions<T>) =>
      submitForm(method, url, payload, opts ?? {}),
    post: (url: string, payload?: Record<string, unknown>, opts?: FormSubmitOptions<T>) => submitForm("post", url, payload, opts ?? {}),
    put: (url: string, payload?: Record<string, unknown>, opts?: FormSubmitOptions<T>) => submitForm("put", url, payload, opts ?? {}),
    patch: (url: string, payload?: Record<string, unknown>, opts?: FormSubmitOptions<T>) => submitForm("patch", url, payload, opts ?? {}),
    delete: (url: string, payload?: Record<string, unknown>, opts?: FormSubmitOptions<T>) => submitForm("delete", url, payload, opts ?? {}),

    /* URL-less, fetcher-based variants */
    postWith: (o: FormWithFetcherOptions<T>) => submitForm("post", undefined, undefined, o),
    putWith: (o: FormWithFetcherOptions<T>) => submitForm("put", undefined, undefined, o),
    patchWith: (o: FormWithFetcherOptions<T>) => submitForm("patch", undefined, undefined, o),
    deleteWith: (o: FormWithFetcherOptions<T>) => submitForm("delete", undefined, undefined, o)
  };
}

type GumForm<T extends Record<string, unknown>> = ReturnType<typeof createForm<T>>;

/* -------------------------------------------------------------------------- */
/* useGum — unified visit + form                                              */
/* -------------------------------------------------------------------------- */

/**
 * Visit API only. `form` is not available when no defaults are passed.
 */
export function useGum(): GumApi & { form?: undefined };

/**
 * Visit API plus form state. Pass the form defaults as the first argument.
 */
export function useGum<T extends Record<string, unknown>>(defaults: T): GumApi & { form: GumForm<T> };

export function useGum<T extends Record<string, unknown>>(defaults?: T): GumApi & { form?: GumForm<T> } {
  const api = buildVisitApi();
  if (defaults === undefined) return api;
  return { ...api, form: createForm(defaults) };
}

/* -------------------------------------------------------------------------- */
/* Backward-compat alias                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @deprecated Use `useGum(defaults).form` instead.
 * Kept so existing pages don't break. Will be removed in a future major.
 */
export function useGumForm<T extends Record<string, unknown>>(defaults: T): GumForm<T> {
  const { form } = useGum(defaults);
  return form;
}

/* -------------------------------------------------------------------------- */
/* Plugin                                                                     */
/* -------------------------------------------------------------------------- */

export const GumPlugin = {
  install(_app: App, options: GumPluginOptions = {}) {
    if (options.rememberPrefix) config.rememberPrefix = options.rememberPrefix;
    if (typeof options.recentlySuccessfulDuration === "number") {
      config.recentlySuccessfulDuration = options.recentlySuccessfulDuration;
    }
  }
};
