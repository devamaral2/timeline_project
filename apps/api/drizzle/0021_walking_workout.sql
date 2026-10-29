INSERT INTO "workout" ("code", "name", "category") VALUES
  ('walking', 'Caminhada', 'cardio')
ON CONFLICT ("code") DO NOTHING;
