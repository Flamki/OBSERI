import { parseActivityPage, type ActivityEvent } from "@/lib/team-activity";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ACCESS_SECTIONS,
  normalizePermissions,
  permissionPreset,
  accessRole,
  canAccess,
  type WorkspacePermissions,
  type AccessSection,
} from "@/lib/workspace-access";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authFetch, setActiveWorkspaceOwner } from "@/lib/auth-client";

type Workspace = {
  ownerId: string;
  name: string;
  role: "owner" | "editor" | "viewer" | "custom";
  permissions?: WorkspacePermissions;
};
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
              ? "Your owner has chosen which sections you can view and edit. Sign in with the verified email address your teammate invited."
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
        {team.current.role === "owner"
          ? "Manage team"
          : `${team.current.role === "custom" ? "Custom access" : team.current.role === "viewer" ? "Viewer" : "Editor"} · Team workspace`}
      </button>
    </div>
  );
}
type Details = {
  members: { userId: string; email: string; permissions?: WorkspacePermissions }[];
  invitations: {
    id: string;
    email: string;
    expiresAt: string;
    permissions?: WorkspacePermissions;
  }[];
  seatLimit: number | null;
  plan: string;
};
export function TeamSettings({ onViewPlans }: { onViewPlans: () => void }) {
  const team = useTeamWorkspace();
  const [details, setDetails] = useState<Details | null>(null);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<WorkspacePermissions>(permissionPreset("write"));
  const [editing, setEditing] = useState<Details["members"][number] | null>(null);
  const [tab, setTab] = useState<"members" | "activity">("members");
  const [link, setLink] = useState("");
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
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
  async function act(action: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await authFetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      }).then(result);
      await load();
      setEditing(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function createInvitation() {
    if (busy || !inviteEmail || link) return;
    setBusy(true);
    setInviteNotice("");
    try {
      const data = await authFetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "invite", email: inviteEmail, permissions }),
      }).then(result);
      if (!data.token) throw new Error("The invitation link was not returned. Please try again.");
      setLink(`${window.location.origin}/app#invite=${encodeURIComponent(data.token)}`);
      setEmail("");
      // Keep the generated link available even if refreshing the team list fails.
      await load().catch(() =>
        setInviteNotice("Your link is ready. Refresh Team later to update the people list."),
      );
    } catch (error) {
      setInviteNotice(
        error instanceof Error
          ? error.message
          : "Could not create the invitation. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copyInvitation() {
    setCopying(true);
    setInviteNotice("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setInviteNotice("Copy was blocked by your browser. Select the link and copy it manually.");
    } finally {
      setCopying(false);
    }
  }
  return (
    <section className="border-t border-stone-200 p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Team access</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        {owner
          ? "Choose what each teammate can see and change. Billing, team access, and adding or removing websites stay with you."
          : "Your owner controls access. View your permissions below; ask them when you need a different level."}
      </p>
      {owner && (
        <div className="mt-5 flex gap-2 border-b pb-3" role="tablist" aria-label="Team settings">
          {(["members", "activity"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`rounded-full px-4 py-2 text-sm ${tab === item ? "bg-black text-white" : "bg-stone-100"}`}
            >
              {item === "members" ? "People & access" : "Activity log"}
            </button>
          ))}
        </div>
      )}
      {!owner && (
        <PermissionEditor
          value={normalizePermissions(team?.current.permissions)}
          onChange={() => undefined}
          disabled
        />
      )}
      {owner && tab === "activity" && <TeamActivity />}
      {owner && tab === "members" && (
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
              if (!busy && canInvite) {
                setInviteEmail(email.trim().toLowerCase());
                setPermissions(permissionPreset("write"));
                setLink("");
                setCopied(false);
                setInviteNotice("");
              }
            }}
          >
            <input
              id="team-invite-email"
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
          <div className="mt-5 divide-y divide-stone-100">
            <p className="py-3 text-sm">
              You <span className="float-right text-stone-500">Owner</span>
            </p>
            {details?.members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 break-all">
                  {m.email}
                  <small className="block capitalize text-stone-500">
                    {accessRole(normalizePermissions(m.permissions))}
                  </small>
                </span>
                <button
                  disabled={busy}
                  className="ml-auto rounded-lg border px-3 py-2"
                  onClick={() =>
                    setEditing({ ...m, permissions: normalizePermissions(m.permissions) })
                  }
                >
                  Edit access
                </button>
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
                    {accessRole(normalizePermissions(i.permissions))} · Pending · expires{" "}
                    {new Date(i.expiresAt).toLocaleDateString()}
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
      <Dialog
        open={inviteEmail !== null}
        onOpenChange={(open) => {
          if (!open && !busy && !copying) setInviteEmail(null);
        }}
      >
        <DialogContent
          className="z-[90] max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl bg-white p-6 sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("team-invite-email")?.focus();
          }}
        >
          <DialogTitle>{link ? "Invitation ready" : "Choose invitation access"}</DialogTitle>
          <DialogDescription className="break-all">{inviteEmail}</DialogDescription>
          {link ? (
            <>
              <p role="status" className="text-sm text-stone-600">
                Link created with {accessRole(permissions)} access. Share it with your teammate to
                join.
              </p>
              <label className="text-sm font-medium">
                Invitation link
                <input
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                  className="clean-input mt-2 w-full"
                />
              </label>
              <p className="text-xs leading-5 text-stone-500">
                Only {inviteEmail} can accept this invitation. It expires in 7 days. No email is
                sent automatically.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  disabled={busy || copying}
                  onClick={() => setInviteEmail(null)}
                  className="rounded-full border px-5 py-2.5 text-sm"
                >
                  Done
                </button>
                <button
                  disabled={copying}
                  onClick={() => void copyInvitation()}
                  className="rounded-full bg-black px-5 py-2.5 text-sm text-white"
                  aria-live="polite"
                >
                  {copying ? "Copying…" : copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </>
          ) : (
            <>
              <PermissionEditor value={permissions} onChange={setPermissions} disabled={busy} />
              <p className="text-xs leading-5 text-stone-500">
                Access applies to every website in this workspace. Only you can manage billing and
                the team. You can change permissions later.
              </p>
              {replacesPending && (
                <p className="text-sm text-amber-800">
                  Confirming will replace the existing invitation for this email. The previous link
                  will stop working.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  disabled={busy}
                  onClick={() => setInviteEmail(null)}
                  className="rounded-full border px-5 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  onClick={() => void createInvitation()}
                  className="rounded-full bg-black px-5 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {busy ? "Creating link…" : "Confirm & create link"}
                </button>
              </div>
            </>
          )}
          {inviteNotice && (
            <p role="alert" className="text-sm text-stone-700">
              {inviteNotice}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="z-[90] max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-6 sm:max-w-xl">
            <DialogTitle>Edit teammate access</DialogTitle>
            <DialogDescription>{editing.email}</DialogDescription>
            <PermissionEditor
              value={normalizePermissions(editing.permissions)}
              onChange={(value) => setEditing({ ...editing, permissions: value })}
              disabled={busy}
            />
            <p className="mt-3 text-xs text-stone-500">
              Applies to all websites in this workspace. Changes take effect on their next request.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button disabled={busy} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "permissions",
                    userId: editing.userId,
                    permissions: editing.permissions,
                  })
                }
                className="rounded-full bg-black px-5 py-2 text-white"
              >
                Save access
              </button>
            </div>
            {notice && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {notice}
              </p>
            )}
          </DialogContent>
        )}
      </Dialog>
      {notice && (
        <p role="status" className="mt-4 text-sm text-stone-700">
          {notice}
        </p>
      )}
    </section>
  );
}

export function OperationHealth() {
  const team = useTeamWorkspace();
  const allowed = !team || canAccess(team.current.permissions, "knowledge");
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
    if (allowed) void refresh();
  }, [allowed]);
  if (!allowed) return null;
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

function PermissionEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkspacePermissions;
  onChange: (value: WorkspacePermissions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      {!disabled && (
        <label className="mb-4 flex items-center justify-between text-sm">
          Start with a role
          <select
            aria-label="Permission preset"
            value={accessRole(value)}
            onChange={(e) =>
              onChange(
                permissionPreset(
                  e.target.value === "editor"
                    ? "write"
                    : e.target.value === "viewer"
                      ? "read"
                      : "none",
                ),
              )
            }
            className="rounded-lg border bg-white p-2"
          >
            <option value="editor">Editor · all sections</option>
            <option value="viewer">Viewer · read only</option>
            <option value="custom">Custom · choose sections</option>
          </select>
        </label>
      )}
      <div className="overflow-hidden rounded-xl border divide-y">
        {Object.entries(ACCESS_SECTIONS).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span>{label}</span>
            <select
              aria-label={`${label} access`}
              disabled={disabled}
              value={value[key as AccessSection]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className="rounded-lg border bg-white p-2 disabled:opacity-70"
            >
              <option value="none">No access</option>
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
            </select>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">
        Can edit includes viewing. Publishing can release the saved assistant, including changes
        made by other teammates.
      </p>
    </div>
  );
}
function TeamActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(before?: string) {
    setBusy(true);
    try {
      const data = parseActivityPage(
        await authFetch(`/api/team?view=activity${before ? `&before=${before}` : ""}`).then(result),
      );
      setEvents((old) => (before ? [...old, ...data.events] : data.events));
      setCursor(data.nextCursor);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const labels: Record<string, string> = {
    "workspace.updated": "Updated workspace",
    "assistant.published": "Published assistant",
    "member.permissions": "Changed teammate access",
    "member.removed": "Removed teammate",
    "invitation.created": "Created invitation",
    "invitation.revoked": "Revoked invitation",
    "member.joined": "Joined workspace",
    "lead.status": "Changed lead status",
  };
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-stone-500">
          Changes recorded from this update onward. Private content and credentials are excluded.
        </p>
        <button disabled={busy} onClick={() => void load()} className="text-sm underline">
          Refresh log
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
      {!events.length && !busy && !error && (
        <p className="py-8 text-sm text-stone-500">
          No team activity yet. Saved edits, invitations and access changes will appear here.
        </p>
      )}
      <ol className="mt-4 divide-y">
        {events.map((event) => (
          <li key={event.id} className="py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-sm font-medium">
                {event.actorEmail || "Workspace owner"}{" "}
                <span className="font-normal text-stone-500">
                  · {labels[event.action] || event.action}
                </span>
              </p>
              <time className="text-xs text-stone-500" dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
            {event.detailsUnavailable && (
              <p className="mt-2 text-xs text-stone-500">Details for this entry are unavailable.</p>
            )}
            <ul className="mt-2 space-y-1 text-xs text-stone-600">
              {event.changes.map((change, index) => (
                <li key={index}>
                  {[
                    change.website,
                    change.email,
                    change.section &&
                      (ACCESS_SECTIONS[change.section as AccessSection] || change.section),
                    change.field,
                    change.operation,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {change.after && (
                    <span className="block">
                      {Object.entries(change.after)
                        .filter(([key, value]) => value !== change.before?.[key as AccessSection])
                        .map(
                          ([key, value]) =>
                            `${ACCESS_SECTIONS[key as AccessSection]}: ${change.before?.[key as AccessSection] || "none"} → ${value}`,
                        )
                        .join(" · ")}
                    </span>
                  )}
                  {change.permissions && (
                    <span className="block">{accessRole(change.permissions)} access</span>
                  )}
                </li>
              ))}
            </ul>
            {event.revision != null && (
              <p className="mt-2 text-xs text-stone-400">Revision {event.revision}</p>
            )}
          </li>
        ))}
      </ol>
      {cursor && (
        <button
          disabled={busy}
          onClick={() => void load(cursor)}
          className="mt-4 rounded-full border px-4 py-2 text-sm"
        >
          Load older activity
        </button>
      )}
    </div>
  );
}
