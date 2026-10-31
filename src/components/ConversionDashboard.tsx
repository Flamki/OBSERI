import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Users,
} from "lucide-react";
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
const panel = "rounded-2xl border border-[#e9e6ed] bg-white";

export default function ConversionDashboard({
  soulId,
  onInstall,
}: {
  soulId: string;
  onInstall: () => void;
}) {
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
    <div className="min-h-full bg-[#f8f7fa] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[.14em] text-[#8a7b9e]">
              <Activity className="h-3.5 w-3.5" /> Observe → understand → convert
            </p>
            <h1 className="text-3xl font-semibold tracking-[-.045em] text-[#25212d]">
              Every visit has a story.
            </h1>
            <p className="mt-2 text-sm text-[#82798d]">
              See what brought people in, what they asked, and who wants to hear from you.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="analytics-range">
              Reporting period
            </label>
            <select
              id="analytics-range"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-[#e3dfea] bg-white px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button
              aria-label="Refresh analytics"
              onClick={() => setRevision((v) => v + 1)}
              className="rounded-xl border border-[#e3dfea] bg-white p-2.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[#f1d6d6] bg-[#fff7f7] p-4 text-sm text-[#9b4444]"
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
            className={`${panel} flex items-center gap-3 p-10 text-sm text-[#82798d]`}
          >
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading your website’s activity…
          </div>
        )}
        {totals && report && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Sessions",
                  value: totals.sessions,
                  detail: `${totals.pageViews.toLocaleString()} page views`,
                  icon: Globe2,
                },
                {
                  label: "Conversations",
                  value: totals.engaged,
                  detail: `${conversionRate(totals.engaged, totals.sessions)} of sessions`,
                  icon: MessageSquareText,
                },
                {
                  label: "Contact requests",
                  value: totals.contacts,
                  detail: "Details shared with permission",
                  icon: Users,
                },
                {
                  label: "Qualified / won",
                  value: `${totals.qualified} / ${totals.won}`,
                  detail: "Outcomes marked by your team",
                  icon: CheckCircle2,
                },
              ].map(({ label, value, detail, icon: Icon }) => (
                <div key={label} className={`${panel} p-5`}>
                  <div className="flex items-center justify-between text-sm text-[#82798d]">
                    {label}
                    <Icon className="h-4 w-4 text-[#a592be]" />
                  </div>
                  <p className="mt-5 text-3xl font-semibold tracking-tight text-[#25212d]">
                    {typeof value === "number" ? value.toLocaleString() : value}
                  </p>
                  <p className="mt-2 text-xs text-[#958d9e]">{detail}</p>
                </div>
              ))}
            </div>
            {!totals.sessions && !totals.contacts && (
              <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[#eee8f8] p-6">
                <div>
                  <h2 className="font-semibold text-[#4c396a]">
                    Your first visitor is the beginning.
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[#7e6a97]">
                    Publish your assistant and install the embed on your website. Real visits and
                    submitted requests will appear here. Studio tests are excluded.
                  </p>
                </div>
                <button
                  onClick={onInstall}
                  className="flex items-center gap-2 rounded-xl bg-[#67518a] px-4 py-3 text-sm font-medium text-white"
                >
                  Install Obseri <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="grid gap-5 lg:grid-cols-2">
              <section className={`${panel} p-6`}>
                <h2 className="font-semibold text-[#25212d]">From interest to a conversation.</h2>
                <p className="mt-1 text-xs text-[#958d9e]">
                  Session-based funnel · last {days} days
                </p>
                <div className="mt-6 space-y-3">
                  {funnel.map((stage, index) => (
                    <div key={stage.label}>
                      {index > 0 && <ArrowDown className="mb-3 ml-3 h-3.5 w-3.5 text-[#b7a9c9]" />}
                      <div className="relative overflow-hidden rounded-xl bg-[#f6f3f9] p-4">
                        <div
                          className="absolute inset-y-0 left-0 bg-[#e9dff6]"
                          style={{
                            width: `${totals.sessions ? (stage.count / totals.sessions) * 100 : 0}%`,
                          }}
                        />
                        <div className="relative flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-[#58446f]">{stage.label}</p>
                            <p className="mt-1 text-[11px] text-[#8e7c9f]">{stage.detail}</p>
                          </div>
                          <strong className="text-xl text-[#58446f]">{stage.count}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-[#958d9e]">
                  Attribution shows association, not incremental lift. Requests without analytics
                  consent still appear in your inbox, but are excluded from this funnel.
                </p>
              </section>
              <section className={`${panel} p-6`}>
                <h2 className="font-semibold text-[#25212d]">Where interest comes from.</h2>
                <p className="mt-1 text-xs text-[#958d9e]">
                  First observed source in this reporting period
                </p>
                <div className="mt-6 grid grid-cols-[1fr_auto_auto] gap-x-5 gap-y-4 text-sm">
                  <span className="text-xs text-[#958d9e]">Source</span>
                  <span className="text-xs text-[#958d9e]">Sessions</span>
                  <span className="text-xs text-[#958d9e]">With contact</span>
                  {report.sources.map((source) => (
                    <SourceRow key={source.source} {...source} />
                  ))}
                </div>
                {!report.sources.length && (
                  <p className="py-10 text-center text-sm text-[#a49aaa]">
                    Sources appear after the first tracked visit.
                  </p>
                )}
                <div className="mt-7 border-t border-[#eee9f3] pt-5">
                  <h3 className="text-sm font-medium">Most visited pages</h3>
                  {report.pages.map((page) => (
                    <div
                      key={page.path}
                      className="mt-3 flex justify-between gap-4 text-xs text-[#8e8498]"
                    >
                      <span className="truncate">{page.path}</span>
                      <span>{page.views}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <section className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee9f3] p-6">
                <div>
                  <h2 className="font-semibold text-[#25212d]">People ready for the next step.</h2>
                  <p className="mt-1 text-xs text-[#958d9e]">
                    Latest 100 submitted requests · qualified includes won · reply from your email
                  </p>
                </div>
                <button
                  disabled={!report.leads.length}
                  onClick={exportLeads}
                  className="flex items-center gap-2 rounded-xl border border-[#e3dfea] px-3 py-2 text-xs disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
              {!report.leads.length ? (
                <p className="p-10 text-center text-sm text-[#a49aaa]">
                  When a visitor asks for a follow-up, their request will appear here.
                </p>
              ) : (
                <div className="divide-y divide-[#eee9f3]">
                  {report.leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex flex-wrap items-start justify-between gap-5 p-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <strong className="text-sm text-[#40354e]">{lead.name}</strong>
                          <span className="text-xs text-[#a49aaa]">
                            {relativeTime(lead.createdAt)}
                          </span>
                        </div>
                        <a
                          href={`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent("Your website enquiry")}`}
                          className="mt-1 inline-block break-all text-sm text-[#8b6ab0] hover:underline"
                        >
                          {lead.email}
                        </a>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#756a80]">
                          {lead.message}
                        </p>
                        <p className="mt-2 break-all text-xs text-[#a49aaa]">
                          Submitted on {lead.path} · permission to follow up recorded
                        </p>
                        {lead.sessionId &&
                          report.journeys.some((j) => j.sessionId === lead.sessionId) && (
                            <button
                              onClick={() => {
                                setSelected(lead.sessionId!);
                                document
                                  .getElementById("visitor-journeys")
                                  ?.scrollIntoView({ behavior: "smooth" });
                              }}
                              className="mt-3 text-xs font-medium text-[#8b6ab0]"
                            >
                              View visitor journey →
                            </button>
                          )}
                      </div>
                      <label className="text-xs text-[#958d9e]">
                        Outcome
                        <select
                          aria-label={`Outcome for ${lead.name}`}
                          value={lead.status}
                          disabled={updating === lead.id}
                          onChange={(e) =>
                            void changeStatus(lead.id, e.target.value as CapturedLead["status"])
                          }
                          className="mt-1 block rounded-lg border border-[#e3dfea] bg-white p-2 text-sm text-[#58446f]"
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
            <section id="visitor-journeys" className={`${panel} p-6`}>
              <h2 className="font-semibold text-[#25212d]">The story behind the visit.</h2>
              <p className="mt-1 text-xs text-[#958d9e]">
                Latest 30 sessions · up to 40 events per session · anonymous until details are
                shared
              </p>
              <div className="mt-5 grid gap-6 md:grid-cols-[240px_1fr]">
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {report.journeys.map((item) => (
                    <button
                      key={item.sessionId}
                      onClick={() => setSelected(item.sessionId)}
                      className={`w-full rounded-xl p-3 text-left text-sm ${journey?.sessionId === item.sessionId ? "bg-[#eee6f7] text-[#67518a]" : "bg-[#faf9fc] text-[#8e8498]"}`}
                    >
                      <span className="block truncate font-medium">{item.source}</span>
                      <span className="mt-1 block text-xs opacity-70">
                        {relativeTime(item.startedAt)} · {item.sessionId.slice(0, 6)}
                      </span>
                    </button>
                  ))}
                </div>
                <ol className="space-y-4 border-l border-[#e6dfed] pl-5">
                  {journey?.events.map((event, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[#b39acb]" />
                      <p className="text-sm font-medium text-[#67518a]">
                        {eventLabels[event.name] || event.name}
                      </p>
                      <p className="mt-1 break-all text-xs text-[#958d9e]">
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
                    <li className="py-8 text-sm text-[#a49aaa]">
                      Your visitor journeys will appear here.
                    </li>
                  )}
                </ol>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SourceRow({
  source,
  sessions,
  contacts,
}: {
  source: string;
  sessions: number;
  contacts: number;
}) {
  return (
    <>
      <span className="truncate text-[#756a80]">{source}</span>
      <span className="text-right text-[#756a80]">{sessions}</span>
      <span className="text-right font-medium text-[#8b6ab0]">{contacts}</span>
    </>
  );
}
