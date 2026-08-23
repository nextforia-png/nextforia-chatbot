begin;

-- A database rollback must never destroy captured intelligence. Code may roll
-- back while these additive tables remain. Dropping is allowed only before any
-- real conversation or business object has been written.
do $$
begin
  if exists (select 1 from public.conversation_business_objects limit 1)
    or exists (select 1 from public.conversation_intelligence limit 1) then
    raise exception 'conversation_intelligence_v1 rollback blocked: export or preserve existing rows first';
  end if;
end;
$$;

drop function if exists public.list_conversation_intelligence_summaries_v1(text, integer, timestamptz, uuid);
drop function if exists public.upsert_conversation_business_object_v1(jsonb);
drop function if exists public.upsert_conversation_intelligence_v1(jsonb);
drop function if exists public.conversation_value_transition_allowed_v1(text, text);
drop table if exists public.conversation_business_objects;
drop table if exists public.conversation_intelligence;

commit;
