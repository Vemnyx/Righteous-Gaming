-- Run against production Postgres to see why the API may not start (migrations run on boot).
-- Example: psql "$DATABASE_URL" -f scripts/diagnose-db-state.sql

\echo '=== schema_migrations (dirty = migrate stuck; version = last applied) ==='
SELECT version, dirty FROM schema_migrations;

\echo '=== heroes ==='
SELECT COUNT(*) AS heroes_count FROM heroes;

\echo '=== hero cards in catalog ==='
SELECT COUNT(*) AS hero_type_cards FROM cards WHERE type = 8;

\echo '=== decks columns ==='
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'decks'
  AND column_name IN ('hero', 'hero_id')
ORDER BY column_name;

\echo '=== decks with null hero_id ==='
SELECT COUNT(*) AS decks_null_hero_id FROM decks WHERE hero_id IS NULL;
