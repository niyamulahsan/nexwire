---
layout: home

hero:
  name: "nexwire"
  text: "Full-stack TypeScript Framework"
  tagline: Hono or Express API + Vue 3 UI + Drizzle ORM + Redis services
  image:
    src: /nexwire-logo.png
    alt: nexwire
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/niyamulahsan/nexwire

features:
  - icon: ⚡
    title: Hono & Express API
    details: Dual-engine HTTP server — Hono (default) or Express — with Zod OpenAPI validation and middleware support.
  - icon: 🖼️
    title: Vue 3 UI
    details: Component-based UI with Pinia state management, Vue Router, and Vite.
  - icon: 🗄️
    title: Drizzle ORM
    details: Type-safe database access with auto-generated schema for SQLite, MySQL, and PostgreSQL.
  - icon: 📦
    title: Module System
    details: Auto-discovered routes, controllers, models, seeders, jobs, and console commands.
  - icon: 🔴
    title: Redis-backed
    details: Session, cache, queue (BullMQ), and realtime (Socket.IO) — all powered by Redis.
  - icon: ⏰
    title: Scheduler
    details: Cron jobs with Redis distributed lock and database lock fallback.
  - icon: 💾
    title: Storage
    details: Local disk or S3-compatible providers (AWS S3, DigitalOcean Spaces, R2, MinIO).
  - icon: 🚀
    title: Deploy
    details: Docker Compose workflow for local and remote deployment with a single command.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #3b8eed 30%, #50a2ff);
}

.VPHero .VPImage {
  max-height: 180px;
  width: auto;
}
</style>
