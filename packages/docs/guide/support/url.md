# URL

## Overview

The URL utility provides helpers for building **absolute application URLs**. Use it when generating links for emails, API responses, or redirects.

## URL Utility

```ts
import { urls } from "@/framework/facade.js";
```

| Method           | Purpose                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `urls.appUrl()`  | Returns the base application URL with trailing slash removed. Use as a base for absolute links.    |
| `urls.url(path)` | Builds a full absolute URL pointing at the SPA page that handles the path. Handles slash normalization. |

## Usage

```ts
import { urls } from "@/framework/facade.js";

urls.appUrl();
// "https://example.com"

urls.url("/reset-password?token=abc");
// "https://example.com/reset-password?token=abc"

urls.url("api/health");
// "https://example.com/api/health"
```

## URL Resolution

`urls.url()` decides the origin with **three independent knobs**:

1. `appConfig.frontendUrl` — the SPA is a **separate build/origin** (dev Vite dev server, or a separately deployed SPA). The link points there. **Wins when set.**
2. `appConfig.uiEnabled && hasUiBuild()` — the framework serves the **built SPA itself**, so the page resolves to the **app origin** (same as the browser). Single origin in dev-with-UI-built and production.
3. `appConfig.uiEnabled && !hasUiBuild()` — the Vite dev server is still running (UI not built yet) — use the origin the maker-cli injected (`NEXWIRE_FRONTEND_URL`, the dev Vite dev server, e.g. `http://localhost:5173`). Falls back to the app URL if the var is missing.
4. When both origin knobs are unset (API-only mode) there is no SPA to point at — fall back to the app URL so the link is at least valid.

```ts
urls.url("/reset-password");
// dev + UI not built → "http://localhost:5173/reset-password"
// dev + UI built, or production   → "http://localhost:3000/reset-password"
```

## Environment Variables

| Variable       | Default | Description                                                                 |
| -------------- | ------- | --------------------------------------------------------------------------- |
| `APP_URL`      | —       | **Required.** Base URL of the application.                                   |
| `FRONTEND_URL` | —       | Separate SPA origin when the UI is a different build/origin. Leave empty when served from `APP_URL`. |
