// In-memory, chainable stand-in for the drizzle `db` used by the customers /
// broadcasts tests. Use it from a vi.mock factory:
//
//   vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());
//
// Plain lookups run against `fake.tables`: WHERE clauses are rendered with the
// real Postgres dialect and the simple comparisons on the queried table
// (=, <>, <, <=, in, is null) are evaluated. Anything richer (joins, aggregates,
// segment SQL) is answered by `fake.onSelect`, which receives the full query.

import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

export const tableName = (t: any): string => t?.[Symbol.for("drizzle:Name")] ?? "";
const camel = (col: string) => col.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

export interface FakeQuery {
  op: "select" | "insert" | "update" | "delete";
  table: string;
  fields?: Record<string, any> | undefined;
  where?: any;
  set?: Record<string, any>;
  values?: any;
  joins: string[];
  limit?: number;
  offset?: number;
  orderBy: any[];
  groupBy: boolean;
  returning?: Record<string, any> | true;
  onConflictDoNothing: boolean;
}

export function render(cond: any): { sql: string; params: unknown[] } {
  if (!cond) return { sql: "", params: [] };
  const { sql, params } = dialect.sqlToQuery(cond);
  return { sql, params };
}

const toComparable = (v: unknown) =>
  v instanceof Date ? v.getTime() : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : v;

/** Evaluate the simple comparisons on `table` columns in a WHERE clause. */
export function matches(table: string, row: any, cond: any): boolean {
  if (!cond) return true;
  const { sql, params } = render(cond);
  const p = (idx: string) => params[Number(idx) - 1];
  const col = (name: string) => row[camel(name)];
  const t = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const m of sql.matchAll(new RegExp(`"${t}"\\."(\\w+)" (=|<>|<=|<) \\$(\\d+)`, "g"))) {
    const [, name, op, idx] = m;
    const a = toComparable(col(name!));
    const b = toComparable(p(idx!));
    if (op === "=" && a !== b) return false;
    if (op === "<>" && a === b) return false;
    if (op === "<" && !(a !== null && a !== undefined && (a as number) < (b as number))) return false;
    if (op === "<=" && !(a !== null && a !== undefined && (a as number) <= (b as number))) return false;
  }
  for (const m of sql.matchAll(new RegExp(`"${t}"\\."(\\w+)" in \\(([^)]*)\\)`, "g"))) {
    const [, name, list] = m;
    const values = [...list!.matchAll(/\$(\d+)/g)].map((x) => p(x[1]!));
    if (!values.includes(col(name!))) return false;
  }
  for (const m of sql.matchAll(new RegExp(`"${t}"\\."(\\w+)" is null`, "g"))) {
    const v = col(m[1]!);
    if (v !== null && v !== undefined) return false;
  }
  return true;
}

/** Project a row onto select/returning fields (columns and whole tables only). */
export function project(fields: Record<string, any> | true | undefined, row: any): any {
  if (!fields || fields === true) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (tableName(field)) out[key] = { ...row };
    else if (field && typeof field === "object" && typeof field.name === "string" && "columnType" in field) {
      out[key] = row[camel(field.name)];
    } else out[key] = undefined;
  }
  return out;
}

export interface FakeState {
  tables: Record<string, any[]>;
  queries: FakeQuery[];
  /** Return rows to answer a select yourself; undefined = default in-memory lookup. */
  onSelect: (q: FakeQuery) => any[] | undefined;
  /** Unique keys per table, checked by onConflictDoNothing inserts. */
  unique: Record<string, string[]>;
  seq: number;
  reset(tables?: Record<string, any[]>): void;
  /** Rendered WHERE clauses of matching queries. */
  wheres(filter?: Partial<Pick<FakeQuery, "op" | "table">>): Array<{ sql: string; params: unknown[] }>;
  rows(table: string): any[];
}

export const fake: FakeState = {
  tables: {},
  queries: [],
  onSelect: () => undefined,
  unique: {},
  seq: 0,
  reset(tables = {}) {
    this.tables = structuredClone(tables);
    this.queries = [];
    this.onSelect = () => undefined;
    this.unique = {};
    this.seq = 0;
  },
  wheres(filter = {}) {
    return this.queries
      .filter((q) => (!filter.op || q.op === filter.op) && (!filter.table || q.table === filter.table))
      .filter((q) => q.where)
      .map((q) => render(q.where));
  },
  rows(table) {
    return (this.tables[table] ??= []);
  },
};

function execute(q: FakeQuery): any[] {
  fake.queries.push(q);
  const rows = fake.rows(q.table);

  if (q.op === "select") {
    const custom = fake.onSelect(q);
    if (custom !== undefined) return custom;
    let out = rows.filter((r) => matches(q.table, r, q.where));
    if (q.offset) out = out.slice(q.offset);
    if (q.limit !== undefined) out = out.slice(0, q.limit);
    return out.map((r) => project(q.fields, r));
  }

  if (q.op === "insert") {
    const list = Array.isArray(q.values) ? q.values : [q.values];
    const inserted: any[] = [];
    for (const vals of list) {
      const keys = fake.unique[q.table];
      if (keys && rows.some((r) => keys.every((k) => r[k] === vals[k]))) {
        if (q.onConflictDoNothing) continue;
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      const row = { id: `${q.table}-${++fake.seq}`, createdAt: new Date(), ...vals };
      rows.push(row);
      inserted.push(row);
    }
    return inserted.map((r) => project(q.returning, r));
  }

  if (q.op === "update") {
    const hit = rows.filter((r) => matches(q.table, r, q.where));
    hit.forEach((r) => Object.assign(r, q.set));
    return hit.map((r) => project(q.returning, r));
  }

  // delete
  const hit = rows.filter((r) => matches(q.table, r, q.where));
  fake.tables[q.table] = rows.filter((r) => !hit.includes(r));
  return hit.map((r) => project(q.returning, r));
}

function chain(q: FakeQuery): any {
  const c: any = {
    from: (table: any) => ((q.table = tableName(table)), c),
    where: (w: any) => ((q.where = w), c),
    leftJoin: (t: any) => (q.joins.push(tableName(t) || "subquery"), c),
    innerJoin: (t: any) => (q.joins.push(tableName(t) || "subquery"), c),
    leftJoinLateral: (t: any) => (q.joins.push(tableName(t) || "lateral"), c),
    orderBy: (...o: any[]) => ((q.orderBy = o), c),
    groupBy: () => ((q.groupBy = true), c),
    limit: (n: number) => ((q.limit = n), c),
    offset: (n: number) => ((q.offset = n), c),
    set: (s: any) => ((q.set = s), c),
    values: (v: any) => ((q.values = v), c),
    returning: (f?: any) => ((q.returning = f ?? true), c),
    onConflictDoNothing: () => ((q.onConflictDoNothing = true), c),
    then: (res: any, rej: any) => Promise.resolve().then(() => execute(q)).then(res, rej),
  };
  return c;
}

const newQuery = (op: FakeQuery["op"], table = "", fields?: Record<string, any>): FakeQuery => ({
  op,
  table,
  fields,
  joins: [],
  orderBy: [],
  groupBy: false,
  onConflictDoNothing: false,
});

export const fakeDb: any = {
  select: (fields?: Record<string, any>) => chain(newQuery("select", "", fields)),
  insert: (table: any) => chain(newQuery("insert", tableName(table))),
  update: (table: any) => chain(newQuery("update", tableName(table))),
  delete: (table: any) => chain(newQuery("delete", tableName(table))),
  transaction: async (cb: (tx: any) => Promise<any>) => cb(fakeDb),
};

export function fakeDbModule() {
  return { db: fakeDb, schema: {}, sql: { end: () => Promise.resolve(), notify: () => Promise.resolve() } };
}
