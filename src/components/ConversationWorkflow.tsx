import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-client";
import { canAccess } from "@/lib/workspace-access";
import type { ConversationInbox, InboxMutation } from "@/lib/conversation-inbox";
import { useTeamWorkspace } from "./TeamWorkspace";

export function ConversationWorkflow({
  soulId,
  conversationId,
  onChange,
}: {
  soulId: string;
  conversationId: string;
  onChange?: (inbox: ConversationInbox) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const team = useTeamWorkspace();
  const canEdit =
    !!team &&
    (team.current.role === "owner" || canAccess(team.current.permissions, "conversations", true));
  const [inbox, setInbox] = useState<ConversationInbox | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  const controller = useRef(new AbortController());
  const noteAttempt = useRef<{ id: string; body: string } | null>(null);
  const requestGeneration = useRef(0);
  const olderNotesLoaded = useRef(false);
  const endpoint = `/api/souls/${encodeURIComponent(soulId)}/conversations`;
  async function read(before?: string) {
    const generation = ++requestGeneration.current;
    const response = await authFetch(
      `${endpoint}?inbox=${encodeURIComponent(conversationId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      { signal: controller.current.signal },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Could not load team details.");
    if (!data.inbox) throw new Error("Team details are unavailable. Try refreshing.");
    if (alive.current && generation === requestGeneration.current) {
      onChangeRef.current?.(data.inbox);
      if (before) olderNotesLoaded.current = true;
      setInbox((old) => {
        const next = data.inbox as ConversationInbox;
        if (!old || (!before && !olderNotesLoaded.current)) return next;
        const ids = new Set(next.notes.map((note) => note.id));
        if (before)
          return {
            ...next,
            notes: [...next.notes, ...old.notes.filter((note) => !ids.has(note.id))],
          };
        // Keep expanded history during background refreshes, unless we missed a full page.
        if (!old.notes.some((note) => ids.has(note.id))) {
          olderNotesLoaded.current = false;
          return next;
        }
        return {
          ...next,
          nextCursor: old.nextCursor,
          hasOlderNotes: old.hasOlderNotes,
          notes: [...old.notes.filter((note) => !ids.has(note.id)), ...next.notes],
        };
      });
    }
  }
  useEffect(() => {
    alive.current = true;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    async function refresh() {
      if (locked.current || document.hidden) return;
      try {
        await read();
      } catch (e) {
        if (alive.current && !signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load team details.");
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      alive.current = false;
      controller.current.abort();
      clearInterval(timer);
    };
  }, [endpoint, conversationId]);

  async function save(change: InboxMutation) {
    if (locked.current) return;
    locked.current = true;
    ++requestGeneration.current; // Ignore reads started before this mutation.
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
        signal: controller.current.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) await read();
        throw new Error(data.error?.message || "Could not save. Try again.");
      }
      if (!alive.current) return;
      if (change.action === "note") {
        setDraft("");
        noteAttempt.current = null;
      }
      setNotice(change.action === "note" ? "Private note saved" : "Saved");
      await read();
    } catch (e) {
      if (alive.current && !controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const field =
    "h-8 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-900 disabled:opacity-60";
  return (
    <div
      className="shrink-0 border-b border-stone-200 bg-white px-5 py-3 text-stone-900 sm:px-8"
      aria-label="Team follow-up"
    >
      <div className="flex flex-wrap items-center gap-3">
        {inbox ? (
          <>
            <label className="flex items-center gap-2 text-xs text-stone-600">
              Status
              <select
                aria-label="Follow-up status"
                className={field}
                value={inbox.status}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  void save({
                    action: "update",
                    conversationId,
                    version: inbox.version,
                    status: e.target.value as ConversationInbox["status"],
                    assigneeId: inbox.assigneeId,
                  })
                }
              >
                <option value="open">Open</option>
                <option value="waiting">Waiting for reply</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-xs text-stone-600">
              Assigned to
              <select
                aria-label="Assigned teammate"
                className={`${field} max-w-[180px]`}
                value={inbox.assigneeId || ""}
                disabled={!canEdit || busy}
                onChange={(e) =>
                  void save({
                    action: "update",
                    conversationId,
                    version: inbox.version,
                    status: inbox.status,
                    assigneeId: e.target.value || null,
                  })
                }
              >
                <option value="">Unassigned</option>
                {inbox.assigneeId &&
                  !inbox.assignees.some((person) => person.id === inbox.assigneeId) && (
                    <option value={inbox.assigneeId}>Unavailable teammate</option>
                  )}
                {inbox.assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-stone-100"
            >
              Team notes
              {inbox.notes.length
                ? ` (${inbox.notes.length}${inbox.hasOlderNotes ? "+" : ""})`
                : ""}
            </button>
          </>
        ) : (
          <span className="text-xs text-stone-500">
            {error ? "Team follow-up unavailable" : "Loading team follow-up…"}
          </span>
        )}
        <span role="status" className="text-xs text-stone-500">
          {busy ? "Saving…" : notice}
        </span>
      </div>
      {error && (
        <div role="alert" className="mt-2 flex items-center gap-3 text-xs text-red-700">
          {error}
          <button
            type="button"
            className="underline"
            disabled={busy}
            onClick={() => {
              setError("");
              void read().catch((e) => setError(e.message));
            }}
          >
            Refresh
          </button>
        </div>
      )}
      {expanded && inbox && (
        <div className="mt-3 max-h-[45dvh] overflow-y-auto overscroll-contain rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="mb-2 text-xs text-stone-600">
            Private to teammates with conversation access. Never sent to the visitor.
          </p>
          <div
            role="region"
            aria-label="Private team notes"
            tabIndex={0}
            className="max-h-36 space-y-3 overflow-y-auto overscroll-contain"
          >
            {inbox.nextCursor && (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => void read(inbox.nextCursor!).catch((e) => setError(e.message))}
              >
                Load older notes
              </button>
            )}
            {!inbox.notes.length && (
              <p className="text-xs text-stone-500">Add context for whoever follows up next.</p>
            )}
            {inbox.notes.map((note) => (
              <article key={note.id} className="text-xs">
                <div className="flex flex-wrap gap-2 text-stone-500">
                  <strong className="break-all font-medium text-stone-800">{note.author}</strong>
                  <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words leading-5">{note.body}</p>
              </article>
            ))}
          </div>
          {canEdit && (
            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                const body = draft.trim();
                if (!body) return;
                if (noteAttempt.current?.body !== body)
                  noteAttempt.current = { id: crypto.randomUUID(), body };
                void save({
                  action: "note",
                  conversationId,
                  noteId: noteAttempt.current!.id,
                  body,
                });
              }}
            >
              <textarea
                aria-label="Private note"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={busy}
                maxLength={2000}
                rows={2}
                placeholder="Add a private handoff note…"
                className="w-full resize-none rounded-lg border border-stone-200 bg-white p-2 text-xs text-stone-900 outline-none focus:border-stone-500"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-stone-500">{draft.length}/2,000</span>
                <button
                  disabled={busy || !draft.trim()}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Add private note
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
