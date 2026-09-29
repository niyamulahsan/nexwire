# Database

## How It Works

The database pipeline is fully automated. You never write schema files or migration SQL by hand.

1. **Define models** — Create Drizzle model files under `modules/<module>/database/models/`
2. **Run `db:migrate --seed`** — The CLI auto-generates the schema barrel file, creates migration SQL via Drizzle Kit, applies them, and optionally seeds

The schema file at `src/database/schema.ts` is **auto-generated** — it scans all `modules/**/database/models/*.ts` and re-exports them. You never edit it manually.

## Typical Workflow

Create a module with model and seeder:

::: code-group

```bash [npm]
npm run maker module:make blog
npm run maker db:migrate -- --seed
```

```bash [pnpm]
pnpm maker module:make blog
pnpm maker db:migrate --seed
```

```bash [npm]
yarn maker module:make blog
yarn maker db:migrate --seed
```

```bash [bun]
bun maker module:make blog
bun maker db:migrate --seed
```

:::

The first migration uses `--name init`. Subsequent migrations are named incrementally by Drizzle Kit. The schema is regenerated automatically before every migration — no manual `db:schema` needed.

## Commands

### `db:migrate` — Full Pipeline (recommended)

::: code-group

```bash [npm]
npm run maker db:migrate -- --seed
```

```bash [pnpm]
pnpm maker db:migrate --seed
```

```bash [yarn]
yarn maker db:migrate --seed
```

```bash [bun]
bun maker db:migrate --seed
```

:::
Runs in order:

1. Syncs migration dialect to `DATABASE_URL`
2. Generates `src/database/schema.ts` from module models
3. Generates migration `.sql` files via Drizzle Kit
4. Applies pending migrations to the database
5. Runs model migration hooks from `src/framework/database/migrate-hooks.ts`
6. Runs seeders (if `--seed`)

If you delete migration files while the database still has tables, the command detects this and throws:

```
Initial migration was generated, but the database already contains tables.
Use 'npm run maker db:fresh -- --seed' (or 'bun maker db:fresh --seed') to rebuild locally, or restore migration files before running db:migrate.
```

### `db:generate` — Migration Files Only

::: code-group

```bash [npm]
npm run maker db:generate
```

```bash [pnpm]
pnpm maker db:generate
```

```bash [yarn]
yarn maker db:generate
```

```bash [bun]
bun maker db:generate
```

:::

Generates schema and migration SQL without applying them. Useful for code review before running.

### `db:migrate:run` — Apply Only

::: code-group

```bash [npm]
npm run maker db:migrate:run
```

```bash [pnpm]
pnpm maker db:migrate:run
```

```bash [yarn]
yarn maker db:migrate:run
```

```bash [bun]
bun maker db:migrate:run
```

:::

Applies existing migration files without regenerating schema or migrations. Used when you pulled migration files from a teammate.

After migrations are applied, this command also executes model migration hooks.

### `db:fresh` — Full Rebuild

::: code-group

```bash [npm]
npm run maker db:fresh
```

```bash [pnpm]
pnpm maker db:fresh
```

```bash [yarn]
yarn maker db:fresh
```

```bash [bun]
bun maker db:fresh
```

:::

Drops and recreates the database, then regenerates everything:

1. Drops database (or deletes SQLite file)
2. Recreates empty database
3. Generates schema
4. Generates migration files
5. Runs migrations
6. Runs model migration hooks
7. Runs seeders (if `--seed`)

Use this when:

- Migration files were deleted or corrupted
- The migration journal is out of sync with table state
- You want to reset the database to a clean state during development

### `db:reset` / `db:wipe` — Wipe Only

::: code-group

```bash [npm]
npm run maker db:reset
npm run maker db:wipe
```

```bash [pnpm]
pnpm maker db:reset
pnpm maker db:wipe
```

```bash [yarn]
yarn maker db:reset
yarn maker db:wipe
```

```bash [bun]
bun maker db:reset
bun maker db:wipe
```

:::

Drops and recreates the database. No migrations, no seeds. Use this to quickly clear all data without rebuilding schema (e.g., before importing a production dump into a clean database).

### `db:schema` — Regenerate Schema Only

::: code-group

```bash [npm]
npm run maker db:schema
```

```bash [pnpm]
pnpm maker db:schema
```

```bash [yarn]
yarn maker db:schema
```

```bash [bun]
bun maker db:schema
```

:::

Regenerates `src/database/schema.ts` from model files. Normally unnecessary — `migrate`, `generate`, and `fresh` all call this automatically. Only needed if you want to inspect the barrel file.

### `db:seed` — Seed Only

::: code-group

```bash [npm]
npm run maker db:seed
npm run maker db:module:seed welcome  # seed a specific module
```

```bash [pnpm]
pnpm maker db:seed
pnpm maker db:module:seed welcome  # seed a specific module
```

```bash [yarn]
yarn maker db:seed
yarn maker db:module:seed welcome  # seed a specific module
```

```bash [bun]
bun maker db:seed
bun maker db:module:seed welcome  # seed a specific module
```

:::

Runs the seeder files for all modules (or a specific one). Useful after a `db:reset` to repopulate test data.

### `db:push` — Direct Schema Push (no migration files)

::: code-group

```bash [npm]
npm run maker db:push
```

```bash [pnpm]
pnpm maker db:push
```

```bash [yarn]
yarn maker db:push
```

```bash [bun]
bun maker db:push
```

:::

Pushes schema directly to the database via Drizzle Kit push. Generates schema first.

### `db:studio` — Drizzle Studio

::: code-group

```bash [npm]
npm run maker db:studio
```

```bash [pnpm]
pnpm maker db:studio
```

```bash [yarn]
yarn maker db:studio
```

```bash [bun]
bun maker db:studio
```

:::

Opens the Drizzle Studio GUI for browsing and editing data.

## Model Files

Model files live under `modules/<module>/database/models/`. They define your database tables using Drizzle ORM schema builders. The dialect is auto-detected from `DATABASE_URL` at scaffold time.

### MySQL Model (generated by `module:make`)

```ts
import { relations } from "drizzle-orm";
import { int, mysqlTable, timestamp } from "drizzle-orm/mysql-core";

export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### PostgreSQL Model

```ts
import { relations } from "drizzle-orm";
import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

### SQLite Model

```ts
import { relations } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});
```

Add columns, foreign keys, and relations as needed. For a real-world example, see `modules/auth/database/models/user.ts`:

```ts
import { relations } from "drizzle-orm";
import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/mysql-core";
import { roles } from "@/modules/auth/database/models/role.js";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  roleId: int("role_id").references(() => roles.id, {
    onUpdate: "cascade",
    onDelete: "set null",
  }),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));
```

## Migration Hooks

When you need DB-specific raw SQL per table, export a hook object from that model file. This is useful for advanced indexes, generated columns, and database extensions.

Hook runner location:

- `src/framework/database/migrate-hooks.ts`

Auto-run commands:

- `npm run|pnpm|yarn|bun maker db:migrate`
- `npm run|pnpm|yarn|bun maker db:migrate:run`
- `npm run|pnpm|yarn|bun maker db:fresh`

Model example:

```ts
export const rolesMigrationSql = {
  __migrationSql: true,
  postgresql: [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE INDEX IF NOT EXISTS roles_name_trgm_idx ON roles USING GIN (name gin_trgm_ops)",
  ],
  mysql: ["CREATE INDEX roles_name_idx ON roles (name)"],
  sqlite: ["CREATE INDEX IF NOT EXISTS roles_name_idx ON roles (name)"],
};
```

### Dialect Setup

- **PostgreSQL (`postgresql`)**
  - Use PostgreSQL-only SQL: `CREATE EXTENSION`, `GENERATED ALWAYS AS (...) STORED`, `GIN + pg_trgm`, partial/expression indexes.
- **MySQL (`mysql`)**
  - Use MySQL-compatible SQL: btree/fulltext/generated columns based on your MySQL version.
- **SQLite (`sqlite`)**
  - Use SQLite-compatible SQL: typically simple `CREATE INDEX IF NOT EXISTS ...` statements.

This keeps schema generation automatic while allowing per-table raw SQL where needed.

## Seeder Files

Seeder files live under `modules/<module>/database/seeders/`. They populate your database with initial data when you run `db:migrate --seed` or `db:seed`.

### Generated Stub

```ts
import { db } from "@/framework/facade.js";
import { posts } from "@/modules/blog/database/models/post.js";

export const table = posts;

export default async function PostSeeder() {
  const rows = [
    // Add your seed data here
    // Example:
    // { name: "Post 1", description: "This is the first post" },
    // { name: "Post 2", description: "This is the second post" }
  ];

  for (const row of rows) {
    await db.insert(posts).values(row);
  }

  console.log("Post seeder completed");
}
```

The first time a seeder is generated, it's created **commented out** — uncomment and fill in your data before running `--seed`.

### Real Example — User Seeder

For a complete example, see `modules/auth/database/seeders/user.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, password } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { users } from "@/modules/auth/database/models/user.js";

export const table = users;

export default async function UserSeeder() {
  const adminRole = await db.query.roles.findFirst({
    where: eq(roles.name, "admin"),
  });
  const userRole = await db.query.roles.findFirst({
    where: eq(roles.name, "user"),
  });

  const rows = [
    {
      name: "Admin",
      email: "admin@example.com",
      password: await password.hashPassword("Password@123"),
      roleId: adminRole?.id ?? null,
    },
    {
      name: "User One",
      email: "user1@example.com",
      password: await password.hashPassword("Password@123"),
      roleId: userRole?.id ?? null,
    },
  ];

  for (const row of rows) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, row.email),
    });
    if (!existing) {
      await db.insert(users).values(row);
    }
  }

  console.log("User seeder completed");
}
```

This shows common patterns: looking up related records, hashing passwords, and skipping existing records to make seeds idempotent.

## Dialect-Aware

The framework adapts to your `DATABASE_URL`:

- `mysql://` → MySQL dialect
- `postgres://` → PostgreSQL dialect
- `sqlite:` → SQLite dialect

Drizzle model stubs use the correct types per dialect. Migration files are stored in `src/database/migrations/<dialect>/`. The CLI detects dialect changes and resets migration files automatically.

## Pagination

Drizzle ORM does not include a built-in pagination helper. **nexwire** provides pagination utilities in `src/framework/database/paginate.ts` that wrap your Drizzle queries with page/per_page parsing, total count, and link generation.

> **Performance note**: All three use a **lean count subquery** (`SELECT count(*) FROM (SELECT 1 FROM ...) AS _inner`) instead of wrapping the full SELECT with all columns. This avoids materializing column data just for counting, giving significant speed improvements on wide tables or complex joins.

### Which one to use?

| Function          | When to use                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paginate()`      | **Default choice** — route handlers with joins, WHERE, GROUP BY, HAVING, DISTINCT. Reads `page`/`per_page` from request query.                            |
| `paginateModel()` | **Relational eager loading** — uses `db.query.table.findMany({ with })` and returns full pagination metadata.                                             |
| `paginateTable()` | **Single table** with optional WHERE/ORDER BY. No joins. No request object needed.                                                                        |
| `paginateQuery()` | **Count and data queries are structurally different** — e.g., count all active users but show only top spenders. Manual `total()` and `data()` callbacks. |

### `paginate(context, query, perPage)` — From Request (recommended)

For route handlers. Reads `page`, `per_page`, and `size` from the request query string. Handles joins, GROUP BY, HAVING, DISTINCT correctly. `context` is the request-like object — `c` on Hono, `req` on Express:

::: code-group

```ts [Hono]
import { desc } from "drizzle-orm";
import { db, paginate } from "@/framework/facade.js";
import { posts } from "@/modules/blog/database/models/post.js";

const query = db.select().from(posts).orderBy(desc(posts.id));
const result = await paginate(c, query, 15);
```

```ts [Express]
import { desc } from "drizzle-orm";
import { db, paginate } from "@/framework/facade.js";
import { posts } from "@/modules/blog/database/models/post.js";

const query = db.select().from(posts).orderBy(desc(posts.id));
const result = await paginate(req, query, 15);
```

:::

Request example: `GET /posts?page=2&per_page=20`

With joins:

::: code-group

```ts [Hono]
import { desc, eq } from "drizzle-orm";
import { db, paginate } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { posts } from "@/modules/blog/database/models/post.js";

const query = db
  .select({
    id: posts.id,
    title: posts.title,
    authorName: users.name,
  })
  .from(posts)
  .leftJoin(users, eq(posts.authorId, users.id))
  .where(eq(posts.published, true))
  .orderBy(desc(posts.id));

const result = await paginate(c, query, 15);
```

```ts [Express]
import { desc, eq } from "drizzle-orm";
import { db, paginate } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { posts } from "@/modules/blog/database/models/post.js";

const query = db
  .select({
    id: posts.id,
    title: posts.title,
    authorName: users.name,
  })
  .from(posts)
  .leftJoin(users, eq(posts.authorId, users.id))
  .where(eq(posts.published, true))
  .orderBy(desc(posts.id));

const result = await paginate(req, query, 15);
```

:::

### `paginateModel(c, options)` — Relational Eager Loading

Use `paginateModel` when you want Drizzle relational eager loading with `db.query.<table>.findMany({ with })`:

::: code-group

```ts [Hono]
import { desc, eq } from "drizzle-orm";
import { db, paginateModel } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";

const result = await paginateModel(c, {
  table: users,
  query: db.query.users,
  where: eq(users.status, "1"),
  with: {
    role: true,
    profile: true,
  },
  orderBy: desc(users.id),
  perPage: 10,
  path: c.req.path,
});
```

```ts [Express]
import { desc, eq } from "drizzle-orm";
import { db, paginateModel } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";

const result = await paginateModel(req, {
  table: users,
  query: db.query.users,
  where: eq(users.status, "1"),
  with: {
    role: true,
    profile: true,
  },
  orderBy: desc(users.id),
  perPage: 10,
  path: req.path,
});
```

:::

Internally, `paginateModel` runs a count query against the base table, then runs `findMany` with `limit`, `offset`, and your eager-loaded relations.

Nested eager loading:

::: code-group

```ts [Hono]
const result = await paginateModel(c, {
  table: users,
  query: db.query.users,
  where,
  with: {
    role: true,
    profile: {
      with: {
        address: {
          with: {
            region: true,
            district: true,
            block: true,
            ward: true,
          },
        },
      },
    },
  },
  orderBy: desc(users.id),
});
```

```ts [Express]
const result = await paginateModel(req, {
  table: users,
  query: db.query.users,
  where,
  with: {
    role: true,
    profile: {
      with: {
        address: {
          with: {
            region: true,
            district: true,
            block: true,
            ward: true,
          },
        },
      },
    },
  },
  orderBy: desc(users.id),
});
```

:::

For relation filters, build the SQL condition first, then pass it to `paginateModel`. Use subqueries for relation checks so the final condition still belongs to the base query and count stays automatic:

::: code-group

```ts [Hono]
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, paginateModel } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

const where = and(
  eq(users.status, "1"),
  inArray(
    users.roleId,
    db.select({ id: roles.id }).from(roles).where(eq(roles.name, "admin")),
  ),
);

const result = await paginateModel(c, {
  table: users,
  query: db.query.users,
  where,
  with: { role: true },
  orderBy: desc(users.id),
});
```

```ts [Express]
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, paginateModel } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

const where = and(
  eq(users.status, "1"),
  inArray(
    users.roleId,
    db.select({ id: roles.id }).from(roles).where(eq(roles.name, "admin")),
  ),
);

const result = await paginateModel(req, {
  table: users,
  query: db.query.users,
  where,
  with: { role: true },
  orderBy: desc(users.id),
});
```

:::

If a query needs special count or data behavior, provide callbacks:

::: code-group

```ts [Hono]
import { count, desc } from "drizzle-orm";

// c on Hono, req on Express
const result = await paginateModel(c, {
  total: async () => {
    const [row] = await db.select({ total: count() }).from(users).where(where);
    return Number(row?.total ?? 0);
  },
  data: async ({ limit, offset }) => {
    return db.query.users.findMany({
      where,
      with: { role: true },
      limit,
      offset,
      orderBy: desc(users.id),
    });
  },
});
```

```ts [Express]
import { count, desc } from "drizzle-orm";

// c on Hono, req on Express
const result = await paginateModel(req, {
  total: async () => {
    const [row] = await db.select({ total: count() }).from(users).where(where);
    return Number(row?.total ?? 0);
  },
  data: async ({ limit, offset }) => {
    return db.query.users.findMany({
      where,
      with: { role: true },
      limit,
      offset,
      orderBy: desc(users.id),
    });
  },
});
```

:::

### `paginateTable(db, table, options)` — Direct Table

For simple single-table queries with optional filters and sorting. No joins, no GROUP BY:

```ts
import { desc, eq } from "drizzle-orm";
import { db, paginateTable } from "@/framework/facade.js";
import { posts } from "@/modules/blog/database/models/post.js";

const result = await paginateTable(db, posts, {
  page: 1,
  perPage: 10,
  where: eq(posts.authorId, userId),
  orderBy: [desc(posts.createdAt)],
});
```

### `paginateQuery(options)` — Custom Callbacks

For complex queries where **the count must be different from the data query**:

```ts
import { count, eq, gt, sum } from "drizzle-orm";
import { db, paginateQuery } from "@/framework/facade.js";
import { orders } from "@/modules/sales/database/models/order.js";
import { users } from "@/modules/auth/database/models/user.js";

const result = await paginateQuery({
  page: 1,
  perPage: 15,
  total: async () => {
    // Count all active users (ignore GROUP BY/HAVING)
    const [row] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.active, true));
    return Number(row?.total ?? 0);
  },
  data: async (limit, offset) => {
    // Data: only users with >5 orders
    return db
      .select({
        id: users.id,
        name: users.name,
        orderCount: count(orders.id),
        totalSpent: sum(orders.amount),
      })
      .from(users)
      .leftJoin(orders, eq(users.id, orders.userId))
      .groupBy(users.id)
      .having(gt(count(orders.id), 5))
      .limit(limit)
      .offset(offset);
  },
});
```

### Response Shape

All three return the same structure:

```json
{
  "current_page": 2,
  "data": [ ... ],
  "from": 21,
  "to": 40,
  "total": 156,
  "last_page": 8,
  "per_page": 20,
  "path": "/posts",
  "first_page_url": "/posts?page=1&per_page=20",
  "last_page_url": "/posts?page=8&per_page=20",
  "prev_page_url": "/posts?page=1&per_page=20",
  "next_page_url": "/posts?page=3&per_page=20",
  "links": [
    { "url": "/posts?page=1&per_page=20", "label": "&laquo; Previous", "page": 1, "active": false },
    { "url": "/posts?page=1&per_page=20", "label": "1", "page": 1, "active": false },
    { "url": "/posts?page=2&per_page=20", "label": "2", "page": 2, "active": true },
    { "url": "/posts?page=3&per_page=20", "label": "3", "page": 3, "active": false },
    { "url": "/posts?page=8&per_page=20", "label": "Next &raquo;", "page": 8, "active": false }
  ]
}
```

The response includes complete pagination metadata so frontend clients can build page navigation without additional server calls.
