# Read Back a Stored File (PDF / Excel / CSV / Text)

> **The short version:** a file you **uploaded** (or generated and kept in a permanent disk) is read back with `storage.disk("public").readStream(path)` (binary) or `.read()`. Run it through `mime(path)` / `metadata(path).mimeType` when you need the Content-Type — and when the browser must **show it inline** (PDF viewer, image, audio/video), send that Content-Type + a `Content-Disposition: inline` header instead of `attachment`.

## Where the Content-Type Comes From

Every nexwire storage entry knows its file's MIME from the **extension** — that's the "Content-Type is set from the file" you see in the download helpers. This is exactly what `generateForDownload` / `consumeGenerated` do internally with the `extension` you pass. When you stream the file yourself, reproduce it with the same lookup so `Content-Type` is correct and the browser renders it (instead of offering to download):

| Your need                              | Facade call to get the MIME                                               |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Buffered read + MIME, one go           | `const buf = await disk.read(path); const t = await disk.mime(path);`     |
| Streaming read + MIME, media/PDF force | `const t = await disk.mime(path); const s = await disk.readStream(path);` |
| Inline vs download                     | `Content-Disposition: inline` → show; `attachment; filename=…` → download |

## Read Back an Uploaded PDF (Inline Preview)

The browser previews with an `<iframe>` / `<embed>` pointing at a route that streams the stored file with `Content-Type: application/pdf` and `Content-Disposition: inline`.

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { storage } from "@/framework/facade.js";

export const getStoredPdf: Handler = async (c: any) => {
  const path = "reports/" + c.req.param("file"); // e.g. reports/quarterly.pdf
  const disk = storage.disk("public");

  if (!(await disk.exists(path))) return c.status(404);
  const mime = await disk.mime(path);
  const stream = await disk.readStream(path);

  return new Response(stream as any, {
    headers: {
      "content-type": mime,
      "content-disposition": `inline`, // show, don't download
      "content-length": String(await disk.size(path)),
    },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";
import { storage } from "@/framework/facade.js";

export const getStoredPdf = async (req: Request, res: Response) => {
  const path = "reports/" + req.params.file;
  const disk = storage.disk("public");

  if (!(await disk.exists(path))) return res.status(404).end();
  const mime = await disk.mime(path);
  const stream = await disk.readStream(path);

  res.set("content-type", mime);
  res.set("content-disposition", "inline");
  res.set("content-length", String(await disk.size(path)));
  stream.pipe(res);
};
```

:::

> **Don't** use `consumeGenerated` for a file you keep stored under a permanent disk — that helper is for **one-time temp downloads** where the file is deleted after reading. A persisted file that should be re-readable lives on a persistent disk and is served with `readStream` (or `read` for small files) as above.

## Read Back an Uploaded Text File (Show in `<pre>`)

For uploads you want to display as text (logs, `.txt`, JSON, generated code), the Vue side reads via `fetch` + `.text()` — no download prompt:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const getStoredText: Handler = async (c: any) => {
  const path = "imports/" + c.req.param("file");
  const disk = storage.disk("private");
  const mime = await disk.mime(path); // "text/plain", "application/json", ...
  return new Response((await disk.read(path)) as any, {
    headers: { "content-type": mime },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";

export const getStoredText = async (req: Request, res: Response) => {
  const path = "imports/" + req.params.file;
  const disk = storage.disk("private");
  res.set("content-type", await disk.mime(path));
  res.send(await disk.read(path));
};
```

:::

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";

const raw = ref("");
onMounted(async () => {
  const r = await fetch("/api/files/text/session.log");
  raw.value = await r.text(); // .text() only — the browser decodes; no buffering on the server
});
</script>

<template>
  <pre
    class="rounded-lg border bg-neutral-950 p-4 text-sm text-neutral-50 whitespace-pre-wrap"
    >{{ raw }}</pre
  >
</template>
```

## Read Back an Uploaded Excel (Hosted Viewer Not Included — Use Download)

There's no first-party .xlsx viewer — **the browser cannot inline-render ExcelJS-style binary**. The right pattern: the Vue reads it as a **download** (link) for the user to open in their spreadsheet app, or the server parses it (see [Large Excel Import](./index#import-excel-parse-uploaded-xlsx)). Minimal download exposure:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const getStoredWorkbook: Handler = async (c: any) => {
  const path = "uploads/" + c.req.param("file"); // e.g. uploads/store-list.xlsx
  const disk = storage.disk("public");
  const mime = await disk.mime(path); // "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  const stream = await disk.readStream(path);
  return new Response(stream as any, {
    headers: {
      "content-type": mime,
      "content-disposition": `attachment; filename="${c.req.param("file")}"`,
    },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";

export const getStoredWorkbook = async (req: Request, res: Response) => {
  const path = "uploads/" + req.params.file;
  const disk = storage.disk("public");
  res.set("content-type", await disk.mime(path));
  res.set("content-disposition", `attachment; filename="${req.params.file}"`);
  (await disk.readStream(path)).pipe(res);
};
```

:::

```vue
<a
  :href="`/api/files/excel/store-list.xlsx`"
  download="store-list.xlsx"
  class="btn btn-primary">Download workbook</a>
```

## Read Back an Image the Browser Uploaded (Inline `<img>`)

Same idea, `inline` disposition — used for avatars, galleries, anything the client uploaded:

::: code-group

```ts [Hono]
import type { Handler } from "hono";

export const getStoredImage: Handler = async (c: any) => {
  const path = "avatars/" + c.req.param("file");
  const disk = storage.disk("public");
  const mime = await disk.mime(path);
  const stream = await disk.readStream(path);
  return new Response(stream as any, {
    headers: { "content-type": mime, "content-disposition": "inline" },
  });
};
```

```ts [Express]
import type { Request, Response } from "express";

export const getStoredImage = async (req: Request, res: Response) => {
  const path = "avatars/" + req.params.file;
  const disk = storage.disk("public");
  res.set("content-type", await disk.mime(path));
  res.set("content-disposition", "inline");
  (await disk.readStream(path)).pipe(res);
};
```

:::

```vue
<img
  :src="`/api/files/avatar/${currentUser.avatar}`"
  class="size-10 rounded-full" />
```

## Rule of Thumb — Which Server Helper For What

| Scenario                                               | Helper                                                                   | Disposition  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------ |
| Inline browser view — PDF / image / audio / video      | `disk.mime` + `disk.readStream`                                          | `inline`     |
| Inline text — `.txt` / `.json` / `.log`                | `disk.mime` + `disk.read`                                                | `inline`     |
| Re-downloadable stored file (Excel / CSV / whatever)   | `disk.mime` + `disk.readStream`                                          | `attachment` |
| One-time generated temp (PDF report, export CSV/Excel) | `generateForDownload` / `generateForDownloadStream` + `consumeGenerated` | `attachment` |

> **Same-disk pairing:** the read-back controller must target the **same disk** the upload wrote to. If the upload route used `storage.disk("tmp").writeStream(...)` and the read-back route uses `storage.disk("public").readStream(...)`, the file silently 404s — the two disks are different directories. Keep them paired (upload → `public`, read → `public`), or move the tmp file to the permanent disk after processing before exposing it.
