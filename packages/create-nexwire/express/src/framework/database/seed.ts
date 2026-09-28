import { closeDatabase, initDatabase } from "@/framework/database/connection.js";
import { discoverModuleFiles, importFile } from "@/framework/modules/discover.js";

const NAME_SYMBOL = Symbol.for("drizzle:Name");
const FK_SYMBOLS = [
  Symbol.for("drizzle:PgInlineForeignKeys"),
  Symbol.for("drizzle:MySqlInlineForeignKeys"),
  Symbol.for("drizzle:SQLiteInlineForeignKeys")
];

interface SeederEntry {
  file: string;
  name: string;
  execute: () => Promise<void>;
  tableName?: string;
  dependsOn: string[];
}

function getTableDeps(table: any): string[] {
  for (const sym of FK_SYMBOLS) {
    const fks = table[sym] as any[] | undefined;
    if (!fks || fks.length === 0) continue;
    const deps: string[] = [];
    for (const fk of fks) {
      const ref = fk.reference();
      if (ref?.foreignTable) {
        const name = ref.foreignTable[NAME_SYMBOL] as string;
        if (name && !deps.includes(name)) deps.push(name);
      }
    }
    return deps;
  }
  return [];
}

await initDatabase();

try {
  const moduleArg = process.argv.find((arg) => arg.startsWith("--module="));
  const moduleName = moduleArg?.split("=")[1]?.trim();
  const pattern = moduleName ? `${moduleName}/database/seeders/*.{ts,js}` : "**/database/seeders/*.{ts,js}";

  const files = await discoverModuleFiles(pattern);
  const seeders: SeederEntry[] = [];

  for (const file of files) {
    const mod = await importFile(file);
    if (typeof mod.default !== "function") {
      throw new Error(`Seeder file ${file} has no default export function`);
    }
    const table: any = mod.table;
    const entry: SeederEntry = {
      file,
      name: file
        .split(/[\\/]/)
        .pop()!
        .replace(/\.(ts|js)$/, ""),
      execute: () => mod.default(),
      dependsOn: table ? getTableDeps(table) : []
    };
    if (table) {
      entry.tableName = table[NAME_SYMBOL] as string;
    }
    seeders.push(entry);
  }

  const tableToSeeder = new Map<string, SeederEntry>();
  for (const s of seeders) {
    if (s.tableName) tableToSeeder.set(s.tableName, s);
  }

  const seederByName = new Map<string, SeederEntry>();
  for (const s of seeders) {
    seederByName.set(s.name, s);
  }

  const resolvedDeps = new Map<SeederEntry, SeederEntry[]>();
  for (const s of seeders) {
    const deps: SeederEntry[] = [];
    for (const tableDep of s.dependsOn) {
      const depSeeder = tableToSeeder.get(tableDep);
      if (depSeeder && depSeeder !== s) {
        deps.push(depSeeder);
      }
    }
    resolvedDeps.set(s, deps);
  }

  const inDegree = new Map<SeederEntry, number>();
  const adj = new Map<SeederEntry, SeederEntry[]>();
  for (const s of seeders) {
    inDegree.set(s, 0);
    adj.set(s, []);
  }
  for (const s of seeders) {
    for (const dep of resolvedDeps.get(s)!) {
      adj.get(dep)!.push(s);
      inDegree.set(s, inDegree.get(s)! + 1);
    }
  }

  const queue: SeederEntry[] = [];
  for (const [s, deg] of inDegree) {
    if (deg === 0) queue.push(s);
  }

  const sorted: SeederEntry[] = [];
  while (queue.length > 0) {
    const s = queue.shift()!;
    sorted.push(s);
    for (const next of adj.get(s)!) {
      const newDeg = inDegree.get(next)! - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (sorted.length !== seeders.length) {
    const seeded = new Set(sorted.map((s) => s.name));
    const missing = seeders.filter((s) => !seeded.has(s.name)).map((s) => s.name);
    console.error(`Circular dependency detected among seeders: ${missing.join(", ")}`);
    process.exit(1);
  }

  for (const s of sorted) {
    await s.execute();
  }

  console.log(`Executed ${sorted.length} seeder file(s)${moduleName ? ` for module ${moduleName}` : ""}`);
} finally {
  await closeDatabase();
}
