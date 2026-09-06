CREATE TABLE "plan_dependencies" (
	"plan_id" char(26) NOT NULL,
	"depends_on_plan_id" char(26) NOT NULL,
	CONSTRAINT "plan_dependencies_plan_id_depends_on_plan_id_pk" PRIMARY KEY("plan_id","depends_on_plan_id"),
	CONSTRAINT "plan_dependencies_no_self_reference" CHECK ("plan_dependencies"."plan_id" <> "plan_dependencies"."depends_on_plan_id")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" char(26) NOT NULL,
	"depends_on_task_id" char(26) NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "task_dependencies_no_self_reference" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_depends_on_plan_id_plans_id_fk" FOREIGN KEY ("depends_on_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_dependencies_reverse_idx" ON "plan_dependencies" USING btree ("depends_on_plan_id","plan_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_reverse_idx" ON "task_dependencies" USING btree ("depends_on_task_id","task_id");