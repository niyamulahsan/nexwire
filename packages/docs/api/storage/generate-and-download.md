### Generate CSV with One-Time Download

::: code-group

```ts [Hono]
import type { Handler } from "hono";

// POST /generate — create temp file
export const generateCsv: Handler = async (c: any) => {
  const csv = ["id,title", "1,nexwire report", "2,temporary file"].join("\n");
  const token = await storage.generateForDownload({
    prefix: "report",
    extension: "csv",
    data: csv,
  });
  return c.json({
    token,
    downloadUrl: `/download/${encodeURIComponent(token)}`,
  });
};

// GET /download/:token — serve once and delete
export const downloadCsv: Handler = async (c: any) => {
  const token = decodeURIComponent(c.req.param("token"));
  try {
    const file = await storage.consumeGenerated(token);
    return new Response(file, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=report.csv",
      },
    });
  } catch {
    return c.json({ message: "Download token expired or invalid" }, 404);
  }
};
```

```ts [Express]
import type { Request, Response } from "express";

// POST /generate — create temp file
export const generateCsv = async (req: Request, res: Response) => {
  const csv = ["id,title", "1,nexwire report", "2,temporary file"].join("\n");
  const token = await storage.generateForDownload({
    prefix: "report",
    extension: "csv",
    data: csv,
  });
  res.json({
    token,
    downloadUrl: `/download/${encodeURIComponent(token)}`,
  });
};

// GET /download/:token — serve once and delete
export const downloadCsv = async (req: Request, res: Response) => {
  const token = decodeURIComponent(req.params.token);
  try {
    const file = await storage.consumeGenerated(token);
    res
      .set("content-type", "text/csv; charset=utf-8")
      .set("content-disposition", "attachment; filename=report.csv")
      .send(file);
  } catch {
    res.status(404).json({ message: "Download token expired or invalid" });
  }
};
```

:::

> `storage.consumeGenerated()` returns a `Buffer` in both engines. Hono sends it via `new Response(file, ...)`; Express sends it with `res.send(file)` after setting the content headers.

### Generate Styled Excel

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const generateExcel: Handler = async (c: any) => {
  const ExcelJS = (await import("exceljs")).default;
  const body = c.req.valid("json") as { title: string };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");

  // Title row
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = body.title;
  sheet.getCell("A1").font = { bold: true, size: 14 };

  // Header row
  sheet.addRow(["ID", "Title", "Length"]);
  sheet.getRow(2).font = { bold: true };

  // Data rows
  const rows = [
    { id: 1, title: "nexwire framework" },
    { id: 2, title: "file generation" },
  ];
  for (const row of rows) {
    sheet.addRow([row.id, row.title, row.title.length]);
  }

  // Totals
  sheet.addRow([
    "Subtotal",
    rows.length,
    { formula: `SUM(C3:C${2 + rows.length})` },
  ]);
  sheet.addRow([
    "Grand Total",
    rows.length,
    { formula: `SUM(C3:C${2 + rows.length})` },
  ]);

  sheet.columns = [{ width: 10 }, { width: 38 }, { width: 14 }];

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const token = await storage.generateForDownload({
    prefix: "report",
    extension: "xlsx",
    data: buffer,
  });

  return c.json({
    token,
    downloadUrl: `/download/excel/${encodeURIComponent(token)}`,
  });
};
```

```ts [Express]
// modules/report/controllers/report-export.controller.ts (generate route)
import type { Request, Response } from "express";

export const generateExcel = async (req: Request, res: Response) => {
  const ExcelJS = (await import("exceljs")).default;
  const body = req.body as { title: string }; // validated in place

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");

  // Title row
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = body.title;
  sheet.getCell("A1").font = { bold: true, size: 14 };

  // Header row
  sheet.addRow(["ID", "Title", "Length"]);
  sheet.getRow(2).font = { bold: true };

  // Data rows
  const rows = [
    { id: 1, title: "nexwire framework" },
    { id: 2, title: "file generation" },
  ];
  for (const row of rows) {
    sheet.addRow([row.id, row.title, row.title.length]);
  }

  // Totals
  sheet.addRow([
    "Subtotal",
    rows.length,
    { formula: `SUM(C3:C${2 + rows.length})` },
  ]);
  sheet.addRow([
    "Grand Total",
    rows.length,
    { formula: `SUM(C3:C${2 + rows.length})` },
  ]);

  sheet.columns = [{ width: 10 }, { width: 38 }, { width: 14 }];

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const token = await storage.generateForDownload({
    prefix: "report",
    extension: "xlsx",
    data: buffer,
  });

  res.json({
    token,
    downloadUrl: `/download/excel/${encodeURIComponent(token)}`,
  });
};
```

:::

### Stream Excel for Very Large Data (`generateForDownloadStream`)

> **Why this exists:** `generateForDownload({ data })` and `workbook.xlsx.writeBuffer()` hold the **entire workbook in RAM**. For very large exports that memory spike can OOM the process. `generateForDownloadStream` pipes an inbound `Readable` to a temp file with backpressure — memory stays bounded regardless of data size.

> **exceljs API note:** exceljs exposes `write(target)` (pipes the workbook into a `Writable`), `writeBuffer()` (returns the whole `Buffer` — RAM heavy) and `writeFile(path)` — but **`workbook.xlsx.writeStream()` does NOT exist**. Do not emit `workbook.xlsx.writeStream()`; use the `PassThrough` bridge below instead.
>
> The bridge pattern: `workbook.xlsx.write(pass)` writes into the **Writable** side of a `PassThrough`, while `generateForDownloadStream` consumes the **Readable** side. Backpressure flows through the bridge, so memory between exceljs and disk is capped at ~16KB.

::: code-group

```ts [Hono]
import { storage } from "@/framework/facade.js";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";

// POST /report/export - streaming Excel for very large data
export const exportReport: Handler = async (c: any) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  // ...fill the sheet row by row...

  const bridge = new PassThrough();
  const pendingToken = storage.generateForDownloadStream({
    prefix: `report_${c.req.valid("param").id}`,
    extension: "xlsx",
    stream: bridge,
  });

  await workbook.xlsx.write(bridge);
  const token = await pendingToken;

  return c.json({
    token,
    downloadUrl: `/download/excel/${encodeURIComponent(token)}`,
  });
};
```

```ts [Express]
import { storage } from "@/framework/facade.js";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";

// POST /report/export - streaming Excel for very large data
export const exportReport = async (req: Request, res: Response) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  // ...fill the sheet row by row...

  const bridge = new PassThrough();
  const pendingToken = storage.generateForDownloadStream({
    prefix: `report_${req.params.id}`,
    extension: "xlsx",
    stream: bridge,
  });

  await workbook.xlsx.write(bridge);
  const token = await pendingToken;

  res.json({
    token,
    downloadUrl: `/download/excel/${encodeURIComponent(token)}`,
  });
};
```

:::

> Both engines resolve `pendingToken` only after the piped stream reaches `close` (file fully written). Keep the token pending **before** writing into the bridge — iterating rows first, then `await workbook.xlsx.write(bridge)` inflates the workbook fully in memory instead of streaming.
>
> Use `generateForDownloadStream` whenever the data size is unknown / very large (100 MB+). Use `generateForDownload({ data })` only when you already hold a small `Buffer` in hand.

### Generate PDF with Playwright (HTML → PDF)

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const generatePdf: Handler = async (c: any) => {
  const { chromium } = await import("playwright");
  const body = c.req.valid("json") as { title: string; rows: number };

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(body), { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });

    const token = await storage.generateForDownload({
      prefix: "report",
      extension: "pdf",
      data: pdf,
    });
    return c.json({
      token,
      downloadUrl: `/download/pdf/${encodeURIComponent(token)}`,
    });
  } finally {
    await browser.close();
  }
};
```

```ts [Express]
// modules/report/controllers/report-export.controller.ts (generate PDF route)
import type { Request, Response } from "express";

export const generatePdf = async (req: Request, res: Response) => {
  const { chromium } = await import("playwright");
  const body = req.body as { title: string; rows: number }; // validated in place

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(body), { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });

    const token = await storage.generateForDownload({
      prefix: "report",
      extension: "pdf",
      data: pdf,
    });
    res.json({
      token,
      downloadUrl: `/download/pdf/${encodeURIComponent(token)}`,
    });
  } finally {
    await browser.close();
  }
};
```

:::

### Large PDF Generation (Queued + Status Polling)

For heavy reports, generate in a background worker and poll for the result:
::: code-group

```ts [Hono]
import type { Handler } from "hono";
import crypto from "node:crypto";

// Controller: queue the work
export const generatePdfQueued: Handler = async (c: any) => {
  const body = c.req.valid("json");
  const requestId = crypto.randomUUID();

  await cache.put(`pdf:status:${requestId}`, { state: "pending" }, 1800);
  await dispatchCommand(
    "report.pdf.generate",
    { requestId, ...body },
    {
      async: true,
      queue: "default",
    },
  );

  return c.json(
    {
      requestId,
      statusUrl: `/pdf/${requestId}`,
      downloadUrl: `/pdf/${requestId}`,
    },
    202,
  );
};

// Controller: poll status, then serve
export const downloadPdf: Handler = async (c: any) => {
  const requestId = c.req.param("requestId");
  const status = await cache.get(`pdf:status:${requestId}`);

  if (!status) return c.json({ message: "Unknown request" }, 404);
  if (status.state === "pending") return c.json({ state: "pending" }, 202);
  if (status.state === "failed")
    return c.json({ message: status.message }, 500);

  const file = await storage.consumeGenerated(status.token);
  await cache.forget(`pdf:status:${requestId}`);
  return new Response(file, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=report.pdf",
    },
  });
};
```

```ts [Express]
// modules/report/controllers/report-export.controller.ts
import type { Request, Response } from "express";
import crypto from "node:crypto";

// Controller: queue the work
export const generatePdfQueued = async (req: Request, res: Response) => {
  const body = req.body; // validated in place
  const requestId = crypto.randomUUID();

  await cache.put(`pdf:status:${requestId}`, { state: "pending" }, 1800);
  await dispatchCommand(
    "report.pdf.generate",
    { requestId, ...body },
    {
      async: true,
      queue: "default",
    },
  );

  res.status(202).json({
    requestId,
    statusUrl: `/pdf/${requestId}`,
    downloadUrl: `/pdf/${requestId}`,
  });
};

// Controller: poll status, then serve
export const downloadPdf = async (req: Request, res: Response) => {
  const requestId = req.params.requestId;
  const status = await cache.get(`pdf:status:${requestId}`);

  if (!status) return res.status(404).json({ message: "Unknown request" });
  if (status.state === "pending")
    return res.status(202).json({ state: "pending" });
  if (status.state === "failed")
    return res.status(500).json({ message: status.message });

  const file = await storage.consumeGenerated(status.token);
  await cache.forget(`pdf:status:${requestId}`);
  res
    .status(200)
    .set("content-type", "application/pdf")
    .set("content-disposition", "attachment; filename=report.pdf")
    .send(file);
};
```

:::

```ts
// Worker
shouldQueue("report.pdf.generate", "default", async (job) => {
  const { requestId, title, rows } = job.data;
  try {
    const token = await generatePdfToken({ title, rows });
    await cache.put(`pdf:status:${requestId}`, { state: "ready", token }, 1800);
  } catch (error) {
    await cache.put(
      `pdf:status:${requestId}`,
      { state: "failed", message: String(error) },
      1800,
    );
  }
});
```
