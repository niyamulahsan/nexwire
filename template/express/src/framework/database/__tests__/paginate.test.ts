import { describe, expect, it } from "vitest";
import { paginateQuery } from "../paginate.js";

/**
 * Tier 3: pure-logic tests. paginateQuery is the heart of the pagination module —
 * every public paginator (paginate, paginateModel, paginateTable) normalizes into this.
 * The bug class here is wrong page math: off-by-one from/to offsets, clamping to page 1
 * when the requested page is past the last, or perPage silently exceeding the cap.
 */

const makeData = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginateQuery page math", () => {
  it("first page: from 1, to perPage, prev null, next exists", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 10, path: "/users",
      total: async () => 100,
      data: async (limit, offset) => makeData(limit).slice(offset, offset + limit),
    });

    expect(result.current_page).toBe(1);
    expect(result.from).toBe(1);
    expect(result.to).toBe(10);
    expect(result.prev_page_url).toBeNull();
    expect(result.next_page_url).toContain("page=2");
  });

  it("middle page: from = offset+1", async () => {
    const result = await paginateQuery({
      page: 3, perPage: 10, path: "/users",
      total: async () => 100,
      data: async (limit, offset) => makeData(30).slice(offset, offset + limit),
    });

    expect(result.current_page).toBe(3);
    expect(result.from).toBe(21);
    expect(result.to).toBe(30);
  });

  it("last page: next is null", async () => {
    const result = await paginateQuery({
      page: 10, perPage: 10, path: "/users",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.current_page).toBe(10);
    expect(result.next_page_url).toBeNull();
    expect(result.prev_page_url).toContain("page=9");
  });

  it("page 0 is clamped to 1", async () => {
    const result = await paginateQuery({
      page: 0, perPage: 10, path: "/users",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.current_page).toBe(1);
  });

  it("page past last clamps to last page", async () => {
    const result = await paginateQuery({
      page: 99, perPage: 10, path: "/users",
      total: async () => 20,
      data: async (limit, offset) => makeData(limit).slice(offset),
    });

    expect(result.current_page).toBe(2);
  });

  it("perPage is capped at maxPerPage", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 500, maxPerPage: 50, path: "/users",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.per_page).toBe(50);
  });

  it("perPage < 1 defaults to 15", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 0, path: "/users",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.per_page).toBe(15);
  });

  it("zero results: from and to are null", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 10, path: "/users",
      total: async () => 0,
      data: async () => [],
    });

    expect(result.total).toBe(0);
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
    expect(result.last_page).toBe(1);
    expect(result.next_page_url).toBeNull();
  });

  it("last page may have partial results: to reflects data length", async () => {
    const result = await paginateQuery({
      page: 3, perPage: 10, path: "/users",
      total: async () => 25,
      data: async (limit, offset) => makeData(5),
    });

    expect(result.current_page).toBe(3);
    expect(result.from).toBe(21);
    expect(result.to).toBe(25);
  });

  it("path optional: urls are null when path is empty", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 10, path: "",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.first_page_url).toBeNull();
    expect(result.last_page_url).toBeNull();
    expect(result.prev_page_url).toBeNull();
    expect(result.next_page_url).toBeNull();
  });

  it("path with query string appends with & not ?", async () => {
    const result = await paginateQuery({
      page: 1, perPage: 10, path: "/users?sort=name",
      total: async () => 100,
      data: async (limit) => makeData(limit),
    });

    expect(result.first_page_url).toContain("?sort=name&page=1");
  });
});

describe("paginateQuery link structure", () => {
  it("links array has previous, all pages, next", async () => {
    const result = await paginateQuery({
      page: 2, perPage: 10, path: "/users",
      total: async () => 30,
      data: async (limit) => makeData(limit),
    });

    const labels = result.links.map((l) => l.label);
    expect(labels[0]).toContain("Previous");
    expect(labels[labels.length - 1]).toContain("Next");
    expect(result.links.length).toBe(5); // prev + 3 pages + next
    expect(result.links.filter((l) => l.active)).toHaveLength(1);
  });

  it("active page links to itself", async () => {
    const result = await paginateQuery({
      page: 2, perPage: 10, path: "/users",
      total: async () => 30,
      data: async (limit) => makeData(limit),
    });

    const active = result.links.find((l) => l.active);
    expect(active?.page).toBe(2);
    expect(active?.url).toContain("page=2");
  });
});
