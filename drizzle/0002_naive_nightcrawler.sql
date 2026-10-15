CREATE TYPE "public"."dispatch_outbox_status" AS ENUM('pending', 'published');--> statement-breakpoint
CREATE TABLE "delivery_dispatch_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_run_id" uuid NOT NULL,
	"status" "dispatch_outbox_status" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_dispatch_outbox_run_unique" UNIQUE("delivery_run_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD COLUMN "lease_owner" varchar(128);--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_dispatch_outbox" ADD CONSTRAINT "delivery_dispatch_outbox_delivery_run_id_delivery_runs_id_fk" FOREIGN KEY ("delivery_run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE cascade ON UPDATE no action;