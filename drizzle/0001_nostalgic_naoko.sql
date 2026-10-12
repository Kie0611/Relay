CREATE TYPE "public"."delivery_run_type" AS ENUM('initial', 'manual_replay');--> statement-breakpoint
CREATE TABLE "delivery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"run_number" integer DEFAULT 1 NOT NULL,
	"run_type" "delivery_run_type" DEFAULT 'initial' NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_run_sequence_unique" UNIQUE("delivery_id","run_number"),
	CONSTRAINT "run_number_positive" CHECK ("delivery_runs"."run_number" >= 1),
	CONSTRAINT "run_attempt_nonnegative" CHECK ("delivery_runs"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" DROP CONSTRAINT "attempt_unique";--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "attempt_nonnegative";--> statement-breakpoint
ALTER TABLE "delivery_attempts" DROP CONSTRAINT "delivery_attempts_delivery_id_deliveries_id_fk";
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD COLUMN "delivery_run_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_delivery_run_id_delivery_runs_id_fk" FOREIGN KEY ("delivery_run_id") REFERENCES "public"."delivery_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "attempt_count";--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "next_attempt_at";--> statement-breakpoint
ALTER TABLE "deliveries" DROP COLUMN "delivered_at";--> statement-breakpoint
ALTER TABLE "delivery_attempts" DROP COLUMN "delivery_id";--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "attempt_unique" UNIQUE("delivery_run_id","attempt_number");