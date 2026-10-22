import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.ts";
import { channels, conversations, customers } from "../db/schema.ts";
import { orderStatsSubquery, segmentWhere, type OrderStats, type Segment, type SegmentFilters } from "../lib/segments.ts";

/** Who a broadcast targets: a segment + filters within one business. */
export interface AudienceSpec {
  businessId: string;
  segment: Segment;
  filters: SegmentFilters;
}

/**
 * Broadcast audience = segment + filters, WhatsApp customers only, never
 * opted-out customers. Needs the channels inner join and the order stats join.
 */
export function audienceWhere(spec: AudienceSpec, stats: OrderStats): SQL {
  return and(
    segmentWhere(spec.businessId, spec.segment, spec.filters, stats),
    eq(channels.type, "whatsapp"),
    eq(customers.optedOut, false),
  )!;
}

/** Latest conversation of the outer customers row (by last message, then creation). */
export const latestConversationIdSql = () =>
  sql<string | null>`(select ${conversations.id} from ${conversations}
    where ${conversations.customerId} = ${customers.id}
    order by ${conversations.lastMessageAt} desc nulls last, ${conversations.createdAt} desc
    limit 1)`;

/** Number of customers a broadcast with this segment + filters would reach right now. */
export async function countAudience(spec: AudienceSpec): Promise<number> {
  const stats = orderStatsSubquery(spec.businessId);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
    .from(customers)
    .innerJoin(channels, eq(channels.id, customers.channelId))
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(audienceWhere(spec, stats));
  return Number(row?.count ?? 0);
}

export interface AudienceMember {
  customerId: string;
  phone: string;
  conversationId: string | null;
}

/** The audience rows (oldest customers first), for snapshotting broadcast recipients. */
export async function listAudience(spec: AudienceSpec): Promise<AudienceMember[]> {
  const stats = orderStatsSubquery(spec.businessId);
  return db
    .select({
      customerId: customers.id,
      phone: customers.handleOrPhone,
      conversationId: latestConversationIdSql(),
    })
    .from(customers)
    .innerJoin(channels, eq(channels.id, customers.channelId))
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(audienceWhere(spec, stats))
    .orderBy(asc(customers.createdAt), asc(customers.id));
}
