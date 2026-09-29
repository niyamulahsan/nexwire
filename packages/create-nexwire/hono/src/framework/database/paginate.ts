import { count, getTableColumns, type SQL, sql } from "drizzle-orm";
import { db } from "@/framework/database/connection.js";

type PaginateOptions = {
  page?: number;
  perPage?: number;
  maxPerPage?: number;
  path?: string;
  where?: SQL<unknown>;
  orderBy?: unknown[];
};

type RequestLike = {
  req: {
    query: (key: string) => string | undefined;
    path: string;
    url?: string;
  };
};

type PaginateQueryOptions<T> = {
  page?: number;
  perPage?: number;
  maxPerPage?: number;
  path?: string;
  total: () => Promise<number>;
  data: (limit: number, offset: number) => Promise<T[]>;
};

type PaginateModelOptions<T = any> = {
  table?: any;
  query?: { findMany: (args: Record<string, any>) => Promise<T[]> };
  where?: SQL<unknown>;
  with?: Record<string, any>;
  columns?: Record<string, any>;
  extras?: Record<string, any>;
  orderBy?: unknown;
  page?: number;
  perPage?: number;
  maxPerPage?: number;
  path?: string;
  total?: () => Promise<number>;
  data?: (params: { limit: number; offset: number }) => Promise<T[]>;
};

export type PaginatedResult<T> = {
  current_page: number;
  data: T[];
  first_page_url: string | null;
  from: number | null;
  last_page: number;
  last_page_url: string | null;
  links: Array<{ url: string | null; label: string; page: number | null; active: boolean }>;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
};

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function pageUrl(path: string, page: number, perPage: number) {
  if (!path) return null;
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}page=${page}&per_page=${perPage}`;
}

function resolvePath(c: RequestLike, path?: string) {
  if (path) return path;
  const fallbackPath = c.req.path;
  if (!c.req.url) return fallbackPath;
  try {
    const parsed = new URL(c.req.url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return fallbackPath;
  }
}

/**
 * Why: Generic paginator for custom total/data callbacks.
 * When: You need pagination outside direct table helpers.
 * Where: Controllers/services composing complex queries.
 * How: Normalizes page params, computes URLs/meta, and executes callbacks.
 */
export async function paginateQuery<T = any>(options: PaginateQueryOptions<T>): Promise<PaginatedResult<T>> {
  const maxPerPage = toPositiveInt(options.maxPerPage, 100);
  const perPage = Math.min(toPositiveInt(options.perPage, 15), maxPerPage);
  const page = toPositiveInt(options.page, 1);

  const total = Number(await options.total());
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, lastPage);
  const safeOffset = (currentPage - 1) * perPage;
  const data = await options.data(perPage, safeOffset);

  const from = total === 0 ? null : safeOffset + 1;
  const to = total === 0 ? null : safeOffset + data.length;
  const path = options.path || "";
  const firstPageUrl = pageUrl(path, 1, perPage);
  const lastPageUrl = pageUrl(path, lastPage, perPage);
  const prevPageUrl = currentPage > 1 ? pageUrl(path, currentPage - 1, perPage) : null;
  const nextPageUrl = currentPage < lastPage ? pageUrl(path, currentPage + 1, perPage) : null;

  const links: Array<{ url: string | null; label: string; page: number | null; active: boolean }> = [
    {
      url: prevPageUrl,
      label: "&laquo; Previous",
      page: currentPage > 1 ? currentPage - 1 : null,
      active: false
    }
  ];

  for (let p = 1; p <= lastPage; p += 1) {
    links.push({
      url: pageUrl(path, p, perPage),
      label: String(p),
      page: p,
      active: p === currentPage
    });
  }

  links.push({
    url: nextPageUrl,
    label: "Next &raquo;",
    page: currentPage < lastPage ? currentPage + 1 : null,
    active: false
  });

  return {
    current_page: currentPage,
    data,
    first_page_url: firstPageUrl,
    from,
    last_page: lastPage,
    last_page_url: lastPageUrl,
    links,
    next_page_url: nextPageUrl,
    path,
    per_page: perPage,
    prev_page_url: prevPageUrl,
    to,
    total
  };
}

/**
 * Why: Paginates a Drizzle query using request query params.
 * When: Route handlers receive `page/per_page` from client.
 * Where: API controllers returning list resources.
 * How: Builds count subquery and applies limit/offset to source query.
 */
export async function paginate<T = any>(
  c: RequestLike,
  query: any,
  perPage = 15,
  options: { maxPerPage?: number; path?: string } = {}
): Promise<PaginatedResult<T>> {
  const page = Number(c.req.query("page") || 1);
  const size = c.req.query("size");
  const perPageQuery = c.req.query("per_page");
  const perPageValue = Number(size || perPageQuery || perPage);
  const resolvedPath = resolvePath(c, options.path);

  return paginateQuery<T>({
    page,
    perPage: perPageValue,
    maxPerPage: options.maxPerPage,
    path: resolvedPath,
    total: async () => {
      const inner = db.select({ val: sql`1` }).from(query.as("_inner"));
      const [row] = await db.select({ total: count() }).from(inner);
      return Number(row?.total ?? 0);
    },
    data: (limit, offset) => query.limit(limit).offset(offset)
  });
}

/**
 * Why: Laravel-style pagination for Drizzle relational queries.
 * When: Controllers need eager loading via `db.query.table.findMany({ with })`.
 * Where: Use beside `paginate`; this targets model/relational API, not select builders.
 * How: Counts the base table separately, then runs `findMany` with limit/offset.
 */
export async function paginateModel<T = any>(c: RequestLike, options: PaginateModelOptions<T>): Promise<PaginatedResult<T>> {
  const page = Number(c.req.query("page") || options.page || 1);
  const size = c.req.query("size");
  const perPageQuery = c.req.query("per_page");
  const perPageValue = Number(size || perPageQuery || options.perPage || 15);
  const resolvedPath = resolvePath(c, options.path);

  return paginateQuery<T>({
    page,
    perPage: perPageValue,
    maxPerPage: options.maxPerPage,
    path: resolvedPath,
    total: async () => {
      if (options.total) return Number(await options.total());
      if (!options.table) throw new Error("paginateModel requires either table or total callback");

      let totalQuery = db.select({ total: count() }).from(options.table);
      if (options.where) totalQuery = totalQuery.where(options.where);
      const [row] = await totalQuery;
      return Number(row?.total ?? 0);
    },
    data: async (limit, offset) => {
      if (options.data) return options.data({ limit, offset });
      if (!options.query) throw new Error("paginateModel requires either query or data callback");

      const args: Record<string, any> = { limit, offset };
      if (options.where) args.where = options.where;
      if (options.with) args.with = options.with;
      if (options.columns) args.columns = options.columns;
      if (options.extras) args.extras = options.extras;
      if (options.orderBy) args.orderBy = options.orderBy;

      return options.query.findMany(args);
    }
  });
}

/**
 * Why: Paginates a full table with optional filters/sorting.
 * When: CRUD list endpoints need simple table pagination.
 * Where: Service/controller code using table helpers.
 * How: Runs total + paged select with where/order options.
 */
export async function paginateTable<T = any>(db: any, table: any, options: PaginateOptions = {}): Promise<PaginatedResult<T>> {
  return paginateQuery<T>({
    page: options.page,
    perPage: options.perPage,
    maxPerPage: options.maxPerPage,
    path: options.path,
    total: async () => {
      let totalQuery = db.select({ total: count() }).from(table);
      if (options.where) totalQuery = totalQuery.where(options.where);
      const totalRow = await totalQuery;
      return Number(totalRow[0]?.total ?? 0);
    },
    data: async (limit, offset) => {
      let dataQuery = db.select(getTableColumns(table)).from(table);
      if (options.where) dataQuery = dataQuery.where(options.where);
      if (options.orderBy?.length) dataQuery = dataQuery.orderBy(...options.orderBy);
      return dataQuery.limit(limit).offset(offset);
    }
  });
}
