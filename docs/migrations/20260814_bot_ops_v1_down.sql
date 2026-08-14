begin;

drop function if exists public.complete_bot_ops_review_v1(uuid, bigint, text, jsonb, jsonb);
drop function if exists public.upsert_bot_ops_finding_v1(jsonb);
drop function if exists public.claim_bot_ops_review_v1(text, text, text, integer);
drop function if exists public.bot_ops_storage_ready_v1();
drop table if exists public.bot_ops_finding_occurrences;
drop table if exists public.bot_ops_findings;
drop table if exists public.bot_ops_state;
drop table if exists public.bot_ops_runs;
drop table if exists public.bot_ops_events;

commit;
