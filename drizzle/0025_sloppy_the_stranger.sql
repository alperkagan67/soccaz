CREATE TABLE "queue_participants" (
	"queue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_participants_queue_id_user_id_pk" PRIMARY KEY("queue_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "queue_participants" ADD CONSTRAINT "queue_participants_queue_id_matchmaking_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."matchmaking_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_participants" ADD CONSTRAINT "queue_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;