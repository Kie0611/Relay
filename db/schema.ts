import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar, boolean, pgEnum, unique, jsonb, integer, check } from "drizzle-orm/pg-core";

export const eventTypeEnum = pgEnum("event_type", [
  "user.created",
  "user.updated",
  "user.deleted"
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "processing",
  "retrying",
  "delivered",
  "failed",
  "dead_lettered",
  "cancelled",
]);

export const deliveryRunTypeEnum = pgEnum("delivery_run_type", [
  "initial",
  "manual_replay",
]);

export const dispatchOutboxStatusEnum = pgEnum("dispatch_outbox_status", [
  "pending",
  "published",
]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .notNull()
    .defaultNow()
});

export const endpoints = pgTable("endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  signingSecret: text("signing_secret").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
})

export const endpointSubscriptions = pgTable("endpoint_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: uuid("endpoint_id").references(() => endpoints.id).notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  },
  (table) => [
    unique("endpoint_event_type_unique").on(
      table.endpointId,
      table.eventType
    ),
  ],
);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  type: eventTypeEnum("type").notNull(),
  payload: jsonb("payload").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  }, 
  (table) => [
    unique("event_unique").on(
      table.projectId,
      table.idempotencyKey
    ),
  ],
);

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => events.id).notNull(),
  endpointId: uuid("endpoint_id").references(() => endpoints.id).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
  },  
  (table) => [
    unique("delivery_unique").on(
      table.eventId,
      table.endpointId,
    ),
  ],
);

export const deliveryRuns = pgTable("delivery_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id").references(() => deliveries.id).notNull(),
  runNumber: integer("run_number").default(1).notNull(),
  runType: deliveryRunTypeEnum("run_type").default("initial").notNull(),
  status: deliveryStatusEnum("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", {
    withTimezone: true
  }),
  leaseOwner: varchar("lease_owner", { length: 128 }),
  leaseExpiresAt: timestamp("lease_expires_at", {
    withTimezone: true
  }),
  deliveredAt: timestamp("delivered_at", {
    withTimezone: true
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
  },
  (table) => [
    check("run_number_positive", sql`${table.runNumber} >= 1`),
    check("run_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
    unique("delivery_run_sequence_unique").on(
      table.deliveryId,
      table.runNumber,
    ),
  ],
);

export const deliveryDispatchOutbox = pgTable("delivery_dispatch_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryRunId: uuid("delivery_run_id")
    .references(() => deliveryRuns.id, { onDelete: "cascade" })
    .notNull(),
  status: dispatchOutboxStatusEnum("status").default("pending").notNull(),
  availableAt: timestamp("available_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  publishedAt: timestamp("published_at", {
    withTimezone: true
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
}, (table) => [
  unique("delivery_dispatch_outbox_run_unique").on(table.deliveryRunId),
]);

export const deliveryAttempts = pgTable("delivery_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryRunId: uuid("delivery_run_id").references(() => deliveryRuns.id).notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  responseStatus: integer("response_status"),
  errorCode: varchar("error_code"),
  startedAt: timestamp("started_at", {
    withTimezone: true
  })
    .notNull(),
  completedAt: timestamp("completed_at", {
    withTimezone: true
  }),
  durationMs: integer("duration_ms"),
  }, 
  (table) => [
    check("attempt_number_positive", sql`${table.attemptNumber} >= 1`),
    check("duration_nonnegative", sql`${table.durationMs} >= 0`),
    unique("attempt_unique").on(
      table.deliveryRunId,
      table.attemptNumber,
    ),
  ],
);
