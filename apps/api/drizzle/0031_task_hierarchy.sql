-- Keep existing links intact. Stop with a diagnostic if legacy data violates the hierarchy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM task_relation WHERE relation_type = 'subtask' GROUP BY target_task_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Task hierarchy migration stopped: some tasks have multiple parents. Review task_relation before retrying.';
  END IF;
  IF EXISTS (SELECT 1 FROM task_relation r JOIN task p ON p.id = r.source_task_id JOIN task c ON c.id = r.target_task_id WHERE r.relation_type = 'subtask' AND p.project_id <> c.project_id) THEN
    RAISE EXCEPTION 'Task hierarchy migration stopped: parent and child tasks belong to different projects. Review task_relation before retrying.';
  END IF;
  IF EXISTS (
    WITH RECURSIVE paths AS (
      SELECT source_task_id AS ancestor, target_task_id AS descendant FROM task_relation WHERE relation_type = 'subtask'
      UNION
      SELECT p.ancestor, r.target_task_id FROM paths p JOIN task_relation r ON r.source_task_id = p.descendant WHERE r.relation_type = 'subtask'
    ) SELECT 1 FROM paths WHERE ancestor = descendant
  ) THEN
    RAISE EXCEPTION 'Task hierarchy migration stopped: a cycle exists. Review task_relation before retrying.';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "task_relation_single_parent_idx" ON "task_relation" USING btree ("target_task_id") WHERE "task_relation"."relation_type" = 'subtask';
