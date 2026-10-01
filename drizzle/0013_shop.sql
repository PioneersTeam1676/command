CREATE TABLE "shop_item_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shop_item_sizes_stock_chk" CHECK ("shop_item_sizes"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"photo_path" text,
	"personalize" text DEFAULT 'none' NOT NULL,
	"personalize_label" text DEFAULT 'Name to print' NOT NULL,
	"personalize_max" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_items_price_chk" CHECK ("shop_items"."price_cents" between 0 and 100000000),
	CONSTRAINT "shop_items_max_chk" CHECK ("shop_items"."personalize_max" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "shop_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid,
	"size_id" uuid,
	"item_name" text NOT NULL,
	"size_label" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"qty" integer NOT NULL,
	"print_text" text,
	CONSTRAINT "shop_order_lines_qty_chk" CHECK ("shop_order_lines"."qty" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_cents" integer NOT NULL,
	"pay_by_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "shop_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "shop_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "shop_note" text;--> statement-breakpoint
ALTER TABLE "shop_item_sizes" ADD CONSTRAINT "shop_item_sizes_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_lines" ADD CONSTRAINT "shop_order_lines_size_id_shop_item_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."shop_item_sizes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_item_sizes_label_idx" ON "shop_item_sizes" USING btree ("item_id","label");--> statement-breakpoint
CREATE INDEX "shop_order_lines_order_idx" ON "shop_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shop_orders_user_idx" ON "shop_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shop_orders_status_idx" ON "shop_orders" USING btree ("status","created_at");