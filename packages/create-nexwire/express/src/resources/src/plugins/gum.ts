import { useStorage } from "@vueuse/core";
import axios, { type AxiosError, type AxiosProgressEvent, type AxiosResponse } from "axios";
import type { App } from "vue";
import { computed, nextTick, reactive, ref, toRaw } from "vue";
import { type LocationQueryRaw, useRoute, useRouter } from "vue-router";

export type GumPluginOptions = {
  rememberPrefix?: string;
  recentlySuccessfulDuration?: number;
};

type GumMethod = "get" | "post" | "put" | "patch" | "delete";
type GumVisitOptions = {
  method?: GumMethod;
  data?: Record<string, unknown> | FormData;
  query?: Record<string, unknown>;
  routePath?: string;
  replace?: boolean;
  preserveState?: boolean;
  preserveScroll?: boolean;
  skipFetch?: boolean;
  onBefore?: () => boolean | undefined | Promise<boolean | undefined>;
  onStart?: () => void | Promise<void>;
  onProgress?: (event: AxiosProgressEvent) => void;
  onSuccess?: (response: AxiosResponse) => void | Promise<void>;
  onError?: (errors: NormalizedErrors, error: AxiosError) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
};

type FormMethod = "post" | "put" | "patch" | "delete";
type FormErrors<T> = Partial<Record<keyof T | string, string>>;
type NormalizedErrors = Record<string, string[] | string>;
type FormSubmitOptions = {
  onBefore?: () => boolean | undefined | Promise<boolean | undefined>;
  onStart?: () => void | Promise<void>;
  onProgress?: (event: AxiosProgressEvent) => void | Promise<void>;
  onSuccess?: (response: AxiosResponse) => void | Promise<void>;
  onError?: (errors: NormalizedErrors, error: AxiosError) => void | Promise<void>;
  onFinish?: () => void | Promise<void>;
};

type ValidationErrorPayload = {
  errors?: Record<string, string[] | string>;
  error?: {
    issues?: Array<{
      path?: Array<string | number>;
      message?: string;
    }>;
  };
};

function normalizeValidationErrors(payload?: ValidationErrorPayload): NormalizedErrors {
  const normalized: NormalizedErrors = { ...(payload?.errors || {}) };

  const issues = payload?.error?.issues;
  if (Array.isArray(issues)) {
    issues.forEach((issue) => {
      const key = issue.path?.map(String).join(".");
      if (key) normalized[key] = String(issue.message || "Invalid value");
    });
  }

  return normalized;
}

const config: Required<GumPluginOptions> = {
  rememberPrefix: "gum",
  recentlySuccessfulDuration: 2000
};

/**
 * Why: preserveState=false should clear only state for one page.
 * When: called by remember registration and GET visits.
 * Where: used in this Gum plugin storage registry.
 */
const routeRememberKeys = new Map<string, Set<string>>();

/**
 * Why: route keys must be consistent across query changes.
 * When: before read/write in remember key registry.
 * Where: internal helper for Gum path-based state tracking.
 */
function normalizePath(path: string) {
  const clean = (path || "/").split("?")[0];
  return clean || "/";
}

function registerRememberKey(path: string, key: string) {
  const routePath = normalizePath(path);
  if (!routeRememberKeys.has(routePath)) routeRememberKeys.set(routePath, new Set<string>());
  routeRememberKeys.get(routePath)?.add(key);
}

/**
 * Why: emulate Inertia preserveState=false behavior.
 * When: a GET visit requests state reset.
 * Where: removes entries from localStorage using Gum prefix.
 */
export function clearRememberForPath(path: string) {
  const routePath = normalizePath(path);
  const keys = routeRememberKeys.get(routePath);
  if (!keys) return;
  keys.forEach((key) => localStorage.removeItem(`${config.rememberPrefix}:${key}`));
}

/**
 * Why: persist page-local UI state across navigations/reloads.
 * When: page needs remembered filters/forms.
 * Where: composables/pages calling useGumRemember.
 */
export function useGumRemember<T extends object>(key: string, initial: T) {
  const route = useRoute();
  registerRememberKey(route.path, key);

  return useStorage<T>(`${config.rememberPrefix}:${key}`, initial, localStorage, {
    mergeDefaults: true
  });
}

/**
 * Why: provide Inertia-style visit API for requests + navigation.
 * When: pages trigger get/post/put/patch/delete/reload flows.
 * Where: UI pages/composables that import useGum.
 */
export function useGum() {
  const router = useRouter();
  const route = useRoute();
  const processing = ref(false);

  /**
   * Why: unify request lifecycle hooks with router sync.
   * When: any Gum visit method is executed.
   * Where: internal core of useGum().
   */
  async function visit(url: string, options: GumVisitOptions = {}) {
    const {
      method = "get",
      data,
      query,
      routePath,
      replace = false,
      preserveState = method !== "get",
      preserveScroll = false,
      skipFetch = false,
      onBefore,
      onStart,
      onProgress,
      onSuccess,
      onError,
      onFinish
    } = options;

    const allow = await onBefore?.();
    if (allow === false) return;

    const scrollY = window.scrollY;
    processing.value = true;
    await onStart?.();

    let response: AxiosResponse | undefined;

    try {
      if (!skipFetch) {
        response = await axios.request({
          method,
          url,
          params: method === "get" ? (query ?? (data as Record<string, unknown> | undefined)) : query,
          data: method === "get" ? undefined : data,
          onUploadProgress: (event) => onProgress?.(event)
        });
      }

      if (method === "get") {
        const targetRoutePath = routePath ?? route.path;
        if (!preserveState) clearRememberForPath(targetRoutePath);

        const payload = {
          path: targetRoutePath,
          query: (query ?? route.query) as LocationQueryRaw
        };

        if (replace) await router.replace(payload);
        else await router.push(payload);
      }

      await onSuccess?.(response!);
      return response;
    } catch (error) {
      const err = error as AxiosError<ValidationErrorPayload>;
      const handled = !!options.onError;
      await onError?.(normalizeValidationErrors(err.response?.data), error as AxiosError);
      if (!handled) throw error;
    } finally {
      processing.value = false;
      await onFinish?.();
      if (preserveScroll) {
        await nextTick();
        requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
      }
    }
  }

  return {
    processing,
    visit,
    get: (url: string, options: Omit<GumVisitOptions, "method"> = {}) => visit(url, { ...options, method: "get" }),
    post: (url: string, data?: Record<string, unknown> | FormData, options: Omit<GumVisitOptions, "method" | "data"> = {}) => {
      return visit(url, { ...options, method: "post", data });
    },
    put: (url: string, data?: Record<string, unknown> | FormData, options: Omit<GumVisitOptions, "method" | "data"> = {}) => {
      return visit(url, { ...options, method: "put", data });
    },
    patch: (url: string, data?: Record<string, unknown> | FormData, options: Omit<GumVisitOptions, "method" | "data"> = {}) => {
      return visit(url, { ...options, method: "patch", data });
    },
    delete: (url: string, options: Omit<GumVisitOptions, "method"> = {}) => visit(url, { ...options, method: "delete" }),
    reload: (options: Omit<GumVisitOptions, "method"> = {}) => {
      return visit(route.path, {
        ...options,
        method: "get",
        replace: true,
        query: route.query as Record<string, unknown>
      });
    }
  };
}

/**
 * Why: centralize form state/errors/progress like Inertia useForm.
 * When: create/update/delete forms submit to backend.
 * Where: UI forms using useGumForm.
 */
export function useGumForm<T extends Record<string, unknown>>(defaults: T) {
  const initial = structuredClone(defaults);
  const data = reactive(structuredClone(defaults)) as T;
  const errors = reactive<Record<string, string>>({});
  const progress = ref<number | null>(null);
  const processing = ref(false);
  const wasSuccessful = ref(false);
  const recentlySuccessful = ref(false);
  const isDirty = computed(() => JSON.stringify(toRaw(data)) !== JSON.stringify(initial));

  /**
   * Why: allow manual error assignment for custom validations.
   * When: setting one field error outside server response.
   * Where: useGumForm consumer code.
   */
  function setError(field: keyof T | string, message: string) {
    errors[String(field)] = message;
  }

  /**
   * Why: keep error state in sync with user actions/submits.
   * When: before submit or after field corrections.
   * Where: useGumForm internal + consumer calls.
   */
  function clearErrors(...fields: (keyof T | string)[]) {
    if (!fields.length) {
      Object.keys(errors).forEach((key) => delete errors[key]);
      return;
    }
    fields.forEach((field) => delete errors[String(field)]);
  }

  /**
   * Why: restore form values to initial defaults safely.
   * When: cancel edit or after successful submission.
   * Where: useGumForm consumer actions.
   */
  function reset(...fields: (keyof T)[]) {
    if (!fields.length) {
      Object.assign(data, structuredClone(initial));
      clearErrors();
      return;
    }

    fields.forEach((field) => {
      data[field] = structuredClone(initial[field]);
      delete errors[String(field)];
    });
  }

  /**
   * Why: provide a single submission path with lifecycle hooks.
   * When: post/put/patch/delete helpers are called.
   * Where: useGumForm internal request executor.
   */
  async function submit(method: FormMethod, url: string, payload?: Record<string, unknown>, options: FormSubmitOptions = {}) {
    const { onBefore, onStart, onProgress, onSuccess, onError, onFinish } = options;

    const allow = await onBefore?.();
    if (allow === false) return;

    wasSuccessful.value = false;
    clearErrors();
    processing.value = true;
    await onStart?.();

    try {
      const response = await axios.request({
        method,
        url,
        data: payload ?? toRaw(data),
        onUploadProgress: (event) => {
          onProgress?.(event);
          if (!event.total) return;
          progress.value = Math.round((event.loaded * 100) / event.total);
        }
      });

      wasSuccessful.value = true;
      recentlySuccessful.value = true;
      setTimeout(() => {
        recentlySuccessful.value = false;
      }, config.recentlySuccessfulDuration);
      await onSuccess?.(response!);
      return response;
    } catch (error) {
      const err = error as AxiosError<ValidationErrorPayload>;
      const normalizedErrors = normalizeValidationErrors(err.response?.data);

      Object.entries(normalizedErrors).forEach(([key, value]) => {
        errors[String(key)] = Array.isArray(value) ? value[0] : value;
      });

      const handled = !!options.onError;
      await onError?.(normalizedErrors, error as AxiosError);
      if (!handled) throw error;
    } finally {
      processing.value = false;
      progress.value = null;
      await onFinish?.();
    }
  }

  return {
    data,
    errors: errors as FormErrors<T>,
    progress,
    processing,
    wasSuccessful,
    recentlySuccessful,
    isDirty,
    setError,
    clearErrors,
    reset,
    submit,
    post: (url: string, payload?: Record<string, unknown>, options?: FormSubmitOptions) => submit("post", url, payload, options),
    put: (url: string, payload?: Record<string, unknown>, options?: FormSubmitOptions) => submit("put", url, payload, options),
    patch: (url: string, payload?: Record<string, unknown>, options?: FormSubmitOptions) => submit("patch", url, payload, options),
    delete: (url: string, payload?: Record<string, unknown>, options?: FormSubmitOptions) => submit("delete", url, payload, options)
  };
}

/**
 * Why: configure shared Gum behavior globally.
 * When: app bootstrap calls app.use(GumPlugin, options).
 * Where: src/resources/src/main.ts plugin registration.
 */
export const GumPlugin = {
  install(_app: App, options: GumPluginOptions = {}) {
    if (options.rememberPrefix) config.rememberPrefix = options.rememberPrefix;
    if (typeof options.recentlySuccessfulDuration === "number") {
      config.recentlySuccessfulDuration = options.recentlySuccessfulDuration;
    }
  }
};
