-- Read-only projections used by Nextfor to avoid downloading append-only
-- configuration history on every panel refresh. No customer row is changed.

create or replace function public.platform_latest_conversation_tool_states_v1(
  p_tool text,
  p_tenant_id text default null
)
returns table (
  id bigint,
  ts timestamptz,
  tenant_id text,
  user_id text,
  bot_reply text,
  tools jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  if nullif(btrim(p_tool), '') is null then
    return;
  end if;
  return query
  select distinct on (c.tenant_id, c.user_id)
    c.id, c.ts, c.tenant_id, c.user_id, c.bot_reply, c.tools
  from public.conversation_logs c
  where coalesce(c.tools, '[]'::jsonb) @> jsonb_build_array(btrim(p_tool))
    and (nullif(btrim(p_tenant_id), '') is null or c.tenant_id = lower(btrim(p_tenant_id)))
  order by c.tenant_id, c.user_id, c.ts desc, c.id desc;
end;
$$;

create or replace function public.platform_customer_panel_recent_turns_v1(
  p_tenant_id text,
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  row_kind text,
  id bigint,
  ts timestamptz,
  tenant_id text,
  phone_number_id text,
  channel text,
  user_id text,
  user_message text,
  bot_reply text,
  tools jsonb,
  zero_result_queries jsonb,
  handoff boolean,
  rating numeric,
  num_tools integer,
  status text,
  eval jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant_id text := lower(btrim(coalesce(p_tenant_id, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 201));
begin
  perform public.platform_require_service_role_v2();
  if v_tenant_id = '' then
    return;
  end if;

  return query
  with operational as (
    select
      'turn'::text as row_kind,
      c.id, c.ts, c.tenant_id, c.phone_number_id, c.channel, c.user_id,
      c.user_message, c.bot_reply, c.tools, c.zero_result_queries, c.handoff,
      c.rating, c.num_tools, c.status, c.eval
    from public.conversation_logs c
    where c.tenant_id = v_tenant_id
      and (p_before is null or c.ts < p_before)
      and not (coalesce(c.tools, '[]'::jsonb) ?| array[
        'admin_customer_meta',
        'customer_memory_v1',
        'instagram_customer_profile_v1',
        'dashboard_customer_user_v1',
        'super_admin_access_v1',
        'tenant_bot_setup_v1',
        'tenant_client_onboarding_v1',
        'customer_setup_questionnaire_v1',
        'super_admin_legacy_client_visibility_v1',
        'retargeting_event_v1',
        'tenant_channel_connection_state_v1',
        'shopify_session_state_v1',
        'nextfor_signature',
        'appointment_calendar_connection_state_v1'
      ])
      and coalesce(c.bot_reply, '') !~ '^\[(ShopifySessionState|ChannelConnectionState|AppointmentCalendarConnectionState|NextforSignature|CustomerMemory|ClientOnboarding|CustomerSetupQuestionnaire|DashboardUser|SuperAdminAccess|RetargetingEvent|PublicCustomerAccess|InstagramProfile|LegacyClientVisibility|BotSetup|Meta|DeliveryFailure)\]\s*'
    order by c.ts desc, c.id desc
    limit v_limit
  ), context_ranked as (
    select
      'context'::text as row_kind,
      c.id, c.ts, c.tenant_id, c.phone_number_id, c.channel, c.user_id,
      c.user_message, c.bot_reply, c.tools, c.zero_result_queries, c.handoff,
      c.rating, c.num_tools, c.status, c.eval,
      row_number() over (
        partition by c.user_id,
          case
            when c.tools @> '["admin_customer_meta"]'::jsonb then 'meta'
            when c.tools @> '["customer_memory_v1"]'::jsonb then 'memory'
            else 'instagram_profile'
          end
        order by c.ts desc, c.id desc
      ) as state_rank
    from public.conversation_logs c
    where p_before is null
      and c.tenant_id = v_tenant_id
      and coalesce(c.tools, '[]'::jsonb) ?| array[
        'admin_customer_meta', 'customer_memory_v1', 'instagram_customer_profile_v1'
      ]
  )
  select o.row_kind, o.id, o.ts, o.tenant_id, o.phone_number_id, o.channel,
    o.user_id, o.user_message, o.bot_reply, o.tools, o.zero_result_queries,
    o.handoff, o.rating, o.num_tools, o.status, o.eval
  from operational o
  union all
  select c.row_kind, c.id, c.ts, c.tenant_id, c.phone_number_id, c.channel,
    c.user_id, c.user_message, c.bot_reply, c.tools, c.zero_result_queries,
    c.handoff, c.rating, c.num_tools, c.status, c.eval
  from context_ranked c
  where c.state_rank = 1
  order by 3 desc, 2 desc;
end;
$$;

revoke all on function public.platform_latest_conversation_tool_states_v1(text, text) from public, anon, authenticated;
revoke all on function public.platform_customer_panel_recent_turns_v1(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_latest_conversation_tool_states_v1(text, text) to service_role;
grant execute on function public.platform_customer_panel_recent_turns_v1(text, integer, timestamptz) to service_role;
