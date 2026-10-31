import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authFetch, setActiveWorkspaceOwner } from "@/lib/auth-client";

type Workspace = { ownerId: string; name: string; role: "owner" | "editor" };
const Context = createContext<{
  current: Workspace;
  workspaces: Workspace[];
  switchTo: (id: string) => void;
} | null>(null);
export const useTeamWorkspace = () => useContext(Context);
const storageKey = (id: string) => `obseri-active-workspace:${id}`;
async function result(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message || "Could not load team access.");
  return value;
}
export function TeamWorkspaceGate({ userId, children }: { userId: string; children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setActiveWorkspaceOwner("");
    const token =
      new URLSearchParams(window.location.hash.slice(1)).get("invite") ||
      new URLSearchParams(window.location.search).get("invite") ||
      sessionStorage.getItem("obseri-pending-invite") ||
      "";
    if (token) {
      sessionStorage.setItem("obseri-pending-invite", token);
      window.history.replaceState(window.history.state, "", "/app");
    }
    setInvite(token);
    authFetch("/api/team?view=workspaces")
      .then(result)
      .then((data) => {
        if (!active) return;
        const list = data.workspaces as Workspace[];
        const selection =
          list.find((w) => w.ownerId === sessionStorage.getItem(storageKey(userId))) ||
          list.find((w) => w.ownerId === userId)!;
        setActiveWorkspaceOwner(selection.ownerId);
        setCurrent(selection);
        setWorkspaces(list);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  function switchTo(id: string) {
    sessionStorage.setItem(storageKey(userId), id);
    window.location.assign("/app");
  }
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const data = await authFetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", token: invite }),
      }).then(result);
      sessionStorage.removeItem("obseri-pending-invite");
      switchTo(data.ownerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept invitation.");
      setBusy(false);
    }
  }
  if (invite || !current || !workspaces)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fafaf9] p-6">
        <div className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">
            {invite ? "Join your team" : "Opening your workspace"}
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            {invite
              ? "Join as an Editor to manage websites, knowledge, conversations and analytics. Sign in with the verified email address your teammate invited."
              : "Checking your workspace access…"}
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {invite ? (
            <div className="mt-6 flex gap-4">
              <button
                disabled={busy}
                onClick={() => void accept()}
                className="rounded-full bg-black px-5 py-3 text-sm text-white disabled:opacity-50"
              >
                {busy ? "Joining…" : "Accept invitation"}
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem("obseri-pending-invite");
                  window.location.assign("/app");
                }}
                className="text-sm"
              >
                Not now
              </button>
            </div>
          ) : (
            error && (
              <button onClick={() => window.location.reload()} className="mt-5 underline">
                Try again
              </button>
            )
          )}
        </div>
      </div>
    );
  return <Context.Provider value={{ current, workspaces, switchTo }}>{children}</Context.Provider>;
}
export function WorkspaceSwitcher({
  beforeSwitch,
  onTeam,
}: {
  beforeSwitch: () => Promise<boolean>;
  onTeam: () => void;
}) {
  const team = useTeamWorkspace();
  const [busy, setBusy] = useState(false);
  if (!team) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs">
      <label className="flex min-w-0 items-center gap-2">
        <span className="text-stone-500">Workspace</span>
        <select
          aria-label="Switch workspace"
          value={team.current.ownerId}
          disabled={busy}
          className="max-w-52 rounded-lg border border-stone-200 bg-white px-2 py-1.5"
          onChange={async (e) => {
            const id = e.target.value;
            setBusy(true);
            if (await beforeSwitch()) team.switchTo(id);
            else setBusy(false);
          }}
        >
          {team.workspaces.map((w) => (
            <option key={w.ownerId} value={w.ownerId}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={onTeam}
        className="shrink-0 rounded-full px-3 py-1.5 font-medium hover:bg-stone-200"
      >
        {team.current.role === "owner" ? "Manage team" : "Editor · Team workspace"}
      </button>
    </div>
  );
}
type Details = {
  members: { userId: string; email: string }[];
  invitations: { id: string; email: string; expiresAt: string }[];
  seatLimit: number | null;
  plan: string;
};
export function TeamSettings({ onViewPlans }: { onViewPlans: () => void }) {
  const team = useTeamWorkspace();
  const [details, setDetails] = useState<Details | null>(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const owner = !team || team.current.role === "owner";
  const seatsUsed = details ? 1 + details.members.length + details.invitations.length : 0;
  const seatsFull = details?.seatLimit != null && seatsUsed >= details.seatLimit;
  const replacesPending = details?.invitations.some(
    (invitation) => invitation.email.toLowerCase() === email.trim().toLowerCase(),
  );
  const canInvite = !!details && (!seatsFull || !!replacesPending);
  async function load() {
    setDetails(await authFetch("/api/team").then(result));
  }
  useEffect(() => {
    if (owner) void load().catch((e) => setNotice(e.message));
  }, [owner]);
  async function act(action: Record<string, string>) {
    setBusy(true);
    setNotice("");
    setLink("");
    try {
      const data = await authFetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      }).then(result);
      if (data.token) {
        setLink(`${window.location.origin}/app#invite=${encodeURIComponent(data.token)}`);
        setEmail("");
      }
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border-t border-stone-200 p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Team access</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        {owner
          ? "Editors can manage websites, publish assistants and work with conversations. Only you can change billing or team access."
          : "You can manage websites, knowledge and conversations. Ask the owner to manage billing and invitations."}
      </p>
      {owner && (
        <>
          {details && (
            <p className="mt-4 text-sm font-medium">
              {1 + details.members.length + details.invitations.length} /{" "}
              {details.seatLimit ?? "Custom"} seats · {details.plan}
              <span className="mt-1 block text-xs font-normal text-stone-500">
                Includes you and pending invitations.
              </span>
            </p>
          )}
          {seatsFull && (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
              <p className="font-medium">
                {details?.seatLimit === 1
                  ? "Your plan includes only your seat."
                  : "All team seats are in use."}
              </p>
              <p className="mt-1 text-stone-600">
                {details?.seatLimit === 1
                  ? "Choose a team plan before inviting a teammate."
                  : "Upgrade your plan or remove a member or pending invitation to add someone new."}
              </p>
              <button type="button" onClick={onViewPlans} className="mt-3 font-medium underline">
                View team plans
              </button>
            </div>
          )}
          <form
            className="mt-5 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && canInvite) void act({ action: "invite", email });
            }}
          >
            <input
              aria-label="Teammate email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="clean-input min-w-0 flex-1"
            />
            <button
              disabled={busy || !canInvite}
              className="rounded-full bg-black px-5 py-3 text-sm text-white disabled:opacity-50"
            >
              {busy ? "Working…" : replacesPending ? "Replace invite link" : "Create invite link"}
            </button>
          </form>
          <p className="mt-2 text-xs text-stone-500">
            No email is sent. Copy and share the invitation link with your teammate. It expires in 7
            days and works only for this email.
          </p>
          {link && (
            <div className="mt-4 rounded-xl bg-stone-100 p-4">
              <p role="status" className="mb-3 text-sm">
                Invitation link ready. No email was sent—share the link below with your teammate.
              </p>
              <label className="text-xs font-medium">
                Invitation link
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  className="clean-input mt-2 w-full"
                />
              </label>
              <button
                className="mt-2 text-sm underline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => setNotice("Link copied."))
                    .catch(() => setNotice("Select and copy the link above."))
                }
              >
                Copy link
              </button>
            </div>
          )}
          <div className="mt-5 divide-y divide-stone-100">
            <p className="py-3 text-sm">
              You <span className="float-right text-stone-500">Owner</span>
            </p>
            {details?.members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 break-all">
                  {m.email}
                  <small className="block text-stone-500">Editor</small>
                </span>
                <button
                  disabled={busy}
                  className="text-red-700"
                  onClick={() => {
                    if (window.confirm(`Remove ${m.email} from this workspace?`))
                      void act({ action: "remove", userId: m.userId });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {details?.invitations.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 break-all">
                  {i.email}
                  <small className="block text-stone-500">
                    Pending · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </small>
                </span>
                <button
                  disabled={busy}
                  className="text-stone-600"
                  onClick={() => void act({ action: "revoke", invitationId: i.id })}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-stone-700">
          {notice}
        </p>
      )}
    </section>
  );
}

export function OperationHealth() {
  const [events, setEvents] = useState<
    { operation: string; status: string; latest: string }[] | null
  >(null);
  const [error, setError] = useState("");
  async function refresh() {
    setError("");
    try {
      setEvents((await authFetch("/api/operations").then(result)).events);
    } catch {
      setError("Health checks are temporarily unavailable.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <section className="border-t border-stone-200 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Knowledge health</h2>
        <button onClick={() => void refresh()} className="text-sm underline">
          Refresh
        </button>
      </div>
      <p className="mt-2 text-sm text-stone-500">
        Import results and search fallbacks in the last 24 hours.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm">
          {error}
        </p>
      )}
      {events?.length === 0 && (
        <p className="mt-4 text-sm text-stone-500">No recent events recorded.</p>
      )}
      {events?.map((e) => (
        <div
          key={`${e.operation}:${e.status}`}
          className="mt-3 rounded-xl border border-stone-200 p-3 text-sm"
        >
          <p className="font-medium">
            {e.operation === "semantic"
              ? "Semantic search"
              : e.operation === "pdf"
                ? "PDF import"
                : "Website crawl"}{" "}
            ·{" "}
            {e.status === "ok"
              ? "Completed"
              : e.status === "fallback"
                ? "Keyword fallback used"
                : "Needs attention"}
          </p>
          <p className="mt-1 text-xs text-stone-500">{new Date(e.latest).toLocaleString()}</p>
          {e.status !== "ok" && (
            <p className="mt-2 text-stone-600">
              {e.operation === "semantic"
                ? "Chat remains available using keyword search. If this persists, check the embedding provider and indexing budget."
                : "Review the source and retry from Knowledge. Check the import error for details."}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
