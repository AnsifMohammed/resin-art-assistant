// Removes the demo data created by seed-demo.ts.
//
// Usage (from backend/):
//   npm run db:clear-demo -- --dry-run   # read-only: counts what would be deleted
//   npm run db:clear-demo                # deletes, in one transaction
//
// What is deleted: every row whose id starts with "seeddemo_", plus every row
// that points at one of those rows through a text "FK" column (for example a
// real reply or audit entry added later to a demo conversation, an order the
// admin created for a demo customer, or a broadcast that uses a demo template),
// so nothing is left dangling. Deletes run children-first in one transaction.
//
// Note: a real broadcast deleted because it used a demo template keeps the
// outbound messages it already wrote to real conversations (those rows do not
// reference the broadcast by a column, only in metadata).
import { sql as dsql } from "drizzle-orm";
import { db, sql } from "./index.ts";

const DRY_RUN = process.argv.includes("--dry-run");

/** LIKE pattern for demo ids (the underscore is escaped so it matches literally). */
const DEMO = `like 'seeddemo\\_%' escape '\\'`;

// Row sets, as subqueries. Each one also catches real rows that reference demo rows.
const demoCustomers = `select id from customers where id ${DEMO} or channel_id ${DEMO}`;
const demoConversations = `select id from conversations where id ${DEMO} or channel_id ${DEMO} or customer_id in (${demoCustomers})`;
const demoMessages = `select id from messages where id ${DEMO} or conversation_id in (${demoConversations})`;
const demoEscalations = `select id from escalations where id ${DEMO} or conversation_id in (${demoConversations})`;
const demoOrders = `select id from orders where id ${DEMO} or customer_id in (${demoCustomers})`;
const demoPayments = `select id from payments where id ${DEMO} or order_id in (${demoOrders})`;
const demoBroadcasts = `select id from broadcasts where id ${DEMO} or template_id ${DEMO}`;

/** [table, WHERE clause] in FK-safe delete order (children first). */
const PLAN: ReadonlyArray<readonly [string, string]> = [
  [
    "audit_log",
    `id ${DEMO}
     or conversation_id in (${demoConversations})
     or escalation_id in (${demoEscalations})
     or target_user_id ${DEMO}
     or details::text ${DEMO.replace("'seeddemo", "'%seeddemo")}
     or details->>'orderId' in (${demoOrders})
     or details->>'paymentId' in (${demoPayments})
     or details->>'broadcastId' in (${demoBroadcasts})
     or details->>'customerId' in (${demoCustomers})`,
  ],
  [
    "broadcast_recipients",
    `id ${DEMO}
     or broadcast_id in (${demoBroadcasts})
     or customer_id in (${demoCustomers})
     or conversation_id in (${demoConversations})
     or message_id in (${demoMessages})`,
  ],
  ["broadcasts", `id in (${demoBroadcasts})`],
  [
    "ai_decisions",
    `id ${DEMO} or conversation_id in (${demoConversations}) or message_id in (${demoMessages})`,
  ],
  ["escalations", `id in (${demoEscalations})`],
  ["messages", `id in (${demoMessages})`],
  ["payments", `id in (${demoPayments})`],
  ["order_items", `id ${DEMO} or order_id in (${demoOrders})`],
  ["orders", `id in (${demoOrders})`],
  ["conversations", `id in (${demoConversations})`],
  ["customers", `id in (${demoCustomers})`],
  ["message_templates", `id ${DEMO}`],
  ["channels", `id ${DEMO}`],
];

async function countAll(): Promise<Record<string, number>> {
  const selectList = PLAN.map(([table, where]) => `(select count(*)::int from ${table} where ${where}) as "${table}"`).join(",\n");
  const rows = await db.execute(dsql.raw(`select ${selectList}`));
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  return Object.fromEntries(PLAN.map(([table]) => [table, Number(row[table] ?? 0)]));
}

function printCounts(title: string, counts: Record<string, number>) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(title);
  for (const [table] of PLAN) console.log(`  ${table.padEnd(22)} ${String(counts[table] ?? 0).padStart(5)}`);
  console.log(`  ${"TOTAL".padEnd(22)} ${String(total).padStart(5)}`);
  return total;
}

async function main() {
  const before = await countAll();

  if (DRY_RUN) {
    printCounts("[dry-run] Rows that would be deleted (nothing was written):", before);
    return;
  }

  const total = Object.values(before).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log("No demo rows found. Nothing to delete.");
    return;
  }

  const deleted: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const [table, where] of PLAN) {
      const result = await tx.execute(dsql.raw(`delete from ${table} where ${where}`));
      deleted[table] = Number(result.count ?? 0);
    }
  });
  printCounts("Deleted demo rows:", deleted);
}

try {
  await main();
} catch (err) {
  console.error("clear-demo failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
