ALTER TABLE "integration" ADD COLUMN "workspace_id" text;
ALTER TABLE "integration" ADD CONSTRAINT "integration_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;
CREATE INDEX "integration_workspaceId_idx" ON "integration" USING btree ("workspace_id");

ALTER TABLE "integration" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "integration" DROP CONSTRAINT IF EXISTS "integration_project_type_unique";
DROP INDEX IF EXISTS "integration_project_type_unique";
CREATE UNIQUE INDEX "integration_project_type_unique_non_github" ON "integration" USING btree ("project_id","type") WHERE "integration"."type" <> 'github';
