import { useEffect, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CountryMap } from "@/components/CountryMap";
import { countryName, countryFlag } from "@/lib/country";
import { authFetch } from "@/lib/auth-client";
import { conversionRate, type AnalyticsReport, type CapturedLead } from "@/lib/analytics";
import { relativeTime } from "@/lib/conversation-insights";

const eventLabels: Record<string, string> = {
  page_view: "Viewed",
  widget_opened: "Opened assistant",
  conversation_started: "Started conversation",
  help_shown: "Offered help",
  help_clicked: "Accepted help",
};
const panel = "rounded-2xl border border-neutral-200 bg-white";

export default function ConversionDashboard({
  soulId,
  onInstall,
}: {
  soulId: string;
  onInstall: () => void;
}) {
  const [tab, setTab] = useState("traffic");
  const [countrySearch, setCountrySearch] = useState("");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);
    setSelected(null);
    authFetch(`/api/souls/${encodeURIComponent(soulId)}/analytics?days=${days}`, {
      signal: abort.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Could not load analytics.");
        return body as AnalyticsReport;
      })
      .then(setReport)
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load analytics.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [soulId, days, revision]);

  async function changeStatus(id: string, status: CapturedLead["status"]) {
    setUpdating(id);
    setError("");
    try {
      const response = await authFetch(`/api/souls/${encodeURIComponent(soulId)}/leads`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error("Could not update the outcome. Please try again.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setUpdating(null);
    }
  }

  function exportLeads() {
    if (!report) return;
    const cell = (value: string) =>
      `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = [
      ["Received", "Name", "Email", "Request", "Page", "Outcome"],
      ...report.leads.map((lead) => [
        lead.createdAt,
        lead.name,
        lead.email,
        lead.message,
        lead.path,
        lead.status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "obseri-contact-requests.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totals = report?.totals;
  const journey =
    report?.journeys.find((item) => item.sessionId === selected) ?? report?.journeys[0];
  const funnel = totals
    ? [
        {
          label: "Visited your website",
          count: totals.sessions,
          detail: "Tracked browsing sessions",
        },
        {
          label: "Started a conversation",
          count: totals.engaged,
          detail: "Sessions with a visitor message",
        },
        {
          label: "Shared contact details",
          count: totals.assisted,
          detail: "Conversing sessions with a submitted request",
        },
      ]
    : [];

  return (
    <div className="min-h-full bg-[#fafafa] px-4 py-6 text-[#242424] sm:px-8">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Website analytics</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Understand your traffic and turn visits into enquiries.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Reporting period"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button
              aria-label="Refresh analytics"
              onClick={() => setRevision((v) => v + 1)}
              className="rounded-lg border bg-white p-2.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            <button onClick={onInstall} className="ml-3 underline">
              Check installation
            </button>
          </div>
        )}
        {loading && !report && (
          <div
            role="status"
            className={`${panel} flex items-center gap-3 p-10 text-sm text-neutral-500`}
          >
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading website activity…
          </div>
        )}
        {totals && report && (
          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
            <TabsList
              aria-label="Analytics views"
              className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0 pb-2"
            >
              {["traffic", "audience", "conversions", "journeys"].map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="shrink-0 rounded-lg px-3 py-2.5 text-xs text-neutral-500 capitalize sm:px-4 sm:text-sm data-[state=active]:bg-neutral-900 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {value}
                </TabsTrigger>
              ))}
            </TabsList>
            {!totals.sessions && !totals.contacts && (
              <div className={`${panel} flex flex-wrap items-center justify-between gap-4 p-6`}>
                <div>
                  <h2 className="font-semibold">Waiting for your first visit</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Install your published assistant to start collecting real website activity.
                  </p>
                </div>
                <button
                  onClick={onInstall}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
                >
                  Check installation
                </button>
              </div>
            )}
            <TabsContent value="traffic" className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Metric label="Sessions" value={totals.sessions.toLocaleString()} />
                <Metric label="Page views" value={totals.pageViews.toLocaleString()} />
                <Metric
                  label="Views per session"
                  value={totals.sessions ? (totals.pageViews / totals.sessions).toFixed(1) : "—"}
                />
              </div>
              <section className={`${panel} p-5`}>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Traffic over time</h2>
                  <span className="text-xs text-neutral-500">Daily sessions · UTC</span>
                </div>
                <div
                  className="h-60 w-full"
                  role="img"
                  aria-label={`Daily traffic for the last ${days} days. ${totals.sessions} sessions in total.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={report.daily || []}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="#eeeeee" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) =>
                          new Date(date + "T00:00:00Z").toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })
                        }
                        tickLine={false}
                        axisLine={false}
                        minTickGap={36}
                        tick={{ fontSize: 11, fill: "#737373" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "#737373" }}
                      />
                      <Tooltip labelFormatter={(date) => String(date)} />
                      <Area
                        name="Sessions"
                        type="monotone"
                        dataKey="sessions"
                        stroke="#ff557c"
                        fill="#fff0f4"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <div className="grid gap-5 lg:grid-cols-2">
                <Breakdown
                  title="Traffic sources"
                  label="Source"
                  rows={report.sources.map((row) => ({ name: row.source, count: row.sessions }))}
                  total={totals.sessions}
                  note="First source observed per session · top 50"
                />
                <Breakdown
                  title="Top pages"
                  label="Page"
                  rows={report.pages.map((row) => ({ name: row.path, count: row.views }))}
                  total={totals.pageViews}
                  note="Page views · top 50"
                />
              </div>
            </TabsContent>
            <TabsContent value="audience" className="space-y-5">
              <section className={`${panel} overflow-hidden`}>
                <div className="border-b p-5">
                  <h2 className="font-semibold">Where visitors come from</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Approximate country at the first known location in each session. Older or
                    unavailable locations appear as Unknown.
                  </p>
                </div>
                <div className="grid lg:grid-cols-[1.2fr_1fr]">
                  <div className="flex min-w-0 flex-col justify-center p-5">
                    <CountryMap
                      countries={report.countries || []}
                      onSelect={(code) => setCountrySearch(countryName(code))}
                    />
                    <p className="mt-3 text-center text-xs text-neutral-400">
                      Select a country to filter the list
                    </p>
                  </div>
                  <div className="min-w-0 border-t p-5 lg:border-l lg:border-t-0">
                    <input
                      aria-label="Search countries"
                      placeholder="Search countries…"
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-neutral-500">
                          <tr>
                            <th className="pb-3 font-normal">Country</th>
                            <th className="pb-3 text-right font-normal">Sessions</th>
                            <th className="pb-3 text-right font-normal">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report.countries || [])
                            .filter((row) =>
                              countryName(row.country)
                                .toLowerCase()
                                .includes(countrySearch.toLowerCase()),
                            )
                            .map((row) => (
                              <tr
                                key={row.country || "unknown"}
                                className="border-t border-neutral-100"
                              >
                                <td className="py-3">
                                  <span className="mr-2" aria-hidden="true">
                                    {countryFlag(row.country) || "◌"}
                                  </span>
                                  {countryName(row.country)}
                                </td>
                                <td className="text-right tabular-nums">{row.sessions}</td>
                                <td className="text-right tabular-nums text-neutral-500">
                                  {conversionRate(row.sessions, totals.sessions)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!(report.countries || []).some((row) =>
                        countryName(row.country)
                          .toLowerCase()
                          .includes(countrySearch.toLowerCase()),
                      ) && (
                        <p className="py-8 text-center text-sm text-neutral-500">
                          {countrySearch
                            ? "No matching countries."
                            : "Countries appear after a tracked visit."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              <div className="grid gap-5 lg:grid-cols-2">
                <Breakdown
                  title="Devices"
                  label="Device"
                  rows={(report.devices || []).map((row) => ({
                    name: row.name,
                    count: row.sessions,
                  }))}
                  total={totals.sessions}
                />
                <Breakdown
                  title="Browsers"
                  label="Browser"
                  rows={(report.browsers || []).map((row) => ({
                    name: row.name,
                    count: row.sessions,
                  }))}
                  total={totals.sessions}
                />
              </div>
            </TabsContent>
            <TabsContent value="conversions" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label="Contact requests" value={String(totals.contacts)} />
                <Metric
                  label="Qualified"
                  value={String(totals.qualified)}
                  detail="Includes won requests"
                />
                <Metric label="Won" value={String(totals.won)} />
              </div>
              <section className={`${panel} p-5`}>
                <h2 className="font-semibold">Conversation funnel</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {funnel.map((stage, index) => (
                    <div key={stage.label} className="rounded-xl bg-neutral-50 p-4">
                      <p className="text-xs text-neutral-500">
                        {index + 1}. {stage.label}
                      </p>
                      <div className="my-3 flex items-baseline gap-2">
                        <strong className="text-2xl">{stage.count}</strong>
                        <span className="text-xs text-neutral-500">
                          {conversionRate(stage.count, totals.sessions)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className="h-full rounded-full bg-[#ff557c]"
                          style={{ width: conversionRate(stage.count, totals.sessions) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-500">
                  Sessions → conversations → contact requests. Requests without tracked sessions are
                  excluded. Association does not measure additional sales caused by Obseri.
                </p>
              </section>
              <section className={`${panel} overflow-hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eeeeee] p-6">
                  <div>
                    <h2 className="font-semibold text-[#262626]">Contact requests</h2>
                    <p className="mt-1 text-xs text-[#737373]">
                      Latest 100 submitted requests · qualified includes won · reply from your email
                    </p>
                  </div>
                  <button
                    disabled={!report.leads.length}
                    onClick={exportLeads}
                    className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] px-3 py-2 text-xs disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
                {!report.leads.length ? (
                  <p className="p-10 text-center text-sm text-[#737373]">
                    When a visitor asks for a follow-up, their request will appear here.
                  </p>
                ) : (
                  <div className="divide-y divide-[#eeeeee]">
                    {report.leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="flex flex-wrap items-start justify-between gap-5 p-6"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <strong className="text-sm text-[#262626]">{lead.name}</strong>
                            <span className="text-xs text-[#737373]">
                              {relativeTime(lead.createdAt)}
                            </span>
                          </div>
                          <a
                            href={`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent("Your website enquiry")}`}
                            className="mt-1 inline-block break-all text-sm text-[#ce3d62] hover:underline"
                          >
                            {lead.email}
                          </a>
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#525252]">
                            {lead.message}
                          </p>
                          <p className="mt-2 break-all text-xs text-[#737373]">
                            Submitted on {lead.path} · permission to follow up recorded
                          </p>
                          {lead.sessionId &&
                            report.journeys.some((j) => j.sessionId === lead.sessionId) && (
                              <button
                                onClick={() => {
                                  setSelected(lead.sessionId!);
                                  setTab("journeys");
                                }}
                                className="mt-3 text-xs font-medium text-[#ce3d62]"
                              >
                                View visitor journey →
                              </button>
                            )}
                        </div>
                        <label className="text-xs text-[#737373]">
                          Outcome
                          <select
                            aria-label={`Outcome for ${lead.name}`}
                            value={lead.status}
                            disabled={updating === lead.id}
                            onChange={(e) =>
                              void changeStatus(lead.id, e.target.value as CapturedLead["status"])
                            }
                            className="mt-1 block rounded-lg border border-[#e5e5e5] bg-white p-2 text-sm text-[#404040]"
                          >
                            <option value="new">New request</option>
                            <option value="qualified">Qualified</option>
                            <option value="won">Won</option>
                            <option value="closed">Closed</option>
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>
            <TabsContent value="journeys" className="space-y-5">
              <section id="visitor-journeys" className={`${panel} p-6`}>
                <h2 className="font-semibold text-[#262626]">Visitor journeys</h2>
                <p className="mt-1 text-xs text-[#737373]">
                  Latest 30 sessions · up to 40 events per session · anonymous until details are
                  shared
                </p>
                <div className="mt-5 grid gap-6 md:grid-cols-[240px_1fr]">
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {report.journeys.map((item) => (
                      <button
                        key={item.sessionId}
                        onClick={() => setSelected(item.sessionId)}
                        className={`w-full rounded-xl p-3 text-left text-sm ${journey?.sessionId === item.sessionId ? "bg-[#fff0f4] text-[#9f2549]" : "bg-[#fafafa] text-[#737373]"}`}
                      >
                        <span className="block truncate font-medium">
                          {countryFlag(item.country)} {countryName(item.country)}
                        </span>
                        <span className="mt-1 block truncate text-xs">
                          {item.source} · {item.device || "Unknown"} · {item.browser || "Unknown"}
                        </span>
                        <span className="mt-1 block text-xs opacity-70">
                          {relativeTime(item.startedAt)} · {item.sessionId.slice(0, 6)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <ol className="space-y-4 border-l border-[#e5e5e5] pl-5">
                    {journey?.events.map((event, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[#ff557c]" />
                        <p className="text-sm font-medium text-[#9f2549]">
                          {eventLabels[event.name] || event.name}
                        </p>
                        <p className="mt-1 break-all text-xs text-[#737373]">
                          {event.path} ·{" "}
                          {new Date(event.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </li>
                    ))}
                    {journey &&
                      report.leads
                        .filter((lead) => lead.sessionId === journey.sessionId)
                        .map((lead) => (
                          <li
                            key={lead.id}
                            className="rounded-xl bg-[#eef6f1] p-3 text-sm text-[#4e7b60]"
                          >
                            Contact request received from {lead.name}
                          </li>
                        ))}
                    {!journey && (
                      <li className="py-8 text-sm text-[#737373]">
                        Your visitor journeys will appear here.
                      </li>
                    )}
                  </ol>
                </div>
              </section>
            </TabsContent>
            <p className="text-xs text-neutral-400">
              Last {days} calendar days · UTC · Tracking respects your widget’s consent settings.
            </p>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-neutral-400">{detail}</p>}
    </div>
  );
}
function Breakdown({
  title,
  label,
  rows,
  total,
  note,
}: {
  title: string;
  label: string;
  rows: Array<{ name: string; count: number }>;
  total: number;
  note?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter((row) => row.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className={`${panel} min-w-0 p-5`}>
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-1 text-xs text-neutral-500">{note}</p>}
      <input
        aria-label={`Search ${title.toLowerCase()}`}
        placeholder={`Search ${title.toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="my-4 w-full rounded-lg border px-3 py-2 text-sm"
      />
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="w-3/5 pb-3 text-left font-normal">{label}</th>
              <th className="pb-3 text-right font-normal">Count</th>
              <th className="pb-3 text-right font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.name} className="border-t border-neutral-100">
                <td className="relative py-3 pr-3">
                  <div
                    className="absolute inset-y-2 left-0 rounded bg-neutral-50"
                    style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                  />
                  <span className="relative block truncate" title={row.name}>
                    {row.name}
                  </span>
                </td>
                <td className="text-right tabular-nums">{row.count}</td>
                <td className="text-right tabular-nums text-neutral-500">
                  {conversionRate(row.count, total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-neutral-500">
            {search ? "No matching results." : "No activity in this period."}
          </p>
        )}
      </div>
    </section>
  );
}
