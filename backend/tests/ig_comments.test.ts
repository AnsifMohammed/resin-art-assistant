import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, type FakeQuery } from "./fakeDb.ts";

applyTestEnv({ DEMO_MODE: "true", INSTAGRAM_ACCOUNT_ID: "our_ig_account_id" });

const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitEscalationNew: vi.fn(),
  emitEscalationAssigned: vi.fn(),
  emitConversationAccessChanged: vi.fn(),
  emitSettingsUpdated: vi.fn(),
  emitCustomerUpdated: vi.fn(),
  emitBroadcastUpdated: vi.fn(),
  emitIgCommentNew: vi.fn(),
  emitIgCommentUpdated: vi.fn(),
  disconnectUserEverywhere: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

const metaInstagram = vi.hoisted(() => ({
  replyToComment: vi.fn(async () => ({ id: "reply_meta_1" })),
  sendPrivateReply: vi.fn(async () => ({ messageId: "dm_meta_1" })),
  listRecentMedia: vi.fn(async () => [
    {
      id: "media_reel_1",
      mediaType: "reel" as const,
      caption: "Handmade Ocean Clock",
      permalink: "https://instagram.com/reel/1",
      thumbnailUrl: "https://example.com/thumb1.jpg",
      timestamp: new Date().toISOString(),
    },
    {
      id: "media_post_2",
      mediaType: "post" as const,
      caption: "Geode Coasters Saba Art",
      permalink: "https://instagram.com/p/2",
      thumbnailUrl: "https://example.com/thumb2.jpg",
      timestamp: new Date().toISOString(),
    },
  ]),
  splitInstagramText: vi.fn((t: string) => [t]),
  fetchInstagramDisplayName: vi.fn(async () => "Customer"),
  INSTAGRAM_MAX_TEXT_BYTES: 1000,
  INSTAGRAM_GRAPH_HOST: "https://graph.instagram.com",
  INSTAGRAM_GRAPH_VERSION: "v26.0",
}));
vi.mock("../src/services/meta/instagram.ts", () => metaInstagram);

const notifyMock = vi.hoisted(() => ({
  notifyIgCommentAttention: vi.fn(async () => {}),
  notifyEscalation: vi.fn(async () => {}),
}));
vi.mock("../src/services/notify.ts", () => notifyMock);

const enqueueIgMock = vi.hoisted(() => ({
  enqueueProcessIgComment: vi.fn(async () => ({ mode: "inline", jobId: null })),
}));
vi.mock("../src/queue/enqueueIgComment.ts", () => enqueueIgMock);

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

function answer(q: FakeQuery): any[] | undefined {
  if (!q.fields) return undefined;
  if (q.table === "ig_comments" && "count" in q.fields && !q.groupBy) {
    return [{ count: fake.rows("ig_comments").length }];
  }
  if (q.table === "ig_comments" && q.groupBy && "action" in q.fields && "count" in q.fields) {
    const groups = new Map<string, number>();
    for (const r of fake.rows("ig_comments")) {
      groups.set(r.action, (groups.get(r.action) ?? 0) + 1);
    }
    return [...groups.entries()].map(([action, count]) => ({ action, count }));
  }
  return undefined;
}

let app: any;
let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
  adminToken = app.jwt.sign({ sub: "admin-1", businessId: "biz-1", role: "admin", name: "Asha" });
  staffToken = app.jwt.sign({ sub: "staff-1", businessId: "biz-1", role: "staff", name: "Priya" });
});

beforeEach(() => {
  fake.reset({
    businesses: [
      {
        id: "biz-1",
        name: "Saba Art",
        settings: { igComments: { enabled: true, aiClassification: true } },
      },
    ],
    channels: [
      {
        id: "chan-1",
        businessId: "biz-1",
        type: "instagram",
        identifier: "our_ig_account_id",
        status: "active",
      },
    ],
    customers: [],
    conversations: [],
    messages: [],
    ig_comment_rules: [],
    ig_comments: [],
    audit_log: [],
  });
  fake.onSelect = answer;
  vi.clearAllMocks();
});

describe("Instagram Comments & Rules API", () => {
  describe("Rules CRUD & Validation", () => {
    it("admin can create, list, update, and delete a rule", async () => {
      // 1. Create rule
      const resCreate = await app.inject({
        method: "POST",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Price rule",
          keywords: ["price", "cost"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "both",
          publicReplyText: "Hi {customerHandle}! Sent DM",
          dmText: "Hi, price is ₹500",
          priority: 10,
        },
      });
      expect(resCreate.statusCode).toBe(201);
      const rule = resCreate.json().rule;
      expect(rule.name).toBe("Price rule");
      expect(rule.keywords).toEqual(["price", "cost"]);

      // 2. List rules
      const resList = await app.inject({
        method: "GET",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resList.statusCode).toBe(200);
      expect(resList.json().rules).toHaveLength(1);

      // 3. Update rule
      const resUpdate = await app.inject({
        method: "PATCH",
        url: `/ig/rules/${rule.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Price rule updated",
          isActive: false,
        },
      });
      expect(resUpdate.statusCode).toBe(200);
      expect(resUpdate.json().rule.name).toBe("Price rule updated");
      expect(resUpdate.json().rule.isActive).toBe(false);

      // 4. Delete rule
      const resDelete = await app.inject({
        method: "DELETE",
        url: `/ig/rules/${rule.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resDelete.statusCode).toBe(200);
      expect(resDelete.json().ok).toBe(true);
      expect(fake.rows("ig_comment_rules")).toHaveLength(0);
    });

    it("staff gets 403 on rules and comments routes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("validation rejects invalid rule inputs", async () => {
      // No keywords and no categories
      const res1 = await app.inject({
        method: "POST",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Invalid",
          keywords: [],
          categories: [],
          replyMode: "public",
          publicReplyText: "Hi",
        },
      });
      expect(res1.statusCode).toBe(400);

      // Public reply missing when mode is public
      const res2 = await app.inject({
        method: "POST",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Missing public text",
          keywords: ["price"],
          replyMode: "public",
        },
      });
      expect(res2.statusCode).toBe(400);

      // DM text missing when mode is dm
      const res3 = await app.inject({
        method: "POST",
        url: "/ig/rules",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Missing DM text",
          keywords: ["price"],
          replyMode: "dm",
        },
      });
      expect(res3.statusCode).toBe(400);
    });

    it("reorder rules rewrites priorities to 10, 20, 30...", async () => {
      fake.tables.ig_comment_rules = [
        { id: "r1", businessId: "biz-1", name: "R1", priority: 50 },
        { id: "r2", businessId: "biz-1", name: "R2", priority: 10 },
      ];

      const res = await app.inject({
        method: "POST",
        url: "/ig/rules/reorder",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ids: ["r1", "r2"] },
      });
      expect(res.statusCode).toBe(200);
      const r1 = fake.rows("ig_comment_rules").find((r) => r.id === "r1");
      const r2 = fake.rows("ig_comment_rules").find((r) => r.id === "r2");
      expect(r1.priority).toBe(10);
      expect(r2.priority).toBe(20);
    });
  });

  describe("POST /ig/rules/test", () => {
    it("tests complaint detection", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/ig/rules/test",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: "where is my order? not received yet" },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.category).toBe("complaint");
      expect(data.wouldDo).toBe("needs_attention");
      expect(data.matchedRule).toBeNull();
    });

    it("tests keyword match and renders previews", async () => {
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price rule",
          keywords: ["price", "cost"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "both",
          publicReplyText: "Hi {customerHandle}! Check DM",
          dmText: "Hi! Pricing for {postTitle} is ₹450",
          isActive: true,
          priority: 10,
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: "/ig/rules/test",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: "What is the price of this?" },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.category).toBe("price");
      expect(data.matchedBy).toBe("keyword");
      expect(data.wouldDo).toBe("both");
      expect(data.publicPreview).toContain("@sample_user");
      expect(data.dmPreview).toContain("₹450");
    });
  });

  describe("Webhook Comments Processing", () => {
    it("creates ig_comments row and enqueues processing", async () => {
      const webhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "our_ig_account_id",
            changes: [
              {
                field: "comments",
                value: {
                  id: "cmt_100",
                  text: "How much is this coaster set?",
                  from: { id: "user_99", username: "priya_art" },
                  media: { id: "media_reel_1", media_product_type: "REELS" },
                  timestamp: 1730000000,
                },
              },
            ],
          },
        ],
      };

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload: webhookPayload,
      });
      expect(res.statusCode).toBe(200);

      const rows = fake.rows("ig_comments");
      expect(rows).toHaveLength(1);
      expect(rows[0].metaCommentId).toBe("cmt_100");
      expect(rows[0].commenterUsername).toBe("priya_art");
      expect(rows[0].action).toBe("pending");
      expect(rt.emitIgCommentNew).toHaveBeenCalled();
      expect(enqueueIgMock.enqueueProcessIgComment).toHaveBeenCalledWith(
        expect.objectContaining({ commentId: rows[0].id }),
      );
    });

    it("ignores comments made by our own account", async () => {
      const webhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "our_ig_account_id",
            changes: [
              {
                field: "comments",
                value: {
                  id: "cmt_own",
                  text: "Thanks for watching!",
                  from: { id: "our_ig_account_id", username: "saba_art" },
                  media: { id: "media_reel_1" },
                },
              },
            ],
          },
        ],
      };

      await app.inject({
        method: "POST",
        url: "/webhook",
        payload: webhookPayload,
      });

      expect(fake.rows("ig_comments")).toHaveLength(0);
      expect(enqueueIgMock.enqueueProcessIgComment).not.toHaveBeenCalled();
    });
  });

  describe("Job: processIgCommentJob", () => {
    let processIgCommentJob: typeof import("../src/queue/jobs/processIgComment.ts").processIgCommentJob;

    beforeAll(async () => {
      const mod = await import("../src/queue/jobs/processIgComment.ts");
      processIgCommentJob = mod.processIgCommentJob;
    });

    it("skips when auto-replies are paused", async () => {
      fake.tables.businesses = [
        {
          id: "biz-1",
          settings: { igComments: { enabled: false } },
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c1",
          businessId: "biz-1",
          metaCommentId: "cmt_1",
          commenterIgId: "user_1",
          text: "Price please",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c1", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("skipped");
      expect(c.skipReason).toBe("paused");
      expect(metaInstagram.replyToComment).not.toHaveBeenCalled();
    });

    it("flags complaint -> needs_attention and alerts admin (no auto-reply)", async () => {
      fake.tables.ig_comments = [
        {
          id: "c2",
          businessId: "biz-1",
          metaCommentId: "cmt_2",
          commenterIgId: "user_2",
          commenterUsername: "user2",
          text: "Still not received, waste product and cheat",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c2", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("needs_attention");
      expect(c.category).toBe("complaint");
      expect(metaInstagram.replyToComment).not.toHaveBeenCalled();
      expect(metaInstagram.sendPrivateReply).not.toHaveBeenCalled();
      expect(notifyMock.notifyIgCommentAttention).toHaveBeenCalled();
    });

    it("matches keyword, sends public reply + DM, stores inbox conversation", async () => {
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price",
          keywords: ["price", "cost"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "both",
          publicReplyText: "Hi {customerHandle}! Sent details in DM",
          dmText: "Hi! Pricing is ₹500",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c3",
          businessId: "biz-1",
          metaCommentId: "cmt_3",
          mediaId: "m1",
          commenterIgId: "cust_123",
          commenterUsername: "priya",
          text: "What is the price?",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c3", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("replied_both");
      expect(c.matchedBy).toBe("keyword");
      expect(metaInstagram.replyToComment).toHaveBeenCalled();
      expect(metaInstagram.sendPrivateReply).toHaveBeenCalled();

      // Check inbox conversation created
      expect(fake.rows("customers")).toHaveLength(1);
      expect(fake.rows("conversations")).toHaveLength(1);
      const msgs = fake.rows("messages");
      expect(msgs).toHaveLength(1);
      expect(msgs[0].senderType).toBe("system");
      expect(msgs[0].metadata).toMatchObject({ kind: "ig_comment_dm", igCommentId: "c3" });
    });

    it("enforces media_ids scope: rule scoped to m1 does not apply to m2", async () => {
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Specific Reel Rule",
          keywords: ["price"],
          categories: ["price"],
          mediaIds: ["m1"],
          replyMode: "public",
          publicReplyText: "Hi",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c4",
          businessId: "biz-1",
          metaCommentId: "cmt_4",
          mediaId: "m2",
          commenterIgId: "cust_123",
          text: "price?",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c4", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("skipped");
      expect(c.skipReason).toBe("no_match");
      expect(metaInstagram.replyToComment).not.toHaveBeenCalled();
    });

    it("enforces one reply per person per post (already_replied)", async () => {
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price",
          keywords: ["price"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "public",
          publicReplyText: "Hi",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c_earlier",
          businessId: "biz-1",
          metaCommentId: "cmt_earlier",
          mediaId: "m1",
          commenterIgId: "user_repeat",
          text: "price?",
          action: "replied_public",
          commentedAt: new Date(Date.now() - 3600000),
        },
        {
          id: "c_new",
          businessId: "biz-1",
          metaCommentId: "cmt_new",
          mediaId: "m1",
          commenterIgId: "user_repeat",
          text: "price again please?",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c_new", businessId: "biz-1" });

      const cNew = fake.rows("ig_comments").find((r) => r.id === "c_new");
      expect(cNew.action).toBe("skipped");
      expect(cNew.skipReason).toBe("already_replied");
      expect(metaInstagram.replyToComment).not.toHaveBeenCalled();
    });

    it("falls back to public reply when comment is older than 7 days", async () => {
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price",
          keywords: ["price"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "both",
          publicReplyText: "Hi {customerHandle}! Public reply",
          dmText: "DM details",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c_old",
          businessId: "biz-1",
          metaCommentId: "cmt_old",
          mediaId: "m1",
          commenterIgId: "user_old",
          text: "price?",
          action: "pending",
          commentedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days old
        },
      ];

      await processIgCommentJob({ commentId: "c_old", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("replied_public");
      expect(metaInstagram.replyToComment).toHaveBeenCalled();
      expect(metaInstagram.sendPrivateReply).not.toHaveBeenCalled();
    });

    it("opted-out customer falls back to public reply", async () => {
      fake.tables.customers = [
        {
          id: "cust_opted_out",
          businessId: "biz-1",
          channelId: "chan-1",
          handleOrPhone: "user_opted_out",
          optedOut: true,
        },
      ];
      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price",
          keywords: ["price"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "both",
          publicReplyText: "Hi {customerHandle}!",
          dmText: "DM details",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c_opt",
          businessId: "biz-1",
          metaCommentId: "cmt_opt",
          mediaId: "m1",
          commenterIgId: "user_opted_out",
          text: "price?",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await processIgCommentJob({ commentId: "c_opt", businessId: "biz-1" });

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("replied_public");
      expect(metaInstagram.replyToComment).toHaveBeenCalled();
      expect(metaInstagram.sendPrivateReply).not.toHaveBeenCalled();
    });

    it("marks comment failed when Meta send throws", async () => {
      metaInstagram.replyToComment.mockRejectedValueOnce(new Error("Meta API 500 error"));

      fake.tables.ig_comment_rules = [
        {
          id: "r1",
          businessId: "biz-1",
          name: "Price",
          keywords: ["price"],
          categories: ["price"],
          mediaIds: [],
          replyMode: "public",
          publicReplyText: "Hi",
          isActive: true,
          priority: 10,
        },
      ];
      fake.tables.ig_comments = [
        {
          id: "c_fail",
          businessId: "biz-1",
          metaCommentId: "cmt_fail",
          mediaId: "m1",
          commenterIgId: "user_fail",
          text: "price?",
          action: "pending",
          commentedAt: new Date(),
        },
      ];

      await expect(processIgCommentJob({ commentId: "c_fail", businessId: "biz-1" })).rejects.toThrow("Meta API 500 error");

      const c = fake.rows("ig_comments")[0];
      expect(c.action).toBe("failed");
      expect(c.error).toContain("Meta API 500 error");
    });
  });

  describe("Manual Reply & Dismiss", () => {
    it("POST /ig/comments/:id/reply sends manual reply", async () => {
      fake.tables.ig_comments = [
        {
          id: "c_manual",
          businessId: "biz-1",
          metaCommentId: "cmt_manual",
          mediaId: "m1",
          commenterIgId: "user_man",
          commenterUsername: "user_man",
          text: "Can I buy this?",
          action: "needs_attention",
          commentedAt: new Date(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: "/ig/comments/c_manual/reply",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          mode: "both",
          publicText: "Sent you details in DM!",
          dmText: "Hi, yes it is available! What size do you prefer?",
        },
      });

      expect(res.statusCode).toBe(200);
      const c = res.json().comment;
      expect(c.action).toBe("replied_both");
      expect(c.handledByUserId).toBe("admin-1");
      expect(metaInstagram.replyToComment).toHaveBeenCalled();
      expect(metaInstagram.sendPrivateReply).toHaveBeenCalled();
    });

    it("POST /ig/comments/:id/dismiss dismisses comment", async () => {
      fake.tables.ig_comments = [
        {
          id: "c_dismiss",
          businessId: "biz-1",
          metaCommentId: "cmt_dismiss",
          mediaId: "m1",
          commenterIgId: "user_dis",
          text: "test",
          action: "needs_attention",
          commentedAt: new Date(),
        },
      ];

      const res = await app.inject({
        method: "POST",
        url: "/ig/comments/c_dismiss/dismiss",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const c = res.json().comment;
      expect(c.action).toBe("skipped");
      expect(c.skipReason).toBe("dismissed");
    });
  });

  describe("Simulate Comment", () => {
    it("POST /simulate/ig-comment creates and queues comment in demo mode", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/simulate/ig-comment",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: "tester_resin",
          text: "price pls?",
          mediaId: "media_reel_1",
        },
      });

      expect(res.statusCode).toBe(202);
      expect(res.json().ok).toBe(true);
      const comment = res.json().comment;
      expect(comment.commenterUsername).toBe("tester_resin");
      expect(comment.mediaId).toBe("media_reel_1");
      expect(rt.emitIgCommentNew).toHaveBeenCalled();
      expect(enqueueIgMock.enqueueProcessIgComment).toHaveBeenCalled();
    });
  });
});
