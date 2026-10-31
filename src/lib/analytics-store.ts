import type { VisitorContext } from "@/lib/visitor-context";
import { integrationDatabase, IntegrationStoreError } from "@/lib/integration-store";
import {
  cleanAnalyticsPath,
  cleanCampaign,
  cleanReferrer,
  type AnalyticsEvent,
  type AnalyticsReport,
  type CapturedLead,
  type ContactRequest,
} from "@/lib/analytics";
import { billingSummary } from "@/lib/billing-store";
import { billingPlanIncludesFeature } from "@/lib/billing-plans";

export async function requireAnalyticsOwner(soulId: string, ownerId: string) {
  const rows =
    await integrationDatabase()`select soul_id from obseri_published_souls where soul_id = ${soulId} and owner_user_id = ${ownerId}`;
  if (!rows.length)
    throw new IntegrationStoreError(
      "Publish this website to start collecting visitor activity.",
      404,
    );
}

export async function recordAnalytics(
  soulId: string,
  sessionId: string,
  events: AnalyticsEvent[],
  context?: VisitorContext,
) {
  const sql = integrationDatabase();
  const rows = events.map((event) => ({
    soul_id: soulId,
    event_id: event.id,
    session_id: sessionId,
    name: event.name,
    path: cleanAnalyticsPath(event.path),
    referrer: cleanReferrer(event.referrer),
    source: cleanCampaign(event.source),
    campaign: cleanCampaign(event.campaign),
    country_code: context?.country ?? null,
    device_type: context?.device ?? null,
    browser_name: context?.browser ?? null,
  }));
  await sql`insert into obseri_analytics_events ${sql(rows)} on conflict (soul_id, event_id) do nothing`;
}

export async function captureLead(soulId: string, input: ContactRequest) {
  const sql = integrationDatabase();
  const published = await sql<
    { owner_user_id: string; webhook_enabled: boolean; webhook_url: string | null }[]
  >`
    select owner_user_id, webhook_enabled, webhook_url from obseri_published_souls where soul_id = ${soulId} and widget_enabled = true
  `;
  if (!published[0]) throw new IntegrationStoreError("This website is unavailable.", 404);
  const plan = await billingSummary(published[0].owner_user_id);
  return sql.begin(async (tx) => {
    const inserted = await tx`
      insert into obseri_leads (id, soul_id, conversation_id, session_id, name, email, message, path)
      values (${input.id}, ${soulId}, ${input.conversationId}, ${input.sessionId ?? null}, ${input.name}, ${input.email.toLowerCase()}, ${input.message}, ${cleanAnalyticsPath(input.path)})
      on conflict (soul_id, conversation_id) do nothing returning id
    `;
    if (!inserted.length) return null;
    if (
      !published[0].webhook_enabled ||
      !published[0].webhook_url ||
      !billingPlanIncludesFeature(plan.plan.id, "webhooks")
    )
      return null;
    const event = {
      id: `evt_lead_${input.id}`,
      type: "lead.captured",
      soulId,
      createdAt: new Date().toISOString(),
      data: { ...input, path: cleanAnalyticsPath(input.path), email: input.email.toLowerCase() },
    };
    await tx`
      insert into obseri_webhook_deliveries (event_id, soul_id, event, status, attempt_count, next_attempt_at)
      values (${event.id}, ${soulId}, ${tx.json(event)}, 'pending', 0, now()) on conflict (event_id) do nothing
    `;
    return event.id;
  });
}

export async function updateLeadStatus(
  soulId: string,
  id: string,
  status: CapturedLead["status"],
  actor?: { id: string; actorUserId: string; email?: string | null },
) {
  const sql = integrationDatabase();
  await sql.begin(async (tx) => {
    const existing =
      await tx`select status from obseri_leads where soul_id = ${soulId} and id = ${id} for update`;
    if (!existing.length) throw new IntegrationStoreError("Contact request not found.", 404);
    if (existing[0].status === status) return;
    await tx`update obseri_leads set status = ${status} where soul_id = ${soulId} and id = ${id}`;
    if (actor)
      await tx`insert into obseri_team_activity (owner_user_id, actor_user_id, actor_email, action, changes)
      values (${actor.id}, ${actor.actorUserId}, ${actor.email || ""}, 'lead.status', ${tx.json([{ section: "conversations", field: "Lead status", soulId, leadId: id, operation: `${existing[0].status} → ${status}` }])}::jsonb)`;
  });
}

/** Conversion data has a fixed 30-day pilot retention window, independent of chat history. */
export async function pruneConversionData() {
  const sql = integrationDatabase();
  await sql`delete from obseri_analytics_events where created_at < now() - interval '30 days'`;
  await sql`delete from obseri_leads where created_at < now() - interval '30 days'`;
}

export async function analyticsReport(soulId: string, days: number): Promise<AnalyticsReport> {
  const sql = integrationDatabase();
  const today = new Date();
  const since = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + 1),
  );
  const [totals, leadTotals, sources, pages, journeys, leads, daily, audience] = await Promise.all([
    sql`select count(distinct session_id)::int as sessions, count(*) filter (where name = 'page_view')::int as views,
      count(distinct session_id) filter (where name = 'conversation_started')::int as engaged
      from obseri_analytics_events where soul_id = ${soulId} and created_at >= ${since}`,
    sql`select count(*)::int as contacts, count(*) filter (where status in ('qualified', 'won'))::int as qualified,
      count(*) filter (where status = 'won')::int as won,
      count(distinct session_id) filter (where exists (select 1 from obseri_analytics_events e where e.soul_id = ${soulId} and e.session_id = obseri_leads.session_id and e.name = 'conversation_started' and e.created_at >= ${since}))::int as assisted
      from obseri_leads where soul_id = ${soulId} and created_at >= ${since}`,
    sql`with first_touch as (
      select distinct on (session_id) session_id, coalesce(nullif(source, ''), nullif(referrer, ''), 'Direct') as source
      from obseri_analytics_events where soul_id = ${soulId} and created_at >= ${since} order by session_id, created_at, event_id
    ) select f.source, count(*)::int as sessions,
      count(*) filter (where exists (select 1 from obseri_leads l where l.soul_id = ${soulId} and l.session_id = f.session_id and l.created_at >= ${since}))::int as contacts
      from first_touch f group by f.source order by sessions desc, contacts desc, f.source limit 50`,
    sql`select path, count(*)::int as views from obseri_analytics_events
      where soul_id = ${soulId} and created_at >= ${since} and name = 'page_view' group by path order by views desc, path limit 50`,
    sql`with recent as (
      select session_id, min(created_at) as started_at from obseri_analytics_events
      where soul_id = ${soulId} and created_at >= ${since} group by session_id order by max(created_at) desc limit 30
    ) select r.session_id, r.started_at,
      (select e.country_code from obseri_analytics_events e where e.soul_id = ${soulId} and e.session_id = r.session_id and e.created_at >= ${since} and e.country_code is not null order by e.created_at, e.event_id limit 1) as country,
      (select e.device_type from obseri_analytics_events e where e.soul_id = ${soulId} and e.session_id = r.session_id and e.created_at >= ${since} and e.device_type is not null order by e.created_at, e.event_id limit 1) as device,
      (select e.browser_name from obseri_analytics_events e where e.soul_id = ${soulId} and e.session_id = r.session_id and e.created_at >= ${since} and e.browser_name is not null order by e.created_at, e.event_id limit 1) as browser,
      (select coalesce(nullif(e.source, ''), nullif(e.referrer, ''), 'Direct') from obseri_analytics_events e where e.soul_id = ${soulId} and e.session_id = r.session_id and e.created_at >= ${since} order by e.created_at, e.event_id limit 1) as source,
      (select json_agg(t) from (select name, path, created_at as "createdAt" from obseri_analytics_events where soul_id = ${soulId} and session_id = r.session_id and created_at >= ${since} order by created_at limit 40) t) as events
      from recent r order by r.started_at desc`,
    sql`select * from obseri_leads where soul_id = ${soulId} and created_at >= ${since} order by created_at desc limit 100`,
    sql`with dates as (
      select generate_series((${since}::timestamptz at time zone 'UTC')::date, (now() at time zone 'UTC')::date, '1 day'::interval)::date as day
    ), activity as (
      select (created_at at time zone 'UTC')::date as day, count(distinct session_id)::int as sessions,
        count(*) filter (where name = 'page_view')::int as views
      from obseri_analytics_events where soul_id = ${soulId} and created_at >= ${since} group by 1
    ) select to_char(d.day, 'YYYY-MM-DD') as date, coalesce(a.sessions, 0)::int as sessions, coalesce(a.views, 0)::int as views
      from dates d left join activity a on a.day = d.day order by d.day`,
    sql`with sessions as (
      select session_id,
        (array_agg(country_code order by created_at, event_id) filter (where country_code is not null))[1] as country,
        coalesce((array_agg(device_type order by created_at, event_id) filter (where device_type is not null))[1], 'Unknown') as device,
        coalesce((array_agg(browser_name order by created_at, event_id) filter (where browser_name is not null))[1], 'Unknown') as browser
      from obseri_analytics_events where soul_id = ${soulId} and created_at >= ${since} group by session_id
    ) select 'country' as dimension, country as name, count(*)::int as sessions,
        count(*) filter (where exists (select 1 from obseri_leads l where l.soul_id = ${soulId} and l.session_id = s.session_id and l.created_at >= ${since}))::int as contacts
      from sessions s group by country
      union all select 'device', device, count(*)::int, 0 from sessions group by device
      union all select 'browser', browser, count(*)::int, 0 from sessions group by browser`,
  ]);
  return {
    days,
    totals: {
      sessions: Number(totals[0].sessions),
      pageViews: Number(totals[0].views),
      engaged: Number(totals[0].engaged),
      assisted: Number(leadTotals[0].assisted),
      contacts: Number(leadTotals[0].contacts),
      qualified: Number(leadTotals[0].qualified),
      won: Number(leadTotals[0].won),
    },
    sources: sources.map((r) => ({
      source: r.source,
      sessions: Number(r.sessions),
      contacts: Number(r.contacts),
    })),
    pages: pages.map((r) => ({ path: r.path, views: Number(r.views) })),
    daily: daily.map((r) => ({
      date: r.date,
      sessions: Number(r.sessions),
      views: Number(r.views),
    })),
    countries: audience
      .filter((r) => r.dimension === "country")
      .map((r) => ({ country: r.name, sessions: Number(r.sessions), contacts: Number(r.contacts) }))
      .sort((a, b) => b.sessions - a.sessions),
    devices: audience
      .filter((r) => r.dimension === "device")
      .map((r) => ({ name: r.name, sessions: Number(r.sessions) }))
      .sort((a, b) => b.sessions - a.sessions),
    browsers: audience
      .filter((r) => r.dimension === "browser")
      .map((r) => ({ name: r.name, sessions: Number(r.sessions) }))
      .sort((a, b) => b.sessions - a.sessions),
    journeys: journeys.map((r) => ({
      sessionId: r.session_id,
      country: r.country ?? null,
      device: r.device ?? "Unknown",
      browser: r.browser ?? "Unknown",
      source: r.source,
      startedAt: new Date(r.started_at).toISOString(),
      events: r.events ?? [],
    })),
    leads: leads.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      sessionId: r.session_id ?? undefined,
      name: r.name,
      email: r.email,
      message: r.message,
      path: r.path,
      consent: true,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
