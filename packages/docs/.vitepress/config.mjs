import { defineConfig } from "vitepress";

const svg = (paths, extra = "") =>
  `<svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">${extra}${paths}</svg>`;

const filled = (d) => svg(`<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${d}"/>`);
const group = (d) => svg(`<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${d}</g>`);

const navIcon = (inner, label) =>
  `<span class="vp-nav-icon-wrap"><span class="vp-nav-icon">${inner}</span><span>${label}</span></span>`;

const icons = {
  home: group(`<path d="M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>`),
  zap: filled(`M13 3v7h6l-8 11v-7H5z`),
  layered: filled(`M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13m9-13v13m9-13v13`),
  api: filled(`M4 7h3a1 1 0 0 0 1-1V5a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1a2 2 0 0 0-4 0v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a2 2 0 0 0 0-4H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1`),
  cli: filled(`M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1-3 3l-6-6a6 6 0 0 1-8-8z`),
  rocket: filled(`M14 8h6l2 2a2 2 0 0 1-2 2H14zm0 0l-4.5-4.5A2 2 0 0 0 8 3H6a1 1 0 0 0-1 1v2a2 2 0 0 0 .59 1.41L13.59 14M4 13l1.59-1.59A2 2 0 0 0 6 11v6a2 2 0 0 0 2 2h2a2 2 0 0 0 1.41-.59L16 17`),
  book: group(`<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`),
  info: group(`<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0m9-3h.01M11 12h1v4h1"/>`),
  compass: filled(`m12 6l-8 4l8 4l8-4zm-8 8l8 4l8-4`),
  cube: filled(`M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12`),
  settings: group(`<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/>`),
  globe: group(`<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0m.6-3h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18m1-18a17 17 0 0 1 0 18"/>`),
  grid4: filled(`m3 12l3 3l3-3l-3-3zm12 0l3 3l3-3l-3-3zM9 6l3 3l3-3l-3-3zm0 12l3 3l3-3l-3-3z`),
  route: filled(`M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm3-9h4a2 2 0 0 1 2 2v6M14 2l-3-1`),
  pencil: filled(`M4 20h4L20 8a1.5 1.5 0 0 0-4-4L4 16z`),
  database: group(`<path d="M4 6a8 3 0 1 0 16 0A8 3 0 1 0 4 6"/><path d="M4 6v6a8 3 0 0 0 16 0V6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/>`),
  lock: filled(`M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4`),
  flask: group(`<path d="M9 3h6M10 3v6.33L4.21 18.13A2 2 0 0 0 6 21h12a2 2 0 0 0 1.79-2.87L14 9.33V3"/><path d="M7 15h10"/>`),
  gauge: group(`<path d="M12 15l3.5-3.5"/><path d="M20.3 18a4 4 0 1 0-8-9.9"/>`),
  inbox: group(`<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h3l3 3h4l3-3h3"/>`),
  clock: group(`<path d="M10.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3m-4-7v4M8 3v4m-4 4h10"/><path d="M14 18a4 4 0 1 0 8 0a4 4 0 1 0-8 0M18 16.5V18l.5.5"/>`),
  radio: filled(`M7 12a5 5 0 0 1 5-5m0 0v3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2v-3h-3m10-5a5 5 0 0 0-5-5m0 5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2`),
  bell: filled(`M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0`),
  databaseZap: group(`<path d="M4 6a8 3 0 1 0 16 0A8 3 0 1 0 4 6"/><path d="M4 6v6a8 3 0 0 0 12 2.5"/><path d="M4 12v6a8 3 0 0 0 10 2.5M14 4v4m-1.5 4L14 9m3-2.5L14 9m-2.5 9l3-4h-2l2-4`),
  fingerprint: group(`<path d="M12 11c0 3.517-.083 5.133 0 8.5M8 9.5c-.5-2-2.5-5-5-4 3 1 2.5 8.5-1 11 2.5 1.5 5-4 3-7M12 7c3 1.5 3-4 6-5-2 4-3 9-1 14.5M15 11c.5 4 3 7 5.5 7 .5-3 0-6-1.5-9"/>`),
  folder: filled(`M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z`),
  badge: filled(`M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 0 6v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 0-6zM3 7v2a3 3 0 0 0 3 3h6v-5`),
  list: filled(`M6 6h15M6 12h15M6 18h9M3 6h.01M3 12h.01M3 18h.01`),
  file: filled(`M13 3v7h6l-8 11v-7H5z`),
  layout: filled(`M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 14h18`),
  play: filled(`M6 4v16l12-8z`),
  puzzle: filled(`M14 2l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8zM10 2v6l4 4M13 8v3`),
  brush: filled(`M14.06 9L4 19.06 5.94 21 16 10.94M12 4c1.5-1.5 5-2 7 0s1.5 5 0 7c-1.5 1.5-4 3-6 4L8 10c1-2 2.5-4.5 4-6z`),
  message: filled(`M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`),
  arrows: filled(`M7 16l-4-4l4-4M15 16l4-4l-4-4M11 5l2 14`),
  terminal: group(`<path d="M4 17l6-5l-6-5M12 17h8"/>`),
  monitor: filled(`M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm4 15h10m-8-4v4m6-4v4`),
  server: group(`<path d="M3 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zm0-8h6m-3-3v6"/>`),
  map: filled(`M9 4L3 6v14l6-2l6 2l6-2V4l-6 2zM9 4v14m6-12v14`),
  link: filled(`M9 3H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm11 11h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1zm-4-1a4 4 0 0 0-4-4M3 14a4 4 0 0 0 4 4h4`),
  calendar: group(`<path d="M9 3v4m6-4v4M4 11h16M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>`),
  hash: filled(`M4 9h16M4 15h16M10 3L8 21M16 3l-2 18`),
  eye: group(`<path d="M2 12s3-7 10-7s10 7 10 7s-3 7-10 7s-10-7-10-7"/><path d="M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"/>`),
  boxes: group(`<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>`),
  shield: filled(`M12 22s8-4 8-10V5l-8-3l-8 3v7c0 6 8 10 8 10z`),
  slug: filled(`M4 4h7v16H4zm9 0h7v10h-7z`),
  waves: filled(`M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13m9-13v13m9-13v13`),
  letter: filled(`M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 4l8 5l8-5`),
  pencilSquare: filled(`M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14 4V6a2 2 0 0 1 2-2h2`),
  layers: filled(`M12 3l9 5-9 5-9-5zm0 10l9 5-9 5-9-5Z`),
  nut: filled(`M12 3c1 1 1 2 2 2s1-1 2-1a2 2 0 0 1 2 2c0 1-1 1-1 2s1 1 2 2a2 2 0 0 1-1 2c-1 0-1-1-2-1s-1 1-1 2 1 1 2 2a2 2 0 0 1-2 2c-1 0-1-1-2-1s-1 1-1 2a2 2 0 0 1-2 0c-1-1 0-2-2-3s-2 1-3 0a2 2 0 0 1 0-2c1 0 1-1 1-2s-1-1-1-2a2 2 0 0 1 2 0c1 1 1 1 2-1`),
  checks: group(`<path d="M2 12l4 4l8-8"/><path d="m14 12l4 4l8-8"/>`),
  fileText: filled(`M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM16 2v6h6M16 13h-8M16 17h-8M9 9H7m2 0h4`),
  film: group(`<path d="M7 3v18M17 3v18M3 7.5h4M17 7.5h4M3 12h18M3 16.5h4M17 16.5h4"/>`),
  uploadCloud: group(`<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9m0-3 4-4-4-4m0 4h-4"/>`),
  download: group(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-5-5 5-5-5m5 5V3"/>`),
  sparkles: group(`<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>`),
  slider: filled(`M4 5h7v2H4zm9 0h7v2h-7zM4 11h4v2H4zm6 0h10v2H10zM4 17h8v2H4zm10 0h6v2h-6z`),
  support: group(`<path d="M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20m0-4a6 6 0 1 0 0-12a6 6 0 0 0 0 12M12 2v4m0 12v4M2 12h4m12 0h4M4.9 4.9l2.9 2.9m8.4 8.4l2.9 2.9m.1-14.2l-2.9 2.9M7.8 16.2l-2.9 2.9"/>`),
  cookie: group(`<path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20zM12 8a1 1 0 1 0 0-2a1 1 0 0 0 0 2M8 16a1 1 0 1 0 0-2a1 1 0 0 0 0 2m7-3a1 1 0 1 0 0-2a1 1 0 0 0 0 2"/>`),
  key: group(`<path d="m21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778a5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>`),
  wrench: filled(`M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z`),
  sigma: filled(`M18 7V4H6l6 8l-6 8h12v-3`),
  code: group(`<path d="m16 18l6-6l-6-6M8 6l-6 6l6 6"/>`),
  percent: group(`<path d="M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m0 0a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5m9 2a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5m-2.5-5l8 0"/>`),
};

const mi = (key, label) => navIcon(icons[key], label);

const changelogLink = { text: mi("fileText", "Changelog"), link: "/changelog" };

const config = defineConfig({
  base: "/nexwire/",
  title: "nexwire",
  description: "Full-stack TypeScript framework with Hono or Express, Vue 3, and Drizzle ORM",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/nexwire/favicon.svg" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/nexwire/nexwire-logo.png" }],
    ["link", { rel: "icon", href: "/nexwire/favicon.ico", sizes: "any" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/nexwire/nexwire-logo.png" }],
  ],
  themeConfig: {
    logo: "/nexwire-logo.png",
    siteTitle: false,
    nav: [
      { text: mi("home", "Home"), link: "/" },
      { text: mi("zap", "Quick Start"), link: "/guide/quick-start" },
      { text: mi("layered", "Guide"), link: "/guide/introduction" },
      { text: mi("api", "API"), link: "/api/index", activeMatch: "/api/" },
      { text: mi("cli", "CLI"), link: "/cli/reference" },
      { text: mi("rocket", "Deploy"), link: "/deploy/overview" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: mi("sparkles", "Getting Started"),
          items: [
            { text: mi("info", "Introduction"), link: "/guide/introduction" },
            { text: mi("zap", "Quick Start"), link: "/guide/quick-start" },
          ],
        },
        {
          text: mi("compass", "Essentials"),
          items: [
            { text: mi("layered", "Architecture"), link: "/guide/architecture" },
            { text: mi("globe", "Environment"), link: "/guide/env" },
            { text: mi("settings", "Configuration"), link: "/guide/configuration" },
            { text: mi("route", "Routing"), link: "/guide/routing" },
            { text: mi("book", "OpenAPI"), link: "/guide/openapi" },
            { text: mi("grid4", "Modules"), link: "/guide/modules" },
            { text: mi("database", "Database"), link: "/guide/database" },
            { text: mi("lock", "Authentication"), link: "/guide/auth" },
            { text: mi("flask", "Unit Testing"), link: "/guide/testing" },
          ],
        },
        {
          text: mi("slider", "Services"),
          items: [
            { text: mi("gauge", "Cache"), link: "/guide/cache" },
            { text: mi("inbox", "Queue & Events"), link: "/guide/events-queue" },
            { text: mi("clock", "Scheduler"), link: "/guide/scheduler" },
            { text: mi("radio", "Realtime"), link: "/guide/realtime" },
            { text: mi("bell", "Notifications"), link: "/guide/notification" },
            { text: mi("folder", "Storage"), link: "/guide/storage" },
            { text: mi("fingerprint", "Session"), link: "/guide/session" },
            { text: mi("gauge", "Rate Limiter"), link: "/guide/rate-limiter" },
          ],
        },
        {
          text: mi("support", "Support"),
          items: [
            { text: mi("cookie", "Cookie"), link: "/guide/support/cookie" },
            { text: mi("key", "JWT"), link: "/guide/support/jwt" },
            { text: mi("fileText", "Logger"), link: "/guide/support/logger" },
            { text: mi("letter", "Mail"), link: "/guide/support/mail" },
            { text: mi("shield", "Password"), link: "/guide/support/password" },
            { text: mi("link", "URL"), link: "/guide/support/url" },
            { text: mi("inbox", "Upload"), link: "/guide/support/upload" },
          ],
        },
        {
          text: mi("monitor", "UI"),
          items: [
            { text: mi("eye", "Overview"), link: "/guide/resources/" },
            { text: mi("play", "Entry Point"), link: "/guide/resources/entry-point" },
            { text: mi("settings", "Vite Config"), link: "/guide/resources/vite-config" },
            { text: mi("route", "Router"), link: "/guide/resources/router" },
            { text: mi("fileText", "Pages"), link: "/guide/resources/pages" },
            { text: mi("layout", "Layouts"), link: "/guide/resources/layouts" },
            {
              text: mi("puzzle", "Plugins"),
              items: [
                { text: mi("brush", "Gum"), link: "/guide/resources/gum" },
                { text: mi("radio", "Pulse"), link: "/guide/resources/pulse" },
                { text: mi("message", "Dialog"), link: "/guide/resources/dialog" },
                { text: mi("arrows", "Axios"), link: "/guide/resources/axios" },
              ],
            },
            { text: mi("database", "Stores"), link: "/guide/resources/stores" },
            { text: mi("puzzle", "Composables"), link: "/guide/resources/composables" },
            { text: mi("boxes", "Components"), link: "/guide/resources/components" },
            { text: mi("wrench", "Helpers"), link: "/guide/resources/helpers" },
          ],
        },
        {
          text: mi("boxes", "Others"),
          items: [
            {
              text: mi("calendar", "Date"),
              items: [
                { text: mi("calendar", "luxon"), link: "/guide/others/date" }
              ]
            },
            {
              text: mi("boxes", "lodash"),
              items: [
                { text: mi("slug", "String"), link: "/guide/others/string" },
                { text: mi("list", "Array"), link: "/guide/others/array" },
                { text: mi("boxes", "Collection"), link: "/guide/others/collection" },
                { text: mi("sigma", "Function"), link: "/guide/others/function" },
                { text: mi("code", "Lang"), link: "/guide/others/lang" },
                { text: mi("percent", "Math"), link: "/guide/others/math" },
                { text: mi("hash", "Number"), link: "/guide/others/number" },
                { text: mi("cube", "Object"), link: "/guide/others/object" },
                { text: mi("wrench", "Util"), link: "/guide/others/util" },
              ]
            }
          ],
        },
        changelogLink,
      ],
      "/cli/": [
        { text: mi("terminal", "CLI Reference"), link: "/cli/reference" },
        { text: mi("puzzle", "Module Commands"), link: "/cli/module" },
        { text: mi("shield", "Middleware Commands"), link: "/cli/middleware" },
        { text: mi("database", "Database Commands"), link: "/cli/database" },
        { text: mi("play", "Runtime Commands"), link: "/cli/runtime" },
        { text: mi("rocket", "Deploy Commands"), link: "/cli/deploy" },
        changelogLink,
      ],
      "/deploy/": [
        { text: mi("map", "Overview"), link: "/deploy/overview" },
        { text: mi("monitor", "Local Deploy"), link: "/deploy/local" },
        { text: mi("server", "Remote Deploy"), link: "/deploy/remote" },
        changelogLink,
      ],
      "/api/": [
        {
          text: mi("compass", "API Reference"), items: [
            { text: mi("list", "Overview"), link: "/api/index" },
          ]
        },
        {
          text: mi("route", "Routing & OpenAPI"),
          items: [
            { text: mi("layered", "createRouter"), link: "/api/createRouter" },
            { text: mi("route", "createRoute"), link: "/api/createRoute" },
            { text: mi("boxes", "group"), link: "/api/group" },
            { text: mi("fileText", "z"), link: "/api/z" },
            { text: mi("file", "jsonContent"), link: "/api/jsonContent" },
            { text: mi("hash", "HttpStatusCodes"), link: "/api/HttpStatusCodes" },
          ],
        },
        {
          text: mi("checks", "Validation"),
          items: [{ text: mi("checks", "validate"), link: "/api/validate" }],
        },
        {
          text: mi("database", "Database"),
          items: [
            { text: mi("database", "database"), link: "/api/database" },
            { text: mi("database", "db"), link: "/api/db" },
            { text: mi("list", "paginate"), link: "/api/paginate" },
            { text: mi("compass", "paginateModel"), link: "/api/paginateModel" },
            { text: mi("sigma", "paginateQuery"), link: "/api/paginateQuery" },
            { text: mi("grid4", "paginateTable"), link: "/api/paginateTable" },
          ],
        },
        {
          text: mi("databaseZap", "Cache"),
          items: [{ text: mi("gauge", "cache"), link: "/api/cache" }],
        },
        {
          text: mi("bell", "Events & Queue"),
          items: [
            { text: mi("terminal", "command"), link: "/api/command" },
            { text: mi("play", "dispatchCommand"), link: "/api/dispatchCommand" },
            { text: mi("bell", "dispatchEvent"), link: "/api/dispatchEvent" },
            { text: mi("inbox", "queue"), link: "/api/queue" },
            { text: mi("zap", "queueJob"), link: "/api/queueJob" },
            { text: mi("badge", "shouldQueue"), link: "/api/shouldQueue" },
          ],
        },
        {
          text: mi("radio", "Realtime & Scheduler"),
          items: [
            { text: mi("radio", "broadcast"), link: "/api/broadcast" },
            { text: mi("clock", "defineSchedule"), link: "/api/defineSchedule" },
            { text: mi("fingerprint", "session"), link: "/api/session" },
            { text: mi("waves", "notify"), link: "/api/notify" },
          ],
        },
        {
          text: mi("folder", "Storage"),
          items: [
            { text: mi("layered", "Overview"), link: "/api/storage/" },
            { text: mi("film", "Media Streaming"), link: "/api/storage/media-streaming" },
            { text: mi("fileText", "Read Stored File"), link: "/api/storage/read-stored-file" },
            { text: mi("uploadCloud", "Large Import"), link: "/api/storage/large-import" },
            { text: mi("download", "Generate & Download"), link: "/api/storage/generate-and-download" },
            { text: mi("inbox", "upload"), link: "/api/upload" },
          ],
        },
        {
          text: mi("wrench", "Support"),
          items: [
            { text: mi("shield", "password"), link: "/api/password" },
            { text: mi("key", "jwt"), link: "/api/jwt" },
            { text: mi("cookie", "cookie"), link: "/api/cookie" },
            { text: mi("letter", "mail"), link: "/api/mail" },
            { text: mi("fileText", "logger"), link: "/api/logger" },
            { text: mi("link", "urls"), link: "/api/urls" },
            { text: mi("boxes", "lodash"), link: "/api/lodash" },
          ],
        },
        changelogLink,
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/niyamulahsan/nexwire" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026-present nexwire",
    },
    search: { provider: "local" },
    outline: { label: "On this page" },
    docFooter: { prev: "Previous", next: "Next" },
    lastUpdated: { text: "Last updated" },
    returnToTopLabel: "Return to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Appearance",
    lightModeSwitchTitle: "Switch to light mode",
    darkModeSwitchTitle: "Switch to dark mode",
  },
});

// The changelog page sits outside every sidebar section, so it matches no prefix
// and would otherwise render with no sidebar at all. It reuses the guide menu so
// the reader keeps the full navigation on that page too.
config.themeConfig.sidebar["/changelog"] = config.themeConfig.sidebar["/guide/"];

export default config;
