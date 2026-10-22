import { describe, expect, it } from "vitest";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

const seg = await import("../src/lib/segments.ts");
const { customers } = await import("../src/db/schema.ts");

const dialect = new PgDialect();
const stats = seg.orderStatsSubquery("biz-1");
const render = (cond: any) => dialect.sqlToQuery(cond);

describe("segments SQL", () => {
  it("order stats subquery counts only live, non-cancelled orders of the business", () => {
    const { sql, params } = new QueryBuilder()
      .select({ id: customers.id, n: seg.ordersCountSql(stats) })
      .from(customers)
      .leftJoin(stats, eq(stats.customerId, customers.id))
      .toSQL();
    expect(sql).toContain('left join (select "customer_id", count(*)::int as "orders_count", sum("total_amount") as "total_spend", max("created_at") as "last_order_at" from "orders"');
    expect(sql).toContain('"orders"."business_id" = $1 and "orders"."is_deleted" = $2 and "orders"."status" <> $3');
    expect(sql).toContain('group by "orders"."customer_id") "order_stats" on "order_stats"."customer_id" = "customers"."id"');
    expect(params).toEqual(["biz-1", false, "cancelled"]);
  });

  it("renders each segment condition", () => {
    expect(seg.segmentCondition("all", stats)).toBeUndefined();
    const sqlOf = (s: any) => render(seg.segmentCondition(s, stats)).sql;
    expect(render(seg.segmentCondition("favourites", stats))).toEqual({ sql: '"customers"."is_favourite" = $1', params: [true], typings: expect.anything() });
    expect(sqlOf("priority")).toBe('"customers"."is_priority" = $1');
    expect(sqlOf("previous_buyers")).toBe('coalesce("order_stats"."orders_count", 0) >= 1');
    expect(sqlOf("repeat_buyers")).toBe('coalesce("order_stats"."orders_count", 0) >= 2');
    expect(sqlOf("never_ordered")).toBe('coalesce("order_stats"."orders_count", 0) = 0');
    expect(sqlOf("new")).toBe(`"customers"."created_at" >= (now() - interval '${seg.NEW_DAYS} days')`);
    expect(sqlOf("inactive")).toBe(
      `(coalesce("order_stats"."orders_count", 0) >= 1 and "order_stats"."last_order_at" < (now() - interval '${seg.INACTIVE_DAYS} days'))`,
    );
    expect(seg.NEW_DAYS).toBe(14);
    expect(seg.INACTIVE_DAYS).toBe(90);
  });

  it("renders filters: trimmed case-insensitive city, exact language, complaint exclusion", () => {
    const { sql, params } = render(
      seg.filtersCondition("biz-1", { city: "  KoChi ", language: "malayalam", excludeComplaints: true }),
    );
    expect(sql).toContain('lower(btrim("customers"."city")) = $1');
    expect(sql).toContain('"customers"."language" = $2');
    expect(sql).toMatch(/not exists \(select 1 from "escalations"\s+inner join "conversations" on "conversations"."id" = "escalations"."conversation_id"/);
    expect(sql).toContain('"conversations"."customer_id" = "customers"."id"');
    expect(sql).toContain('"escalations"."reason" in ($4, $5)');
    expect(params).toEqual(["kochi", "malayalam", "biz-1", "intent_complaint", "intent_refund"]);
  });

  it("no filters → no condition; blank city is ignored", () => {
    expect(seg.filtersCondition("biz-1", {})).toBeUndefined();
    expect(seg.filtersCondition("biz-1", { city: "   ", excludeComplaints: false })).toBeUndefined();
  });

  it("segmentWhere ANDs business scope, segment and filters", () => {
    const { sql, params } = render(seg.segmentWhere("biz-1", "repeat_buyers", { language: "english" }, stats));
    expect(sql).toBe(
      '("customers"."business_id" = $1 and coalesce("order_stats"."orders_count", 0) >= 2 and "customers"."language" = $2)',
    );
    expect(params).toEqual(["biz-1", "english"]);
  });

  it("segment counts use one count(*) filter per segment", () => {
    const { sql } = new QueryBuilder()
      .select(seg.segmentCountsSelect(stats))
      .from(customers)
      .leftJoin(stats, eq(stats.customerId, customers.id))
      .toSQL();
    expect(sql.match(/count\(\*\) filter/g)).toHaveLength(seg.SEGMENTS.length);
    expect(sql).toContain("(count(*) filter (where true))::int");
  });
});

describe("segmentsFor", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const base = { isFavourite: false, isPriority: false, createdAt: daysAgo(100), ordersCount: 0, lastOrderAt: null };

  it("never ordered, old customer", () => {
    expect(seg.segmentsFor(base, now)).toEqual(["never_ordered"]);
  });

  it("new favourite priority customer", () => {
    expect(seg.segmentsFor({ ...base, isFavourite: true, isPriority: true, createdAt: daysAgo(3) }, now)).toEqual([
      "favourites", "priority", "new", "never_ordered",
    ]);
  });

  it("repeat buyer who went quiet is inactive", () => {
    expect(seg.segmentsFor({ ...base, ordersCount: 3, lastOrderAt: daysAgo(120) }, now)).toEqual([
      "previous_buyers", "repeat_buyers", "inactive",
    ]);
  });

  it("recent single buyer is not inactive", () => {
    expect(seg.segmentsFor({ ...base, ordersCount: 1, lastOrderAt: daysAgo(10).toISOString() }, now)).toEqual([
      "previous_buyers",
    ]);
  });
});
