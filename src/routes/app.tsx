import { ConversationWorkflow } from "@/components/ConversationWorkflow";
import {
  canAccess,
  normalizePermissions,
  VIEW_SECTION,
  type AccessSection,
} from "@/lib/workspace-access";
import {
  workspaceChanges,
  mergeWorkspaceChanges,
  assertChangesAllowed,
} from "@/lib/workspace-merge";
import {
  TeamWorkspaceGate,
  WorkspaceSwitcher,
  TeamSettings,
  OperationHealth,
  useTeamWorkspace,
} from "@/components/TeamWorkspace";
import { CorrectAnswerDialog } from "@/components/CorrectAnswerDialog";
import { KnowledgeAnswerTest } from "@/components/KnowledgeAnswerTest";
import { addApprovedAnswer } from "@/lib/knowledge-corrections";
import { activeKnowledgeChunks, splitKnowledgeText } from "@/lib/knowledge-content";
import ChatLauncher from "@/components/ChatLauncher";
import LauncherSettings from "@/components/LauncherSettings";
import { launcherPanel, launcherMode } from "@/lib/launcher";
import VoiceSettings from "@/components/VoiceSettings";
import PersonalitySettings from "@/components/PersonalitySettings";
import FollowUpSettings from "@/components/FollowUpSettings";
import FollowUpAction from "@/components/FollowUpAction";
import { followUpError } from "@/lib/follow-up";
import { Activity } from "lucide-react";
import ConversionDashboard from "@/components/ConversionDashboard";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Code2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Mic2,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  WandSparkles,
  Webhook,
  X,
} from "lucide-react";
import SoulChat from "@/components/SoulChat";
import OnboardingFlow from "@/components/OnboardingFlow";
import {
  createSoul,
  createWebsiteSource,
  mergeSourceCrawl,
  normalizeKnowledgeBase,
  normalizeWorkspace,
  type KnowledgePage,
  type KnowledgeBase,
  type KnowledgeSource,
  type Soul,
  type SoulConversation,
  type SoulMessage,
  type SoulWorkspace,
} from "@/lib/soul";
import { rankKnowledgeChunks, type ChatResponse } from "@/lib/conversation";
import {
  answersToReview,
  countSince,
  extractContact,
  firstQuestion,
  isLead,
  leadsToCsv,
  relativeTime,
  topQuestions,
} from "@/lib/conversation-insights";
import type { OwnerConversation } from "@/lib/integration-store";
import { streamWebsiteCrawl } from "@/lib/crawl-client";
import type { CrawlProgressEvent } from "@/lib/knowledge";
import { authClient, authFetch } from "@/lib/auth-client";
import {
  BILLING_PLANS,
  SELF_SERVE_PLAN_IDS,
  billingPlanIncludesFeature,
  formatPrice,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Soul Studio · Obseri" },
      {
        name: "description",
        content: "Build the knowledge, personality, voice, and presence behind your website.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: AuthenticatedStudio,
});

type StudioView =
  | "analytics"
  | "overview"
  | "knowledge"
  | "personality"
  | "voice"
  | "playground"
  | "deploy"
  | "conversations"
  | "billing"
  | "profile"
  | "team"
  | "settings"
  | "help";

const STORAGE_KEY = "obseri.soul-studio.v1";
const SIDEBAR_STORAGE_KEY = "obseri.sidebar-collapsed.v1";

const PAGE_META: Record<StudioView, { title: string; description: string }> = {
  analytics: {
    title: "Analytics",
    description: "Visitor journeys, contact requests, and outcomes.",
  },
  overview: { title: "Overview", description: "How your website agent is doing." },
  knowledge: { title: "Knowledge", description: "The pages and facts your soul can use." },
  personality: {
    title: "Personality",
    description: "Decide who your website is and how it behaves.",
  },
  voice: { title: "Voice", description: "Choose how your website sounds." },
  playground: {
    title: "Preview",
    description: "Experience your website and its soul exactly as a visitor will.",
  },
  deploy: { title: "Install", description: "Publish the widget and connect your systems." },
  conversations: {
    title: "Conversations",
    description: "Understand what visitors are asking for.",
  },
  billing: { title: "Plans and billing", description: "Choose and manage your plan." },
  profile: { title: "Profile", description: "Your personal account details." },
  team: { title: "Team", description: "Manage your workspace, people, and access." },
  settings: { title: "Settings", description: "Manage the selected website and its data." },
  help: { title: "Help", description: "Get support and find the right next step." },
};

/** Visitor conversations from the live widget plus Studio test sessions. */
type StudioConversation = OwnerConversation;

type StudioUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const EMPTY_WORKSPACE: SoulWorkspace = {
  id: "pending-workspace",
  name: "Obseri Workspace",
  souls: [],
  activeSoulId: null,
};

function AuthenticatedStudio() {
  const session = authClient.useSession();
  useEffect(() => {
    if (!session.isPending && !session.data?.user) {
      const invite =
        new URLSearchParams(window.location.hash.slice(1)).get("invite") ||
        new URLSearchParams(window.location.search).get("invite");
      if (invite && /^[\w-]{43}$/.test(invite))
        sessionStorage.setItem("obseri-pending-invite", invite);
      window.location.replace("/auth/sign-in?redirectTo=/app");
    }
  }, [session.data?.user, session.isPending]);

  if (session.isPending || !session.data?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f6f6] text-[#73726d]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Securing your workspace…
      </div>
    );
  }
  return (
    <TeamWorkspaceGate key={session.data.user.id} userId={session.data.user.id}>
      <SoulStudio user={session.data.user} />
    </TeamWorkspaceGate>
  );
}

function SoulStudio({ user }: { user: StudioUser }) {
  const team = useTeamWorkspace();
  const isOwner = !team || team.current.role === "owner";
  const permissions = normalizePermissions(team?.current.permissions);
  const workspaceCacheKey = `${STORAGE_KEY}:${user.id}:${team?.current.ownerId || user.id}`;
  const [loadError, setLoadError] = useState("");
  const [workspace, setWorkspace] = useState<SoulWorkspace>(DEMO_WORKSPACE);
  const [view, setView] = useState<StudioView>("overview");
  const [hydrated, setHydrated] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [quickStartUrl, setQuickStartUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [crawlEvents, setCrawlEvents] = useState<Record<string, CrawlProgressEvent[]>>({});
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [activePlan, setActivePlan] = useState<BillingPlan>(BILLING_PLANS.free);
  const [visitorConversations, setVisitorConversations] = useState<
    Record<string, OwnerConversation[]>
  >({});
  const [focusConversationId, setFocusConversationId] = useState<string | null>(null);
  const lastPersistedWorkspace = useRef<SoulWorkspace>(EMPTY_WORKSPACE);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveConflict = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const saving = useRef(false);
  const [syncStatus, setSyncStatus] = useState("Connecting…");
  const [syncCycle, setSyncCycle] = useState(0);
  const section = VIEW_SECTION[view];
  const allowedView =
    (!section || isOwner || canAccess(permissions, section)) && (view !== "billing" || isOwner);
  const readOnly = !!section && !isOwner && !canAccess(permissions, section, true);

  useEffect(() => {
    let active = true;
    async function hydrateWorkspace() {
      try {
        setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
        const response = await authFetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) throw new Error("Workspace could not be loaded.");
        const payload = (await response.json()) as { workspace: SoulWorkspace | null };
        if (!active) return;
        if (payload.workspace) {
          const savedWorkspace = normalizeWorkspace(payload.workspace);
          lastPersistedWorkspace.current = savedWorkspace;
          setWorkspace(savedWorkspace);
          setSyncStatus("All changes saved");
          setNeedsOnboarding(savedWorkspace.souls.length === 0);
        } else {
          lastPersistedWorkspace.current = EMPTY_WORKSPACE;
          setWorkspace(EMPTY_WORKSPACE);
          setNeedsOnboarding(true);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        if (active) {
          setLoadError(
            "This workspace could not be loaded. Your access may have changed. Reload to check again.",
          );
          saveConflict.current = true;
        }
      } finally {
        if (active) setHydrated(true);
      }
    }
    void hydrateWorkspace();
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => {
    let active = true;
    void authFetch("/api/billing/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const summary = (await response.json()) as BillingSummaryResponse;
        if (active) setActivePlan(summary.plan);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view") as StudioView | null;
    if (requestedView && requestedView in PAGE_META) setView(requestedView);

    const url = params.get("url")?.trim() ?? "";
    if (!url) return;
    setQuickStartUrl(url);
    setCreateOpen(true);
    params.delete("url");
    const remainingQuery = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}`,
    );
  }, []);

  useEffect(() => {
    if (!hydrated || loadError || needsOnboarding || saving.current) return;
    if (!workspaceChanges(lastPersistedWorkspace.current, workspace).length) return;
    if (isOwner) localStorage.setItem(workspaceCacheKey, JSON.stringify(workspace));
    const timer = window.setTimeout(() => {
      if (saveConflict.current) return;
      void persistWorkspace(workspace, true)
        .then(async (response) => {
          if (response.ok) return;
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          if (response.status === 409) saveConflict.current = true;
          if (response.status === 402) setWorkspace(lastPersistedWorkspace.current);
          setNotice(payload?.error?.message || "The workspace could not be saved.");
        })
        .catch(() => setNotice("The workspace could not be saved."));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [hydrated, needsOnboarding, user.id, workspace, workspaceCacheKey, syncCycle, loadError]);

  useEffect(() => {
    if (!hydrated || needsOnboarding || loadError) return;
    let active = true;
    let fetching = false;
    const poll = async () => {
      if (
        fetching ||
        saving.current ||
        saveConflict.current ||
        document.visibilityState === "hidden"
      )
        return;
      fetching = true;
      const baseline = lastPersistedWorkspace.current;
      try {
        const response = await authFetch("/api/workspace", { cache: "no-store" });
        if (!active) return;
        if (response.status === 403 || response.status === 401) {
          team?.invalidateAccess("revoked");
          saveConflict.current = true;
          localStorage.removeItem(workspaceCacheKey);
          setWorkspace(EMPTY_WORKSPACE);
          setLoadError(
            "Your workspace access changed. Reload to continue with your current permissions.",
          );
          return;
        }
        if (!response.ok) throw new Error("Connection interrupted");
        const payload = await response.json();
        if (!active) return;
        if (
          payload.access &&
          (payload.access.role !== team?.current.role ||
            JSON.stringify(normalizePermissions(payload.access.permissions)) !==
              JSON.stringify(permissions))
        ) {
          saveConflict.current = true;
          localStorage.removeItem(workspaceCacheKey);
          setWorkspace(EMPTY_WORKSPACE);
          team?.invalidateAccess("changed");
          setLoadError("Your permissions changed. Reload to see your updated access.");
          return;
        }
        if (saving.current || baseline !== lastPersistedWorkspace.current) return;
        const remote = payload.workspace ? normalizeWorkspace(payload.workspace) : EMPTY_WORKSPACE;
        if ((remote.revision || 0) !== (baseline.revision || 0)) {
          const local = workspaceRef.current;
          const merged = mergeWorkspaceChanges(remote, workspaceChanges(baseline, local));
          merged.activeSoulId = merged.souls.some((s) => s.id === local.activeSoulId)
            ? local.activeSoulId
            : remote.activeSoulId;
          lastPersistedWorkspace.current = remote;
          workspaceRef.current = merged;
          setWorkspace(merged);
        }
        setSyncStatus(
          workspaceChanges(lastPersistedWorkspace.current, workspaceRef.current).length
            ? "Changes waiting to save"
            : "All changes saved",
        );
      } catch (error) {
        if (!active) return;
        if ((error as { status?: number }).status === 409) {
          saveConflict.current = true;
          setSyncStatus("Conflicting edits · review needed");
          setNotice(
            error instanceof Error
              ? error.message
              : "Conflicting edits. Download your changes before reloading.",
          );
        } else setSyncStatus("Reconnecting… Your edits are kept here");
      } finally {
        fetching = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 3000);
    const focus = () => void poll();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [
    hydrated,
    needsOnboarding,
    loadError,
    workspaceCacheKey,
    team?.current.role,
    JSON.stringify(permissions),
  ]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [hydrated, sidebarCollapsed]);

  useEffect(() => {
    if (!notice || saveConflict.current) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const soul =
    workspace.souls.find((candidate) => candidate.id === workspace.activeSoulId) ??
    workspace.souls[0] ??
    null;
  const soulId = soul?.id ?? null;

  useEffect(() => {
    if (!hydrated || !soulId || (!isOwner && !canAccess(permissions, "conversations"))) return;
    let active = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      void authFetch(`/api/souls/${encodeURIComponent(soulId)}/conversations?limit=200`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = (await response.json()) as { conversations?: OwnerConversation[] };
          if (active && Array.isArray(payload.conversations)) {
            setVisitorConversations((current) => ({
              ...current,
              [soulId]: payload.conversations ?? [],
            }));
          }
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hydrated, soulId]);

  const allConversations: StudioConversation[] = soul
    ? [
        ...(visitorConversations[soul.id] ?? []),
        ...soul.conversations.map((conversation) => ({ ...conversation, origin: "" })),
      ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    : [];

  function openConversation(id: string) {
    setFocusConversationId(id);
    navigate("conversations");
  }

  function updateSoul(updater: (current: Soul) => Soul) {
    if (!soul) return;
    const current = workspaceRef.current;
    const next = {
      ...current,
      souls: current.souls.map((candidate) =>
        candidate.id === soul.id
          ? { ...updater(candidate), updatedAt: new Date().toISOString() }
          : candidate,
      ),
    };
    try {
      assertChangesAllowed(workspaceChanges(current, next), permissions, isOwner);
    } catch {
      setNotice(
        "You have view-only access to these settings. Ask the workspace owner for edit access.",
      );
      return;
    }
    workspaceRef.current = next;
    setWorkspace(next);
  }

  function navigate(next: StudioView) {
    setView(next);
    setMobileNav(false);
    setProfileOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === "overview") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  function openCreateWebsite() {
    if (!isOwner) {
      setNotice("Only the workspace owner can add websites.");
      return;
    }
    const limit = activePlan.limits.websites;
    if (limit !== null && workspace.souls.length >= limit) {
      setNotice(
        `${activePlan.name} supports ${limit} website${limit === 1 ? "" : "s"}. Choose a larger plan to add another.`,
      );
      navigate("billing");
      return;
    }
    setCreateOpen(true);
  }

  function persistWorkspace(value: SoulWorkspace, reconcile = false): Promise<Response> {
    const base = lastPersistedWorkspace.current;
    const pending = saveQueue.current.then(async () => {
      if (saveConflict.current) throw new Error("Reload the workspace before saving.");
      if (!workspaceChanges(base, value).length) return Response.json({ workspace: base });
      saving.current = true;
      setSyncStatus("Saving…");
      try {
        const response = await authFetch("/api/workspace", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace: value, base }),
        });
        if (response.ok) {
          const payload = await response.clone().json();
          const saved = normalizeWorkspace(payload.workspace);
          if (reconcile) {
            const local = workspaceRef.current;
            const merged = mergeWorkspaceChanges(saved, workspaceChanges(value, local));
            merged.activeSoulId = local.activeSoulId;
            workspaceRef.current = merged;
            setWorkspace(merged);
          }
          lastPersistedWorkspace.current = saved;
          setSyncStatus("All changes saved");
        } else {
          setSyncStatus("Changes not saved");
          if (response.status === 409) {
            saveConflict.current = true;
            setNotice(
              "A teammate changed the same field. Download your local edits before reloading.",
            );
          }
          if (response.status === 403 || response.status === 401) {
            saveConflict.current = true;
            localStorage.removeItem(workspaceCacheKey);
            setLoadError("Your access changed. Reload to continue with your current permissions.");
          }
        }
        return response;
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          saveConflict.current = true;
          setNotice(
            error instanceof Error
              ? error.message
              : "Conflicting edits. Download your local edits before reloading.",
          );
        }
        setSyncStatus("Changes not saved · reconnecting");
        throw error;
      } finally {
        saving.current = false;
        // Retry after a short delay if offline; never loop requests immediately.
        window.setTimeout(() => setSyncCycle((c) => c + 1), 3000);
      }
    });
    saveQueue.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  async function saveOnboardingSoul(nextSoul: Soul) {
    const pendingWorkspace: SoulWorkspace = {
      id: EMPTY_WORKSPACE.id,
      name: `${nextSoul.name} Workspace`,
      souls: [nextSoul],
      activeSoulId: nextSoul.id,
    };
    const response = await persistWorkspace(pendingWorkspace);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message || "Your website agent could not be saved.");
    }
    const payload = (await response.json()) as { workspace: SoulWorkspace };
    const savedWorkspace = normalizeWorkspace(payload.workspace);
    lastPersistedWorkspace.current = savedWorkspace;
    setWorkspace(savedWorkspace);
    if (isOwner) localStorage.setItem(workspaceCacheKey, JSON.stringify(savedWorkspace));
    setCreateOpen(false);
    setQuickStartUrl("");
    return savedWorkspace;
  }

  async function createWebsiteSoul(input: { name: string; url: string }) {
    const normalizedUrl = /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`;
    const nextSoul = createSoul(normalizedUrl, input.name);
    const pendingWorkspace: SoulWorkspace = {
      ...workspace,
      souls: [...workspace.souls, nextSoul],
      activeSoulId: nextSoul.id,
    };
    const response = await persistWorkspace(pendingWorkspace);
    const payload = (await response.json().catch(() => null)) as {
      workspace?: SoulWorkspace;
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.workspace) {
      throw new Error(payload?.error?.message || "This website could not be added.");
    }
    const savedWorkspace = normalizeWorkspace(payload.workspace);
    lastPersistedWorkspace.current = savedWorkspace;
    setWorkspace(savedWorkspace);
    setCreateOpen(false);
    setQuickStartUrl("");
    navigate("knowledge");
    setCrawlEvents((current) => ({ ...current, [nextSoul.id]: [] }));
    try {
      const knowledge = await streamWebsiteCrawl(
        { url: normalizedUrl, maxPages: 30, maxDepth: 3 },
        (event) =>
          setCrawlEvents((current) => ({
            ...current,
            [nextSoul.id]: [...(current[nextSoul.id] ?? []), event].slice(-50),
          })),
      );
      setWorkspace((current) => ({
        ...current,
        souls: current.souls.map((candidate) =>
          candidate.id === nextSoul.id
            ? {
                ...candidate,
                status: "draft",
                knowledge,
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      }));
      setNotice(`Learned ${knowledge.pages.length} pages from ${safeHost(normalizedUrl)}.`);
    } catch (error) {
      setWorkspace((current) => ({
        ...current,
        souls: current.souls.map((candidate) =>
          candidate.id === nextSoul.id
            ? {
                ...candidate,
                status: "draft",
                knowledge: {
                  ...candidate.knowledge,
                  status: "error",
                  errors: [
                    {
                      url: normalizedUrl,
                      message: error instanceof Error ? error.message : "Learning failed.",
                    },
                  ],
                },
              }
            : candidate,
        ),
      }));
      setNotice(error instanceof Error ? error.message : "Learning failed.");
    }
  }

  async function refreshKnowledge() {
    if (!soul || soul.knowledge.status === "crawling") return;
    updateSoul((current) => ({
      ...current,
      status: "learning",
      knowledge: { ...current.knowledge, status: "crawling" },
    }));
    setCrawlEvents((current) => ({ ...current, [soul.id]: [] }));
    try {
      const knowledge = normalizeKnowledgeBase(soul.knowledge, soul.siteUrl);
      const sources = knowledge.sources?.length
        ? knowledge.sources.filter(
            (source) =>
              source.status !== "paused" &&
              (source.type === "website" || source.type === "sitemap"),
          )
        : [createWebsiteSource(soul.siteUrl)];
      for (const source of sources) {
        await crawlKnowledgeSource(source, false);
      }
      setNotice("Knowledge is up to date.");
    } catch (error) {
      updateSoul((current) => ({
        ...current,
        status: "draft",
        knowledge: { ...current.knowledge, status: "error" },
      }));
      setNotice(error instanceof Error ? error.message : "Refresh failed.");
    }
  }

  async function crawlKnowledgeSource(source: KnowledgeSource, addFirst = true) {
    if (!soul) return;
    if (addFirst) {
      updateSoul((current) => {
        const knowledge = normalizeKnowledgeBase(current.knowledge, current.siteUrl);
        return {
          ...current,
          status: "learning",
          knowledge: {
            ...knowledge,
            status: "crawling",
            sources: [
              ...(knowledge.sources ?? []).filter((item) => item.id !== source.id),
              { ...source, status: "crawling" },
            ],
          },
        };
      });
    }
    setCrawlEvents((current) => ({ ...current, [soul.id]: [] }));
    try {
      const crawled = await streamWebsiteCrawl(
        {
          url: source.rootUrl,
          maxPages: source.pageLimit,
          maxDepth: source.crawlDepth,
          rendering: source.rendering ?? "auto",
          includePatterns: source.includePatterns,
          excludePatterns: source.excludePatterns,
          validators: normalizeKnowledgeBase(soul.knowledge, soul.siteUrl)
            .pages.filter((page) => page.sourceId === source.id && (page.etag || page.lastModified))
            .map((page) => ({
              url: page.url,
              etag: page.etag,
              lastModified: page.lastModified,
            })),
        },
        (event) =>
          setCrawlEvents((current) => ({
            ...current,
            [soul.id]: [...(current[soul.id] ?? []), event].slice(-80),
          })),
      );
      updateSoul((current) => ({
        ...current,
        status: current.status === "live" ? "live" : "draft",
        knowledge: mergeSourceCrawl(current.knowledge, crawled, source),
      }));
      setNotice(
        `Refreshed ${safeHost(source.rootUrl)}: ${crawled.pages.length} pages read, ${crawled.unchangedUrls?.length ?? 0} unchanged.`,
      );
    } catch (error) {
      updateSoul((current) => {
        const knowledge = normalizeKnowledgeBase(current.knowledge, current.siteUrl);
        return {
          ...current,
          status: "draft",
          knowledge: {
            ...knowledge,
            status: knowledge.pages.length ? "ready" : "error",
            sources: (knowledge.sources ?? []).map((item) =>
              item.id === source.id
                ? {
                    ...item,
                    status: "error",
                    lastError: error instanceof Error ? error.message : "Crawl failed.",
                  }
                : item,
            ),
          },
        };
      });
      setNotice(error instanceof Error ? error.message : "Crawl failed.");
      throw error;
    }
  }

  function saveConversation(messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) {
    if (
      !soul ||
      messages.length < 2 ||
      (!isOwner && !canAccess(permissions, "conversations", true))
    )
      return;
    updateSoul((current) => {
      const id = `playground-${current.id}`;
      const previous = current.conversations.find((conversation) => conversation.id === id);
      const conversation = {
        id,
        startedAt: previous?.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        channel: "playground" as const,
        visitorLabel: "Studio test",
        leadIntent,
        messages,
      };
      return {
        ...current,
        conversations: [conversation, ...current.conversations.filter((item) => item.id !== id)],
      };
    });
  }

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f7f5f2] text-sm text-[#77716e]">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Preparing your workspace…
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <OnboardingFlow
        initialUrl={quickStartUrl}
        onSave={saveOnboardingSoul}
        onEnterStudio={() => {
          setNeedsOnboarding(false);
          setView("playground");
        }}
      />
    );
  }

  if (loadError)
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <div>
          <p role="alert">{loadError}</p>
          <button className="mt-4 underline" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
          <button className="ml-6 underline" onClick={() => team?.switchTo(user.id)}>
            Open my workspace
          </button>
        </div>
      </div>
    );

  return (
    <div className="obs-app h-dvh overflow-hidden bg-[#fafaf9] text-[#0b0b0c]">
      <div className="flex h-full">
        <Sidebar
          workspace={workspace}
          soul={soul}
          view={view}
          leadCount={allConversations.filter(isLead).length}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNav}
          onClose={() => setMobileNav(false)}
          onNavigate={navigate}
          onNew={openCreateWebsite}
          onExpand={() => setSidebarCollapsed(false)}
          onSoulChange={(id) => setWorkspace((current) => ({ ...current, activeSoulId: id }))}
        />

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceSwitcher
            onTeam={() => navigate("team")}
            beforeSwitch={async () => {
              if (saveConflict.current) {
                setNotice(
                  "Reload the workspace before switching to avoid losing conflicting edits.",
                );
                return false;
              }
              try {
                const response = await persistWorkspace(workspace);
                if (response.ok) return true;
              } catch {
                /* Keep edits on screen. */
              }
              setNotice("Save failed. Please retry before switching workspaces.");
              return false;
            }}
          />
          <Topbar
            workspace={workspace}
            soul={soul}
            view={view}
            user={user}
            plan={activePlan}
            sidebarCollapsed={sidebarCollapsed}
            profileOpen={profileOpen}
            onMenu={() => setMobileNav(true)}
            onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            onProfile={() => setProfileOpen((current) => !current)}
            onNavigate={navigate}
          />

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#ecebe9] bg-white px-5 py-2 text-xs text-[#77716e]">
            <span role="status" aria-live="polite">
              {syncStatus}
            </span>
            <span>
              {readOnly
                ? "View only · ask your owner for edit access"
                : "Team changes sync automatically"}
            </span>
          </div>
          <main
            className={`mx-auto min-h-0 w-full flex-1 ${
              view === "playground" || view === "conversations"
                ? "max-w-none overflow-hidden p-0"
                : "max-w-none overflow-y-auto bg-white p-0"
            }`}
          >
            <fieldset
              disabled={readOnly && !["analytics", "conversations", "playground"].includes(view)}
              className="m-0 h-full min-h-0 min-w-0 border-0 p-0"
            >
              {!allowedView ? (
                <div className="p-8">
                  <h2 className="text-xl font-semibold">This section is not shared with you</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Ask the workspace owner to update your access in Manage team.
                  </p>
                </div>
              ) : !soul ? (
                <EmptyState onCreate={openCreateWebsite} />
              ) : view === "overview" ? (
                <OverviewView
                  soul={soul}
                  user={user}
                  plan={activePlan}
                  conversations={allConversations}
                  onNavigate={navigate}
                  onOpenConversation={openConversation}
                  onRefresh={() => void refreshKnowledge()}
                />
              ) : view === "analytics" ? (
                <ConversionDashboard
                  key={soul.id}
                  soulId={soul.id}
                  onInstall={() => navigate("deploy")}
                />
              ) : view === "knowledge" ? (
                <KnowledgeView
                  soul={soul}
                  crawlEvents={crawlEvents[soul.id] ?? []}
                  onRefresh={() => void refreshKnowledge()}
                  onAddSource={(source) => crawlKnowledgeSource(source)}
                  onUpdate={(updater) =>
                    updateSoul((current) => ({ ...current, knowledge: updater(current.knowledge) }))
                  }
                  onNotice={setNotice}
                />
              ) : view === "personality" ? (
                <PersonalitySettings
                  soul={soul}
                  onUpdate={updateSoul}
                  onInstall={() => navigate("deploy")}
                />
              ) : view === "voice" ? (
                <VoiceSettings
                  key={soul.id}
                  soul={soul}
                  onUpdate={updateSoul}
                  onInstall={() => navigate("deploy")}
                />
              ) : view === "playground" ? (
                <PlaygroundView
                  soul={soul}
                  onUpdate={updateSoul}
                  onMessagesChange={saveConversation}
                  onIntegrate={() => navigate("deploy")}
                />
              ) : view === "deploy" ? (
                <DeployView
                  soul={soul}
                  plan={activePlan}
                  onSave={async () => {
                    const response = await persistWorkspace(workspaceRef.current, true);
                    if (!response.ok) throw new Error("Save your changes before publishing.");
                    return normalizeWorkspace((await response.json()).workspace);
                  }}
                  onUpdate={updateSoul}
                  onNotice={setNotice}
                  onUpgrade={() => navigate("billing")}
                />
              ) : view === "conversations" ? (
                <ConversationsView
                  soul={soul}
                  conversations={allConversations}
                  focusId={focusConversationId}
                  onCorrect={(question, answer) => {
                    if (!isOwner && !canAccess(permissions, "knowledge", true)) return;
                    updateSoul((current) => ({
                      ...current,
                      knowledge: addApprovedAnswer(current.knowledge, question, answer),
                    }));
                    setNotice(
                      "Approved answer saved to Knowledge. Publish to update your live assistant.",
                    );
                  }}
                  onTest={() => navigate("playground")}
                  onInstall={() => navigate("deploy")}
                />
              ) : view === "billing" ? (
                <BillingView onPlanChange={setActivePlan} onClose={() => navigate("playground")} />
              ) : view === "profile" ? (
                <ProfileView />
              ) : view === "team" ? (
                <Page
                  title="Team"
                  description="Your workspace, people, and permissions."
                  hideHeader
                >
                  <div className="mx-auto w-full max-w-4xl py-6 sm:py-10">
                    <Card>
                      <SectionHeading
                        title="Workspace"
                        description="The shared home for your team’s websites."
                      />
                      <Field label="Workspace name" className="mt-5">
                        <input
                          className="clean-input"
                          value={workspace.name}
                          readOnly={!isOwner}
                          onChange={(event) =>
                            setWorkspace((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </Field>
                    </Card>
                    <TeamSettings onViewPlans={() => navigate("billing")} />
                  </div>
                </Page>
              ) : view === "settings" ? (
                <SettingsView
                  soul={soul}
                  onUpdate={updateSoul}
                  onDelete={() => {
                    if (!isOwner) {
                      setNotice("Only the owner can remove websites.");
                      return;
                    }
                    setWorkspace((current) => {
                      const souls = current.souls.filter((candidate) => candidate.id !== soul.id);
                      return { ...current, souls, activeSoulId: souls[0]?.id ?? null };
                    });
                    setView("knowledge");
                  }}
                />
              ) : (
                <HelpView />
              )}
            </fieldset>
          </main>
        </div>
      </div>

      {profileOpen && (
        <button
          aria-label="Close profile menu"
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setProfileOpen(false)}
        />
      )}
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-black/10 bg-[#1a1a19] px-4 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
          {saveConflict.current && (
            <div className="mt-2 flex gap-4">
              <button
                className="underline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "obseri-unsaved-workspace.json";
                  link.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download local edits
              </button>
              <button className="underline" onClick={() => window.location.reload()}>
                Reload latest
              </button>
            </div>
          )}
        </div>
      )}
      {createOpen && (
        <CreateSoulDialog
          initialUrl={quickStartUrl}
          onClose={() => {
            setCreateOpen(false);
            setQuickStartUrl("");
          }}
          onCreate={createWebsiteSoul}
        />
      )}
    </div>
  );
}

function Sidebar({
  workspace,
  soul,
  view,
  leadCount,
  collapsed,
  mobileOpen,
  onClose,
  onNavigate,
  onNew,
  onExpand,
  onSoulChange,
}: {
  workspace: SoulWorkspace;
  soul: Soul | null;
  view: StudioView;
  leadCount: number;
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onNavigate: (view: StudioView) => void;
  onNew: () => void;
  onExpand: () => void;
  onSoulChange: (id: string) => void;
}) {
  const [soulMenuOpen, setSoulMenuOpen] = useState(false);
  const team = useTeamWorkspace();
  const allowed = (view: StudioView) =>
    !VIEW_SECTION[view] ||
    !team ||
    team.current.role === "owner" ||
    canAccess(normalizePermissions(team.current.permissions), VIEW_SECTION[view]!);

  const groups: Array<{
    label: string;
    items: Array<{ id: StudioView; label: string; icon: ReactNode; badge?: number }>;
  }> = [
    { label: "", items: [{ id: "overview", label: "Overview", icon: <LayoutDashboard /> }] },
    {
      label: "Build",
      items: [
        { id: "knowledge", label: "Knowledge", icon: <BookOpen /> },
        { id: "personality", label: "Personality", icon: <Fingerprint /> },
        { id: "voice", label: "Voice", icon: <Mic2 /> },
      ],
    },
    {
      label: "Launch",
      items: [
        { id: "playground", label: "Preview", icon: <Monitor /> },
        { id: "deploy", label: "Install", icon: <Code2 /> },
      ],
    },
    {
      label: "Results",
      items: [
        { id: "analytics", label: "Analytics", icon: <Activity /> },
        {
          id: "conversations",
          label: "Conversations",
          icon: <MessageCircle />,
          badge: leadCount,
        },
      ],
    },
  ];
  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[252px] shrink-0 flex-col overflow-hidden border-r border-[#e3e3e1] bg-white transition-[width,transform] duration-300 ease-out lg:static lg:translate-x-0 ${collapsed ? "lg:w-[72px]" : "lg:w-[252px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between px-5 transition-[padding] duration-300 ${collapsed ? "lg:px-4" : "lg:px-5"}`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate("overview");
              onClose();
            }}
            className="inline-flex min-w-0 items-center overflow-hidden"
            aria-label="Open overview"
          >
            <img
              src="/obseri-logo-dark.svg"
              alt=""
              className={`h-7 w-auto ${collapsed ? "lg:hidden" : ""}`}
            />
            <img
              src="/obseri-pulse-mark.svg"
              alt=""
              className={`hidden h-8 w-8 ${collapsed ? "lg:block" : ""}`}
            />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#73726d] hover:bg-[#f2f2f1] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative px-3 pb-3">
          {soulMenuOpen && (
            <button
              className="fixed inset-0 z-[55] cursor-default"
              onClick={() => setSoulMenuOpen(false)}
              aria-label="Close website menu"
            />
          )}
          <div className="relative z-[60]">
            <button
              onClick={() => {
                if (collapsed && window.matchMedia("(min-width: 1024px)").matches) {
                  onExpand();
                  setSoulMenuOpen(true);
                  return;
                }
                setSoulMenuOpen((current) => !current);
              }}
              className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-[#dfdedb] bg-white p-2 text-left shadow-sm transition hover:border-[#d1d0cc] hover:bg-[#fafafa] ${collapsed ? "lg:justify-center lg:p-1.5" : ""}`}
              aria-expanded={soulMenuOpen}
              aria-label={collapsed ? `Open ${soul?.name || "website"} menu` : undefined}
              title={collapsed ? soul?.name || "Choose a website" : undefined}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-[#f3f3f2] ${collapsed ? "lg:h-8 lg:w-8" : ""}`}
              >
                <img
                  src={websiteFaviconUrl(soul?.siteUrl || "https://obseri.com")}
                  alt=""
                  className="h-6 w-6 rounded-sm object-contain"
                />
              </span>
              <span className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
                <span className="block truncate text-sm font-semibold">
                  {soul?.name || "Website"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[#8c8980]">
                  {soul ? safeHost(soul.siteUrl) : "Choose a website"}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#8c897f] transition ${soulMenuOpen ? "rotate-180" : ""} ${collapsed ? "lg:hidden" : ""}`}
              />
            </button>
          </div>

          {soulMenuOpen && (
            <div className="absolute left-3 right-3 top-[56px] z-[60] overflow-hidden rounded-xl border border-[#e0dfdd] bg-white p-1.5 shadow-[0_16px_40px_rgba(28,32,25,0.14)]">
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9f9c94]">
                Your websites
              </p>
              <div className="max-h-52 overflow-y-auto">
                {workspace.souls.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => {
                      onSoulChange(candidate.id);
                      setSoulMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${candidate.id === soul?.id ? "bg-[#f1f0ef]" : "hover:bg-[#f5f5f4]"}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/5 bg-[#f3f3f2]">
                      <img
                        src={websiteFaviconUrl(candidate.siteUrl)}
                        alt=""
                        loading="lazy"
                        className="h-4.5 w-4.5 rounded-sm object-contain"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{candidate.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#908d85]">
                        {safeHost(candidate.siteUrl)}
                      </span>
                    </span>
                    {candidate.id === soul?.id && <Check className="h-3.5 w-3.5 text-[#0b0b0c]" />}
                  </button>
                ))}
              </div>
              {(!team || team.current.role === "owner") && (
                <>
                  <div className="my-1 h-px bg-[#ececeb]" />
                  <button
                    onClick={() => {
                      setSoulMenuOpen(false);
                      onNew();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#0b0b0c] hover:bg-[#f1f0ef]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#dbdad7] bg-white">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                    Add another website
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {groups.map((group) => (
            <div key={group.label || "home"} className={group.label ? "mt-5" : ""}>
              {group.label && (
                <p
                  className={`obs-mono mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#a3a29d] ${collapsed ? "lg:hidden" : ""}`}
                >
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items
                  .filter((item) => allowed(item.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === item.id ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:bg-[#f3f3f1] hover:text-[#0b0b0c]"}`}
                      aria-label={item.label}
                      aria-current={view === item.id ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">{item.icon}</span>
                      <span className={`flex-1 text-left ${collapsed ? "lg:hidden" : ""}`}>
                        {item.label}
                      </span>
                      {Boolean(item.badge) && (
                        <span
                          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold ${view === item.id ? "bg-white/20 text-white" : "bg-[#ff5c7a] text-white"} ${collapsed ? "lg:absolute lg:right-1.5 lg:top-1 lg:min-w-4 lg:px-1 lg:py-0 lg:text-[9px]" : ""}`}
                          title={`${item.badge} leads`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#ecebe9] p-3">
          <button
            hidden={!!team && team.current.role !== "owner"}
            onClick={() => onNavigate("billing")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === "billing" ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:bg-[#f3f3f1]"}`}
            aria-label="Plans and billing"
            title={collapsed ? "Plans and billing" : undefined}
          >
            <CreditCard className="h-[18px] w-[18px]" />
            <span className={collapsed ? "lg:hidden" : ""}>Plans</span>
          </button>
          <button
            hidden={!allowed("settings")}
            onClick={() => onNavigate("settings")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === "settings" ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:bg-[#f3f3f1]"}`}
            aria-label="Settings"
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="h-[18px] w-[18px]" />
            <span className={collapsed ? "lg:hidden" : ""}>Settings</span>
          </button>
          <button
            onClick={() => onNavigate("help")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === "help" ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:bg-[#f3f3f1]"}`}
            aria-label="Help"
            title={collapsed ? "Help" : undefined}
          >
            <CircleHelp className="h-[18px] w-[18px]" />
            <span className={collapsed ? "lg:hidden" : ""}>Help</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  workspace,
  soul,
  view,
  user,
  plan,
  sidebarCollapsed,
  profileOpen,
  onMenu,
  onToggleSidebar,
  onProfile,
  onNavigate,
}: {
  workspace: SoulWorkspace;
  soul: Soul | null;
  view: StudioView;
  user: StudioUser;
  plan: BillingPlan;
  sidebarCollapsed: boolean;
  profileOpen: boolean;
  onMenu: () => void;
  onToggleSidebar: () => void;
  onProfile: () => void;
  onNavigate: (view: StudioView) => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const setupSteps = soul ? getSetupSteps(soul) : [];
  const completeSteps = setupSteps.filter((step) => step.done).length;

  useEffect(() => {
    if (profileOpen) setSetupOpen(false);
  }, [profileOpen]);

  return (
    <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#e3e3e1] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-[#6a6964] hover:bg-[#f2f2f1] lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#666561] transition hover:bg-[#f1f1f0] hover:text-[#181817] lg:flex"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden truncate text-[#8a8984] sm:inline">
            {soul?.name ?? workspace.name}
          </span>
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[#c4c3be] sm:block" />
          <span className="truncate font-semibold tracking-[-0.01em]">{PAGE_META[view].title}</span>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {soul && completeSteps < setupSteps.length && (
          <div className="relative z-50 hidden sm:block">
            {setupOpen && (
              <button
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setSetupOpen(false)}
                aria-label="Close setup progress"
              />
            )}
            <button
              onClick={() => {
                if (profileOpen) onProfile();
                setSetupOpen((current) => !current);
              }}
              className="relative z-50 inline-flex h-9 items-center gap-2 rounded-full border border-[#e2e2df] bg-white pl-2 pr-3.5 text-[13px] font-medium transition hover:bg-[#f5f5f3]"
              aria-label="Open setup progress"
              aria-expanded={setupOpen}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background: `conic-gradient(#ff5c7a ${(completeSteps / setupSteps.length) * 360}deg, #d9d8d4 0deg)`,
                }}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] text-[#0b0b0c]">
                  {completeSteps}
                </span>
              </span>
              Setup {completeSteps}/{setupSteps.length}
            </button>
            {setupOpen && (
              <div className="absolute right-0 top-11">
                <SetupProgressMenu
                  soul={soul}
                  steps={setupSteps}
                  onNavigate={(next) => {
                    setSetupOpen(false);
                    onNavigate(next);
                  }}
                />
              </div>
            )}
          </div>
        )}
        {soul && (
          <a
            href={soul.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-[#6f6e69] transition hover:bg-[#f3f3f1] hover:text-[#0b0b0c] md:inline-flex"
            title={`Open ${safeHost(soul.siteUrl)}`}
          >
            <Globe2 className="h-3.5 w-3.5" /> {safeHost(soul.siteUrl)}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <div className="relative z-50">
          <button
            onClick={() => {
              setSetupOpen(false);
              onProfile();
            }}
            className="flex items-center gap-2 rounded-full border border-[#dfdedb] bg-white p-1 pr-2 shadow-sm hover:bg-[#f6f6f6]"
            aria-expanded={profileOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b0b0c] text-xs font-semibold text-white">
              {userInitials(user)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#777671]" />
          </button>
          {profileOpen && (
            <ProfileMenu soul={soul} workspace={workspace} plan={plan} onNavigate={onNavigate} />
          )}
        </div>
      </div>
    </header>
  );
}

type SetupStep = {
  view: StudioView;
  icon: ReactNode;
  title: string;
  detail: string;
  done: boolean;
};

function getSetupSteps(soul: Soul): SetupStep[] {
  return [
    {
      view: "knowledge",
      icon: <BookOpen />,
      title: "Website knowledge",
      detail: soul.knowledge.pages.length
        ? `${soul.knowledge.pages.length} pages ready`
        : "Add and crawl your website",
      done: soul.knowledge.pages.length > 0,
    },
    {
      view: "personality",
      icon: <Fingerprint />,
      title: "Personality",
      detail: soul.personality.name
        ? `${soul.personality.name} · ${soul.personality.tone}`
        : "Choose its identity and tone",
      done: soul.personality.name.trim().length > 0,
    },
    {
      view: "voice",
      icon: <Mic2 />,
      title: "Voice",
      detail: soul.voice.enabled ? soul.voice.profileName : "Choose how it sounds",
      done: soul.voice.enabled,
    },
    {
      view: "deploy",
      icon: <Code2 />,
      title: "Website installation",
      detail: soul.status === "live" ? "Live on your website" : "Install and publish the widget",
      done: soul.status === "live",
    },
  ];
}

function SetupProgressMenu({
  soul,
  steps,
  onNavigate,
}: {
  soul: Soul;
  steps: SetupStep[];
  onNavigate: (view: StudioView) => void;
}) {
  const complete = steps.filter((step) => step.done).length;
  const percentage = Math.round((complete / steps.length) * 100);

  return (
    <div className="z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#e0dfdd] bg-white shadow-[0_20px_60px_rgba(25,29,22,0.18)]">
      <div className="border-b border-[#ececeb] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Website setup</p>
            <p className="mt-1 truncate text-xs text-[#7c7a74]">{soul.name}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f1f0ef] px-2.5 py-1 text-[11px] font-semibold text-[#615f5b]">
            {complete} of {steps.length}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9e9e7]">
          <div
            className="h-full rounded-full bg-[#0b0b0c] transition-[width] duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="p-2">
        {steps.map((step) => (
          <button
            key={step.view}
            onClick={() => onNavigate(step.view)}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f5f5f4]"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-4 [&_svg]:w-4 ${step.done ? "bg-[#ebeae8] text-[#0b0b0c]" : "bg-[#f0f0ef] text-[#797771]"}`}
            >
              {step.done ? <Check /> : step.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{step.title}</span>
              <span className="mt-0.5 block truncate text-xs text-[#7f7d77]">{step.detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a6a49d] transition group-hover:translate-x-0.5 group-hover:text-[#595854]" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[#ececeb] bg-[#fafafa] px-4 py-3 text-xs text-[#73726d]">
        <span
          className={`h-2 w-2 rounded-full ${complete === steps.length ? "bg-[#22c55e]" : "bg-[#c4a14e]"}`}
        />
        {complete === steps.length
          ? "Your website soul is fully set up."
          : `${steps.length - complete} setup ${steps.length - complete === 1 ? "step" : "steps"} remaining.`}
      </div>
    </div>
  );
}

function userInitials(user: { name?: string | null; email?: string | null } | undefined) {
  const displayName = user?.name || user?.email?.split("@")[0] || "";
  return (
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "O"
  );
}

function ProfileMenu({
  soul,
  workspace,
  plan,
  onNavigate,
}: {
  soul: Soul | null;
  workspace: SoulWorkspace;
  plan: BillingPlan;
  onNavigate: (view: StudioView) => void;
}) {
  const session = authClient.useSession();
  const user = session.data?.user;
  const displayName = user?.name || user?.email?.split("@")[0] || "Obseri user";
  const initials = userInitials(user);
  const pageLimit = plan.limits.indexedPages;
  const pagesUsed = soul?.knowledge.pages.length ?? 0;
  const websiteLimit = plan.limits.websites;
  return (
    <div className="absolute right-0 top-12 z-50 w-[310px] overflow-hidden rounded-2xl border border-[#dfdedb] bg-white p-2 shadow-[0_18px_55px_rgba(0,0,0,.14)]">
      <div className="p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#212120] text-sm font-semibold text-white">
            {initials || "O"}
          </span>
          <div>
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="max-w-[210px] truncate text-xs text-[#7f7d78]">{user?.email}</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[#e5e5e3] bg-[#f9f9f9] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#767570]">Current plan</span>
          <span className="rounded-full bg-[#0b0b0c] px-2.5 py-1 text-xs font-semibold text-white">
            {plan.name}
          </span>
        </div>
        {pageLimit !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3e2e0]">
            <div
              className="h-full rounded-full bg-[#0b0b0c]"
              style={{ width: `${Math.min(100, (pagesUsed / Math.max(pageLimit, 1)) * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-[#7b7974]">
          {pagesUsed.toLocaleString("en-IN")}
          {pageLimit !== null ? ` of ${pageLimit.toLocaleString("en-IN")}` : ""} pages ·{" "}
          {workspace.souls.length}
          {websiteLimit !== null ? ` of ${websiteLimit}` : ""} website
          {(websiteLimit ?? workspace.souls.length) === 1 ? "" : "s"}
        </p>
      </div>
      <div className="my-2 h-px bg-[#ecebe9]" />
      <MenuRow icon={<UserRound />} label="Profile" onClick={() => onNavigate("profile")} />
      <MenuRow icon={<Users />} label="Team" onClick={() => onNavigate("team")} />
      <MenuRow
        icon={<CreditCard />}
        label="Plans and billing"
        onClick={() => onNavigate("billing")}
      />
      <MenuRow icon={<Settings />} label="Settings" onClick={() => onNavigate("settings")} />
      <div className="my-2 h-px bg-[#ecebe9]" />
      <button
        type="button"
        onClick={() => {
          if (user?.id) localStorage.removeItem(`${STORAGE_KEY}:${user.id}`);
          localStorage.removeItem(STORAGE_KEY);
          void authClient.signOut().finally(() => window.location.replace("/auth/sign-in"));
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#595854] hover:bg-[#f3f3f2]"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#52514e] hover:bg-[#f3f3f2] [&_svg]:h-4 [&_svg]:w-4"
    >
      {icon}
      {label}
    </button>
  );
}

function KnowledgeView({
  soul,
  crawlEvents,
  onRefresh,
  onAddSource,
  onUpdate,
  onNotice,
}: {
  soul: Soul;
  crawlEvents: CrawlProgressEvent[];
  onRefresh: () => void;
  onAddSource: (source: KnowledgeSource) => Promise<void>;
  onUpdate: (updater: (knowledge: KnowledgeBase) => KnowledgeBase) => void;
  onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const knowledge = normalizeKnowledgeBase(soul.knowledge, soul.siteUrl);
  const sources = knowledge.sources ?? [];
  const pages = knowledge.pages.filter((page) => {
    const matchesQuery = `${page.title} ${page.url} ${page.description} ${page.content ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesQuery;
  });
  const blockCount = knowledge.pages.reduce(
    (total, page) => total + (page.enabled === false ? 0 : page.chunks.length),
    0,
  );
  const selectedPage = knowledge.pages.find((page) => page.id === selectedPageId) ?? null;
  const retrievalHits = testQuery.trim()
    ? rankKnowledgeChunks(testQuery, activeKnowledgeChunks(knowledge)).slice(0, 5)
    : [];

  function addManualSource(name: string, content: string) {
    const now = new Date().toISOString();
    const source: KnowledgeSource = {
      id: `source-manual-${crypto.randomUUID()}`,
      type: "manual",
      name: name.trim(),
      rootUrl: `manual://${crypto.randomUUID()}`,
      status: "ready",
      pageLimit: 1,
      crawlDepth: 0,
      cadence: "manual",
      includePatterns: [],
      excludePatterns: [],
      autoRemoveMissing: false,
      createdAt: now,
      lastCrawledAt: now,
    };
    const page = buildManualKnowledgePage(source, name, content, now);
    onUpdate((value) => {
      const current = normalizeKnowledgeBase(value, soul.siteUrl);
      return {
        ...current,
        status: "ready",
        pages: [...current.pages, page],
        sources: [...(current.sources ?? []), source],
        revisions: [
          ...(current.revisions ?? []),
          {
            id: `${page.id}-r1`,
            pageId: page.id,
            contentHash: page.hash,
            capturedAt: now,
            reason: "manual_edit",
            wordCount: page.wordCount,
          },
        ],
      };
    });
    onNotice("Manual knowledge added.");
  }

  return (
    <Page title="Knowledge" description="The pages and facts your soul can use." hideHeader>
      {(crawlEvents.length > 0 || soul.knowledge.status === "crawling") && (
        <CrawlProgressPanel events={crawlEvents} />
      )}
      <div className="grid min-h-[calc(100vh-64px)] xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="h-full overflow-hidden border-b-0 p-0 xl:border-r">
          <div className="flex flex-col gap-5 border-b border-[#e9e8e6] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[15px] font-semibold">Knowledge library</h2>
                  <span className="rounded-full bg-[#eeedec] px-2 py-0.5 text-[10px] font-semibold text-[#0b0b0c]">
                    {knowledge.pages.filter((page) => page.enabled !== false).length} active
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#817f79]">
                  {sources.length} {sources.length === 1 ? "source" : "sources"} · {blockCount}{" "}
                  searchable blocks
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onRefresh}
                  disabled={knowledge.status === "crawling"}
                  className="secondary-button h-10 px-3.5 text-xs disabled:opacity-50"
                >
                  {knowledge.status === "crawling" ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh all
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  className="primary-button h-10 px-4 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add source
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-b border-[#e9e8e6] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="relative w-full sm:max-w-[380px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#98958d]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles, URLs, and content"
                className="h-9 w-full rounded-lg border border-[#e0dfdd] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#b4b4b0]"
              />
            </div>
            <p className="text-[11px] text-[#82807a]">{pages.length} documents</p>
          </div>
          {!pages.length && soul.knowledge.status === "crawling" ? (
            <div className="flex items-center gap-3 px-6 py-8 text-sm text-[#6a6863]">
              <LoaderCircle className="h-4 w-4 animate-spin text-[#0b0b0c]" />
              Pages will appear here when they are ready.
            </div>
          ) : pages.length ? (
            <div className="divide-y divide-[#ecebe9]">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-[#fafafa] sm:px-6"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e6e5e3] bg-[#f5f5f4] text-[#6e6d68]">
                    <FileText className="h-[15px] w-[15px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#272725]">
                      {page.title || safeHost(page.url)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[#8c8980]">
                      {knowledgePagePath(page.url)}
                    </p>
                  </div>
                  <span
                    className={`hidden rounded-full px-2 py-1 text-[10px] font-medium sm:block ${page.enabled === false ? "bg-[#f0f0ef] text-[#918e86]" : page.changeType === "changed" || page.changeType === "new" ? "bg-[#eeedec] text-[#0b0b0c]" : "bg-[#f3f3f2] text-[#787671]"}`}
                  >
                    {page.enabled === false
                      ? "Excluded"
                      : page.changeType === "new"
                        ? "New"
                        : page.changeType === "changed"
                          ? "Updated"
                          : `${page.chunks.length} blocks`}
                  </span>
                  <span className="hidden text-[10px] text-[#918e86] md:block">
                    {formatBytes(page.sizeBytes ?? 0)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#a09d95]" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel
              icon={<BookOpen />}
              title="No pages found"
              detail={
                query ? "Try a different search." : "Add a website to start building knowledge."
              }
              action={
                !query ? (
                  <button onClick={() => setAddOpen(true)} className="primary-button">
                    <Plus className="h-4 w-4" />
                    Add website
                  </button>
                ) : undefined
              }
            />
          )}
        </Card>
        <Card className="h-full border-b-0 p-0">
          <details open className="h-full">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f0ef] text-[#0b0b0c]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Retrieval lab</h3>
                  <p className="mt-0.5 text-[11px] text-[#83817b]">
                    See exactly what the assistant will retrieve before it answers.
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#939087]" />
            </summary>
            <div className="border-t border-[#e9e8e6] px-5 py-5 sm:px-6">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#959289]" />
                <input
                  value={testQuery}
                  onChange={(event) => setTestQuery(event.target.value)}
                  placeholder="Try a real visitor question, e.g. What does the Pro plan include?"
                  className="clean-input pl-10"
                />
              </div>
              <KnowledgeAnswerTest soul={soul} question={testQuery} />
              {testQuery.trim() && (
                <div className="mt-4 space-y-2">
                  {retrievalHits.length ? (
                    retrievalHits.map((hit, index) => (
                      <button
                        key={hit.id}
                        onClick={() =>
                          setSelectedPageId(
                            knowledge.pages.find((page) => page.url === hit.pageUrl)?.id ?? null,
                          )
                        }
                        className="flex w-full gap-3 rounded-xl border border-[#e6e5e3] p-3 text-left hover:bg-[#fafafa]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#efeeed] text-[10px] font-bold text-[#0b0b0c]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs font-semibold">{hit.pageTitle}</span>
                            <span className="shrink-0 text-[10px] text-[#72706b]">
                              score {hit.score.toFixed(2)}
                            </span>
                          </span>
                          <span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-[#787671]">
                            {hit.text}
                          </span>
                          <span className="mt-1.5 block text-[10px] text-[#918e86]">
                            Matched {hit.matchedTerms.join(", ")}
                            {hit.phraseMatch ? " · exact phrase" : ""}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-xl bg-[#f7f7f6] p-4 text-xs text-[#7c7a74]">
                      No matching evidence yet. Add an approved answer or a relevant source, then
                      test again.
                    </p>
                  )}
                </div>
              )}
            </div>
          </details>
        </Card>
      </div>
      {!!soul.knowledge.errors.length && (
        <div className="rounded-2xl border border-[#efd7cf] bg-[#fff8f5] p-5">
          <h3 className="text-sm font-semibold text-[#8f4938]">Some pages could not be read</h3>
          <div className="mt-3 space-y-2">
            {soul.knowledge.errors.slice(0, 5).map((error) => (
              <p key={`${error.url}-${error.message}`} className="text-sm text-[#976253]">
                {safeHost(error.url)} — {error.message}
              </p>
            ))}
          </div>
        </div>
      )}
      {addOpen && (
        <AddKnowledgeSourceDialog
          onClose={() => setAddOpen(false)}
          onWebsite={async (source) => {
            setAddOpen(false);
            await onAddSource(source);
          }}
          onDocument={(imported) => {
            onUpdate((current) => ({
              ...current,
              status: "ready",
              pages: [...current.pages, ...imported.pages],
              sources: [...(current.sources ?? []), ...(imported.sources ?? [])],
              errors: [...current.errors, ...imported.errors],
            }));
            setAddOpen(false);
            onNotice(
              `Imported ${imported.pages.length} PDF pages.${imported.errors.length ? " Some pages need OCR; see source warnings." : ""} Publish to update the live assistant.`,
            );
          }}
          onManual={(name, content) => {
            addManualSource(name, content);
            setAddOpen(false);
          }}
        />
      )}
      {selectedPage && (
        <KnowledgeDocumentDialog
          page={selectedPage}
          source={sources.find((source) => source.id === selectedPage.sourceId)}
          revisions={(knowledge.revisions ?? []).filter(
            (revision) => revision.pageId === selectedPage.id,
          )}
          onClose={() => setSelectedPageId(null)}
          onSave={(content) => {
            onUpdate((value) => updateKnowledgePageContent(value, selectedPage.id, content));
            onNotice("Document override saved.");
          }}
          onToggle={(enabled) =>
            onUpdate((value) => updateKnowledgePage(value, selectedPage.id, { enabled }))
          }
          onDelete={() => {
            onUpdate((value) => ({
              ...value,
              pages: value.pages.filter((page) => page.id !== selectedPage.id),
              revisions: (value.revisions ?? []).filter(
                (revision) => revision.pageId !== selectedPage.id,
              ),
            }));
            setSelectedPageId(null);
            onNotice("Document deleted.");
          }}
        />
      )}
      <OperationHealth />
    </Page>
  );
}

function AddKnowledgeSourceDialog({
  onClose,
  onWebsite,
  onManual,
  onDocument,
}: {
  onClose: () => void;
  onWebsite: (source: KnowledgeSource) => Promise<void>;
  onManual: (name: string, content: string) => void;
  onDocument: (knowledge: KnowledgeBase) => void;
}) {
  const [kind, setKind] = useState<"website" | "manual" | "pdf">("website");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pageLimit, setPageLimit] = useState(40);
  const [crawlDepth, setCrawlDepth] = useState(4);
  const [cadence, setCadence] = useState<KnowledgeSource["cadence"]>("manual");
  const [pdf, setPdf] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [rendering, setRendering] = useState<"auto" | "always" | "never">("auto");
  const [excludePatterns, setExcludePatterns] = useState("/admin/*, /account/*, /search*");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (importing) return;
    setError("");
    if (kind === "pdf") {
      if (!pdf || pdf.size > 3_000_000) {
        setError("Choose a PDF smaller than 3 MB.");
        return;
      }
      setImporting(true);
      try {
        const response = await authFetch("/api/knowledge/pdf", {
          method: "POST",
          headers: {
            "content-type": "application/pdf",
            "x-file-name": encodeURIComponent(pdf.name),
          },
          body: pdf,
        });
        const result = (await response.json()) as {
          knowledge?: KnowledgeBase;
          error?: { message?: string };
        };
        if (!response.ok || !result.knowledge)
          throw new Error(result.error?.message || "PDF import failed.");
        onDocument(result.knowledge);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "PDF import failed.");
      } finally {
        setImporting(false);
      }
      return;
    }
    if (kind === "manual") {
      if (name.trim().length < 2 || content.trim().length < 40) {
        setError("Give the source a name and add at least 40 characters of useful content.");
        return;
      }
      onManual(name.trim(), content.trim());
      return;
    }
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    try {
      const parsed = new URL(normalized);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setError("Enter a valid public website URL.");
      return;
    }
    const source = createWebsiteSource(normalized);
    source.name = name.trim() || safeHost(normalized);
    source.pageLimit = pageLimit;
    source.crawlDepth = crawlDepth;
    source.cadence = cadence;
    source.rendering = rendering;
    source.excludePatterns = excludePatterns
      .split(",")
      .map((pattern) => pattern.trim())
      .filter(Boolean);
    void onWebsite(source).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "The source could not be added."),
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={submit}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-black/10 bg-white shadow-[0_30px_90px_rgba(0,0,0,.18)]"
      >
        <div className="flex items-start justify-between border-b border-[#e9e8e6] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Add knowledge source</h2>
            <p className="mt-1 text-xs text-[#82807a]">
              Connect a site, upload a PDF, or add trusted text.
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-button">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f3f3f2] p-1">
            <button
              type="button"
              onClick={() => setKind("website")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === "website" ? "bg-white shadow-sm" : "text-[#787671]"}`}
            >
              <Globe2 className="mr-2 inline h-3.5 w-3.5" />
              Website crawl
            </button>
            <button
              type="button"
              onClick={() => setKind("manual")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === "manual" ? "bg-white shadow-sm" : "text-[#787671]"}`}
            >
              <FileText className="mr-2 inline h-3.5 w-3.5" />
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setKind("pdf")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === "pdf" ? "bg-white shadow-sm" : "text-[#787671]"}`}
            >
              <FileText className="mr-2 inline h-3.5 w-3.5" />
              PDF upload
            </button>
          </div>
          {kind === "website" ? (
            <>
              <Field label="Website URL" className="mt-5">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  autoFocus
                  placeholder="https://docs.yoursite.com"
                  className="clean-input"
                />
              </Field>
              <Field label="Source name" hint="Optional" className="mt-4">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Product documentation"
                  className="clean-input"
                />
              </Field>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Field label="Page limit">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={pageLimit}
                    onChange={(event) =>
                      setPageLimit(Math.max(1, Math.min(50, Number(event.target.value))))
                    }
                    className="clean-input"
                  />
                </Field>
                <Field label="Crawl depth">
                  <select
                    value={crawlDepth}
                    onChange={(event) => setCrawlDepth(Number(event.target.value))}
                    className="clean-input"
                  >
                    <option value={1}>1 level</option>
                    <option value={2}>2 levels</option>
                    <option value={3}>3 levels</option>
                    <option value={4}>4 levels</option>
                  </select>
                </Field>
                <Field label="Refresh">
                  <select
                    value={cadence}
                    onChange={(event) =>
                      setCadence(event.target.value as KnowledgeSource["cadence"])
                    }
                    className="clean-input"
                  >
                    <option value="manual">Manual</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
              </div>
              <Field label="JavaScript content" className="mt-4">
                <select
                  className="clean-input"
                  value={rendering}
                  onChange={(event) => setRendering(event.target.value as typeof rendering)}
                >
                  <option value="auto">Automatic — render app shells when needed</option>
                  <option value="always">Always render — for dynamic websites</option>
                  <option value="never">HTML only — fastest</option>
                </select>
              </Field>
              <Field label="Exclude paths" hint="Comma separated · supports *" className="mt-4">
                <input
                  value={excludePatterns}
                  onChange={(event) => setExcludePatterns(event.target.value)}
                  placeholder="/admin/*, /account/*"
                  className="clean-input font-mono text-xs"
                />
              </Field>
              <div className="mt-4 rounded-xl border border-[#e3e3e1] bg-[#f6f6f6] p-3 text-[11px] leading-5 text-[#65635f]">
                Obseri respects robots.txt, discovers sitemaps and llms.txt, removes duplicate
                pages, and shows every crawl step live.
              </div>
            </>
          ) : kind === "pdf" ? (
            <Field
              label="PDF document"
              hint="Up to 3 MB · 50 pages · selectable text"
              className="mt-5"
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={importing}
                onChange={(event) => setPdf(event.target.files?.[0] ?? null)}
                className="clean-input"
              />
              <p className="mt-3 text-xs leading-5 text-[#787671]">
                Each page becomes searchable knowledge. Scanned images need OCR first. The extracted
                text stays in your workspace; the original file is not published.
              </p>
            </Field>
          ) : (
            <>
              <Field label="Source name" className="mt-5">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  placeholder="Refund policy"
                  className="clean-input"
                />
              </Field>
              <Field
                label="Trusted content"
                hint={`${content.length.toLocaleString()} characters`}
                className="mt-4"
              >
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={10}
                  placeholder="Paste FAQs, policies, product facts, or internal guidance..."
                  className="clean-input resize-none"
                />
              </Field>
            </>
          )}
          {error && (
            <p className="mt-4 rounded-xl bg-[#fff3ef] p-3 text-xs text-[#984c3b]">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e9e8e6] px-6 py-4">
          <button type="button" onClick={onClose} className="secondary-button">
            Cancel
          </button>
          <button className="primary-button" disabled={importing}>
            <Plus className="h-4 w-4" />
            {importing
              ? "Reading PDF…"
              : kind === "website"
                ? "Start crawl"
                : kind === "pdf"
                  ? "Import PDF"
                  : "Add knowledge"}
          </button>
        </div>
      </form>
    </div>
  );
}

function KnowledgeDocumentDialog({
  page,
  source,
  revisions,
  onClose,
  onSave,
  onToggle,
  onDelete,
}: {
  page: KnowledgePage;
  source?: KnowledgeSource;
  revisions: NonNullable<KnowledgeBase["revisions"]>;
  onClose: () => void;
  onSave: (content: string) => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(
    page.content ?? page.chunks.map((chunk) => chunk.text).join("\n\n"),
  );
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/25 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto flex h-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_30px_100px_rgba(0,0,0,.2)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e6e5e3] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e5e4e2] bg-[#f5f5f4]">
              <Globe2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[#8c8980]">Knowledge document</p>
              <h2 className="truncate text-[15px] font-semibold">{page.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setContent(page.content ?? "");
                    setEditing(false);
                  }}
                  className="secondary-button"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSave(content);
                    setEditing(false);
                  }}
                  className="primary-button"
                >
                  Save override
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="secondary-button">
                <WandSparkles className="h-3.5 w-3.5" />
                Edit content
              </button>
            )}
            <button onClick={onClose} className="icon-button">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[330px_1fr]">
          <aside className="overflow-y-auto border-r border-[#e6e5e3] bg-[#fafafa] p-5 sm:p-6">
            <div className="flex items-center justify-between rounded-xl border border-[#e4e3e1] bg-white p-3">
              <div>
                <p className="text-xs font-semibold">Use in answers</p>
                <p className="mt-0.5 text-[10px] text-[#8c8980]">Exclude without deleting</p>
              </div>
              <Toggle checked={page.enabled !== false} onChange={onToggle} />
            </div>
            <dl className="mt-6 space-y-5 text-xs">
              <DocumentMeta label="Source" value={source?.name ?? safeHost(page.url)} />
              <DocumentMeta label="Source URL" value={page.url} link />
              <DocumentMeta
                label="Status"
                value={
                  page.manualOverride
                    ? "Manual override"
                    : page.status === "warning"
                      ? "Needs review"
                      : "Ready"
                }
              />
              <DocumentMeta label="Last captured" value={formatDateTime(page.capturedAt)} />
              <DocumentMeta
                label="Document size"
                value={`${formatBytes(page.sizeBytes ?? 0)} · ${page.wordCount.toLocaleString()} words`}
              />
              <DocumentMeta label="Content type" value={page.contentType ?? "text/html"} />
              <DocumentMeta label="Language" value={page.language ?? "Not declared"} />
              <DocumentMeta
                label="Revision"
                value={`v${page.revision ?? 1} · ${revisions.length} recorded`}
              />
              {page.etag && <DocumentMeta label="HTTP validator" value={page.etag} />}
            </dl>
            <button
              onClick={() => {
                if (window.confirm("Delete this document from the knowledge base?")) onDelete();
              }}
              className="mt-8 flex items-center gap-2 text-xs font-semibold text-[#a35443]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete document
            </button>
          </aside>
          <main className="min-h-0 overflow-y-auto p-5 sm:p-7">
            <div className="mx-auto max-w-[760px]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#918e85]">
                    Normalized content
                  </p>
                  <p className="mt-1 text-xs text-[#7c7a74]">
                    This is the clean evidence sent to retrieval, not raw page HTML.
                  </p>
                </div>
                <span className="rounded-lg bg-[#f3f2f1] px-2.5 py-1.5 text-[10px] text-[#75746f]">
                  {page.chunks.length} chunks
                </span>
              </div>
              {editing ? (
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-[520px] w-full resize-none rounded-xl border border-[#bab8b3] bg-white p-5 font-mono text-xs leading-6 outline-none ring-4 ring-[#f0efee]"
                />
              ) : (
                <article className="whitespace-pre-wrap rounded-xl border border-[#e4e3e1] bg-[#fcfcfb] p-5 text-sm leading-7 text-[#42413f]">
                  {content || "No readable content."}
                </article>
              )}
              {!!revisions.length && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold">Revision history</h3>
                  <div className="mt-2 divide-y divide-[#ececeb] rounded-xl border border-[#e4e3e1]">
                    {[...revisions]
                      .reverse()
                      .slice(0, 8)
                      .map((revision) => (
                        <div
                          key={revision.id}
                          className="flex items-center justify-between px-4 py-3 text-[11px]"
                        >
                          <span className="font-medium capitalize">
                            {revision.reason.replace("_", " ")}
                          </span>
                          <span className="text-[#8c8980]">
                            {formatDateTime(revision.capturedAt)} ·{" "}
                            {revision.wordCount.toLocaleString()} words
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function DocumentMeta({
  label,
  value,
  link = false,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <div>
      <dt className="font-semibold text-[#4f4e4a]">{label}</dt>
      <dd className="mt-1 break-words leading-5 text-[#82807a]">
        {link && /^https?:\/\//.test(value) ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-[#0b0b0c] hover:underline"
          >
            {value} <ExternalLink className="inline h-3 w-3" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function buildManualKnowledgePage(
  source: KnowledgeSource,
  name: string,
  content: string,
  now: string,
): KnowledgePage {
  const chunks = chunkManualContent(content, source.id, name, source.rootUrl);
  return {
    id: `manual-${crypto.randomUUID()}`,
    sourceId: source.id,
    url: source.rootUrl,
    title: name,
    description: content.slice(0, 180),
    content,
    hash: stableContentHash(content),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    capturedAt: now,
    updatedAt: now,
    status: "ready",
    contentType: "text/plain",
    httpStatus: 200,
    sizeBytes: new TextEncoder().encode(content).length,
    revision: 1,
    enabled: true,
    manualOverride: true,
    changeType: "manual",
    chunks,
  };
}

function chunkManualContent(content: string, sourceId: string, title: string, url: string) {
  return splitKnowledgeText(content).map((text, order) => ({
    id: `${stableContentHash(`${url}-${order}-${text}`).slice(0, 16)}-${order}`,
    sourceId,
    pageUrl: url,
    pageTitle: title,
    text,
    order,
    tokenEstimate: Math.ceil(text.length / 4),
  }));
}

function updateKnowledgePage(
  value: KnowledgeBase,
  pageId: string,
  patch: Partial<KnowledgePage>,
): KnowledgeBase {
  return {
    ...value,
    pages: value.pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)),
  };
}

function updateKnowledgePageContent(
  value: KnowledgeBase,
  pageId: string,
  content: string,
): KnowledgeBase {
  const now = new Date().toISOString();
  const page = value.pages.find((candidate) => candidate.id === pageId);
  if (!page) return value;
  const hash = stableContentHash(content);
  const updated: KnowledgePage = {
    ...page,
    content,
    hash,
    description: content.slice(0, 180),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    sizeBytes: new TextEncoder().encode(content).length,
    capturedAt: now,
    updatedAt: now,
    revision: (page.revision ?? 1) + 1,
    manualOverride: true,
    changeType: "manual",
    status: "ready",
    chunks: chunkManualContent(content, page.sourceId ?? "manual", page.title, page.url),
  };
  return {
    ...value,
    pages: value.pages.map((candidate) => (candidate.id === pageId ? updated : candidate)),
    revisions: [
      ...(value.revisions ?? []),
      {
        id: `${pageId}-manual-${Date.now()}`,
        pageId,
        contentHash: hash,
        capturedAt: now,
        reason: "manual_edit" as const,
        wordCount: updated.wordCount,
      },
    ].slice(-500),
  };
}

function stableContentHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const part = (hash >>> 0).toString(16).padStart(8, "0");
  return part.repeat(8);
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(value < 10_240 ? 1 : 0)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CrawlProgressPanel({ events }: { events: CrawlProgressEvent[] }) {
  const latest = events.at(-1);
  const complete = latest?.stage === "complete";
  const failed = latest?.stage === "error";
  const progress = latest?.progress ?? 3;
  const stats = latest?.stats ?? {
    discovered: 1,
    queued: 1,
    fetched: 0,
    indexed: 0,
    unchanged: 0,
    skipped: 0,
    duplicates: 0,
    blocked: 0,
    errors: 0,
  };
  const recent = events
    .filter((event, index) => {
      if (event.type === "complete" || event.type === "error") return true;
      return index === 0 || event.message !== events[index - 1]?.message;
    })
    .slice(-6)
    .reverse();

  if (complete || failed) {
    return (
      <section
        className={`flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
          failed ? "border-[#efd7cf] bg-[#fff8f5]" : "border-[#dfdedb] bg-[#f7f7f7]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              failed ? "bg-[#ffebe5] text-[#a14f39]" : "bg-[#e9e8e6] text-[#0b0b0c]"
            }`}
          >
            {failed ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {failed ? "Website crawl stopped" : "Knowledge is up to date"}
            </p>
            <p className="mt-0.5 truncate text-xs text-[#797772]">
              {latest?.message ?? "Website processing finished."}
            </p>
          </div>
        </div>
        {!failed && (
          <div className="flex items-center gap-3 pl-11 text-[11px] text-[#74726d] sm:pl-0">
            <span>{stats.fetched} read</span>
            <span className="h-1 w-1 rounded-full bg-[#bcbab4]" />
            <span>{stats.indexed} learned</span>
            <span className="h-1 w-1 rounded-full bg-[#bcbab4]" />
            <span>{stats.duplicates + stats.blocked + stats.skipped} filtered</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dfdedb] bg-white shadow-[0_12px_35px_rgba(36,46,29,0.06)]">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              failed
                ? "bg-[#fff0eb] text-[#a14f39]"
                : complete
                  ? "bg-[#efeeed] text-[#0b0b0c]"
                  : "bg-[#f1f0ef] text-[#0b0b0c]"
            }`}
          >
            {failed ? (
              <X className="h-5 w-5" />
            ) : complete ? (
              <Check className="h-5 w-5" />
            ) : (
              <Globe2 className="h-5 w-5 animate-pulse" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {failed
                    ? "Crawl stopped"
                    : complete
                      ? "Website knowledge ready"
                      : "Learning your website"}
                </p>
                <p className="mt-1 truncate text-sm text-[#75746f]">
                  {latest?.message ?? "Preparing the crawler and checking website rules"}
                </p>
              </div>
              <span className="rounded-full bg-[#f2f2f1] px-3 py-1 text-xs font-semibold tabular-nums text-[#6a6964]">
                {progress}%
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#ececeb]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${failed ? "bg-[#c86e56]" : "bg-[#0b0b0c]"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e7e6e4] bg-[#e7e6e4] sm:grid-cols-4">
          {[
            ["Discovered", stats.discovered],
            ["Read", stats.fetched],
            ["Learned", stats.indexed],
            ["Filtered", stats.skipped + stats.duplicates + stats.blocked],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#fafafa] px-4 py-3">
              <p className="text-lg font-semibold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-[#807e78]">{label}</p>
            </div>
          ))}
        </div>

        {!!recent.length && (
          <div className="space-y-2.5">
            {recent.map((event, index) => (
              <div
                key={`${event.timestamp}-${event.message}-${index}`}
                className="flex min-w-0 items-center gap-3 text-sm"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {index === 0 && !complete && !failed ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-[#0b0b0c]" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-[#928f87]" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#686762]">{event.message}</span>
                {event.url && (
                  <span className="hidden max-w-[260px] truncate text-xs text-[#9a9890] lg:block">
                    {crawlUrlLabel(event.url)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PlaygroundView({
  soul,
  onUpdate,
  onMessagesChange,
  onIntegrate,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onMessagesChange: (messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) => void;
  onIntegrate: () => void;
}) {
  const previewTeam = useTeamWorkspace();
  const canCustomize =
    !previewTeam ||
    previewTeam.current.role === "owner" ||
    canAccess(previewTeam.current.permissions, "appearance", true);
  const [assistantMode, setAssistantMode] = useState<"closed" | "chat" | "voice">("closed");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [address, setAddress] = useState(soul.siteUrl);
  const [previewUrl, setPreviewUrl] = useState(soul.siteUrl);
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);
  const [addressError, setAddressError] = useState("");
  const themes: Array<{
    id: Soul["appearance"]["theme"];
    label: string;
    detail: string;
  }> = [
    { id: "light", label: "Clean", detail: "Bright and minimal" },
    { id: "dark", label: "Midnight", detail: "Focused and cinematic" },
    { id: "glass", label: "Glass", detail: "Soft and translucent" },
  ];
  const accents = ["#ff5c7a", "#0b0b0c", "#7dd3fc", "#c4b5fd", "#fda4af", "#fbbf24"];
  const updateAppearance = (patch: Partial<Soul["appearance"]>) =>
    onUpdate((current) => ({
      ...current,
      appearance: { ...current.appearance, ...patch },
      updatedAt: new Date().toISOString(),
    }));

  useEffect(() => {
    setAddress(soul.siteUrl);
    setPreviewUrl(soul.siteUrl);
    setFrameLoading(true);
    setAddressError("");
  }, [soul.id, soul.siteUrl]);

  useEffect(() => {
    // An iframe can finish before React attaches its load listener during hydration.
    // Never leave the preview looking busy when the website is already visible.
    const timer = window.setTimeout(() => setFrameLoading(false), 5000);
    return () => window.clearTimeout(timer);
  }, [previewUrl, frameKey]);

  function openAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = /^https?:\/\//i.test(address.trim())
      ? address.trim()
      : `https://${address.trim()}`;
    try {
      const url = new URL(candidate);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported protocol");
      setAddress(url.toString());
      setPreviewUrl(url.toString());
      setAddressError("");
      setFrameLoading(true);
      setFrameKey((current) => current + 1);
    } catch {
      setAddressError("Enter a valid public website URL.");
    }
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#e9e8e6]">
      <section
        aria-label="Website preview"
        className={`absolute inset-y-0 left-0 flex min-w-0 flex-col overflow-hidden bg-[#eae9e7] transition-[right] duration-300 motion-reduce:transition-none ${customizeOpen ? "right-0 lg:right-[330px]" : "right-0"}`}
      >
        <div className="absolute inset-0 flex items-stretch justify-center overflow-hidden p-0">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
            <div className="hidden h-11 shrink-0 items-center gap-3 border-b border-[#e8e7e5] bg-[#f7f7f7] px-3">
              <div className="hidden gap-1.5 sm:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b61]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f2bd45]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
              </div>
              <form onSubmit={openAddress} className="flex min-w-0 flex-1 items-center gap-2">
                <Globe2 className="h-3.5 w-3.5 shrink-0 text-[#96948b]" />
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  aria-label="Preview website URL"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#63615d] outline-none"
                />
              </form>
              <button
                onClick={() => {
                  setFrameLoading(true);
                  setFrameKey((current) => current + 1);
                }}
                className="rounded-md p-1.5 text-[#787671] hover:bg-[#eae9e7]"
                aria-label="Reload website preview"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${frameLoading ? "animate-spin" : ""}`} />
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md p-1.5 text-[#787671] hover:bg-[#eae9e7]"
                aria-label="Open website in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
              <iframe
                key={`${previewUrl}-${frameKey}`}
                src={previewUrl}
                title={`${soul.name} website preview`}
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setFrameLoading(false)}
                className="absolute inset-x-0 bottom-9 top-0 h-[calc(100%-36px)] w-full border-0 bg-white"
              />

              <div
                className={`absolute bottom-[92px] z-20 w-[410px] max-w-[calc(100%-24px)] transition-all duration-300 ${
                  soul.appearance.position === "bottom-right"
                    ? "right-3 sm:right-5"
                    : "left-3 sm:left-5"
                } ${assistantMode !== "closed" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
                style={{ height: "min(640px, calc(100% - 112px))" }}
              >
                {assistantMode !== "closed" && (
                  <SoulChat
                    soul={soul}
                    fill
                    voiceMode
                    initialPanelMode={assistantMode === "chat" ? "chat" : "voice"}
                    onClose={() => setAssistantMode("closed")}
                    onMessagesChange={onMessagesChange}
                    contactAction={<FollowUpAction soul={soul} preview />}
                  />
                )}
              </div>

              {assistantMode === "closed" && (
                <ChatLauncher
                  appearance={soul.appearance}
                  onClick={() => setAssistantMode(launcherPanel(soul.appearance))}
                  className={`absolute bottom-12 z-30 ${soul.appearance.position === "bottom-right" ? "right-4 sm:right-5" : "left-4 sm:left-5"}`}
                />
              )}

              <div className="absolute inset-x-0 bottom-0 z-20 flex h-9 items-center justify-between border-t border-black/10 bg-white/95 px-4 text-[11px] text-[#787671] backdrop-blur-xl">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22c55e]" />
                  Live simulation ·{" "}
                  {launcherMode(soul.appearance) === "both"
                    ? "chat and voice"
                    : launcherMode(soul.appearance) === "voice"
                      ? "voice only"
                      : "chat only"}
                </span>
                <span className="hidden shrink-0 text-[#a09d95] sm:inline">
                  {safeHost(previewUrl)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {customizeOpen && (
        <button
          aria-label="Close customization drawer"
          onClick={() => setCustomizeOpen(false)}
          className="absolute inset-0 z-40 bg-black/12 lg:hidden"
        />
      )}

      <aside
        aria-label="Visitor experience customization"
        aria-hidden={!customizeOpen}
        inert={!customizeOpen}
        className={`absolute inset-y-0 right-0 z-50 flex w-[330px] max-w-[calc(100%-28px)] flex-col overflow-clip border-l border-[#e0dfdd] bg-white shadow-[-20px_0_55px_rgba(20,24,18,.16)] transition-transform duration-300 motion-reduce:transition-none lg:shadow-none ${customizeOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="shrink-0 border-b border-[#ececeb] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Visitor experience</p>
              <p className="mt-1 text-xs leading-5 text-[#82807a]">
                Tune it while using the real assistant.
              </p>
            </div>
            <span className="rounded-full bg-[#eeeeed] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#0b0b0c]">
              Live
            </span>
            <button
              onClick={() => setCustomizeOpen(false)}
              className="rounded-lg p-2 text-[#7c7a74] hover:bg-[#f0f0ef]"
              aria-label="Close customization drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {addressError && (
            <p className="mt-3 text-xs font-medium text-[#a34b3e]">{addressError}</p>
          )}
        </div>

        <div
          role="region"
          aria-label="Customization settings"
          tabIndex={0}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5"
        >
          <form onSubmit={openAddress}>
            <label
              htmlFor="customize-preview-url"
              className="text-xs font-semibold uppercase tracking-[.12em] text-[#928f86]"
            >
              Preview URL
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dfdedb] px-3">
              <Globe2 className="h-4 w-4 shrink-0 text-[#98968e]" />
              <input
                id="customize-preview-url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button type="submit" className="text-xs font-semibold text-[#0b0b0c]">
                Go
              </button>
            </div>
          </form>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#928f86]">
              Chat style
            </p>
            <div className="mt-3 grid gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  aria-pressed={soul.appearance.theme === theme.id}
                  onClick={() => updateAppearance({ theme: theme.id })}
                  className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                    soul.appearance.theme === theme.id
                      ? "border-[#ff5c7a] bg-[#f3f3f2]"
                      : "border-[#e5e4e2] hover:border-[#d1d0cc] hover:bg-[#fafaf9]"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{theme.label}</span>
                    <span className="mt-0.5 block text-xs text-[#88857c]">{theme.detail}</span>
                  </span>
                  {soul.appearance.theme === theme.id && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1f1e1d] text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#928f86]">
              Brand color
            </p>
            <p className="mt-1 text-xs text-[#8a8880]">
              Colors your message bubbles and action buttons.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {accents.map((accent) => (
                <button
                  key={accent}
                  onClick={() => updateAppearance({ accent })}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition hover:scale-105 ${
                    soul.appearance.accent.toLowerCase() === accent.toLowerCase()
                      ? "border-[#232321]"
                      : "border-transparent"
                  }`}
                  aria-label={`Use accent ${accent}`}
                  aria-pressed={soul.appearance.accent.toLowerCase() === accent.toLowerCase()}
                >
                  <span
                    className="h-6 w-6 rounded-full shadow-inner"
                    style={{ backgroundColor: accent }}
                  />
                </button>
              ))}
              <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#dfdedb] bg-[#f6f6f5] text-xs text-[#7c7a74] hover:bg-[#eeeeed]">
                +
                <input
                  type="color"
                  aria-label="Custom accent color"
                  value={soul.appearance.accent}
                  onChange={(event) => updateAppearance({ accent: event.target.value })}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <LauncherSettings appearance={soul.appearance} onChange={updateAppearance} />
            <Field label="Position">
              <select
                aria-label="Launcher position"
                value={soul.appearance.position}
                onChange={(event) =>
                  updateAppearance({
                    position: event.target.value as Soul["appearance"]["position"],
                  })
                }
                className="clean-input"
              >
                <option value="bottom-right">Right</option>
                <option value="bottom-left">Left</option>
              </select>
            </Field>
          </div>

          <p className="text-center text-[11px] leading-4 text-[#98958d]">
            If a site blocks embedded previews, open it in a new tab. The installed widget is
            unaffected.
          </p>
        </div>
        <div className="shrink-0 border-t border-[#ececeb] bg-white p-4">
          <button onClick={onIntegrate} className="primary-button w-full justify-center">
            Looks right — integrate it
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div
        className={`absolute top-1/2 z-[55] flex w-[132px] -translate-y-1/2 flex-col overflow-hidden rounded-l-2xl border border-r-0 border-black/10 bg-white/95 shadow-[0_12px_32px_rgba(20,24,18,.16)] backdrop-blur-xl transition-[right] duration-300 ${
          customizeOpen ? "right-[330px] hidden lg:flex" : "right-0"
        }`}
      >
        <button
          disabled={!canCustomize}
          onClick={() => setCustomizeOpen((current) => !current)}
          className="flex h-12 w-full items-center justify-center gap-2 px-3 text-sm font-semibold text-[#373633] transition hover:bg-[#f3f3f2]"
          aria-label={customizeOpen ? "Close customization drawer" : "Open customization drawer"}
          title="Customize visitor experience"
        >
          <WandSparkles className="h-4 w-4 text-[#0b0b0c]" />
          <span>Customize</span>
          {customizeOpen ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => {
            setFrameLoading(true);
            setFrameKey((current) => current + 1);
          }}
          className="flex h-11 w-full items-center justify-center border-t border-black/10 text-[#595753] transition hover:bg-[#f3f3f2]"
          aria-label="Refresh website preview"
          title="Refresh website"
        >
          <RefreshCw className={`h-4 w-4 ${frameLoading ? "animate-spin" : ""}`} />
        </button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 w-full items-center justify-center border-t border-black/10 text-[#595753] transition hover:bg-[#f3f3f2]"
          aria-label="Open website in a new tab"
          title="Open website"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function DeployView({
  onSave,
  soul,
  plan,
  onUpdate,
  onNotice,
  onUpgrade,
}: {
  soul: Soul;
  plan: BillingPlan;
  onSave: () => Promise<SoulWorkspace>;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onNotice: (message: string) => void;
  onUpgrade: () => void;
}) {
  const deployTeam = useTeamWorkspace();
  const writable = (section: AccessSection) =>
    !deployTeam ||
    deployTeam.current.role === "owner" ||
    canAccess(deployTeam.current.permissions, section, true);
  const readable = (section: AccessSection) =>
    !deployTeam ||
    deployTeam.current.role === "owner" ||
    canAccess(deployTeam.current.permissions, section);
  const [tab, setTab] = useState<"widget" | "followup" | "webhook">("widget");
  const [busy, setBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState<"closed" | "chat" | "voice">("closed");
  const webhookAvailable = billingPlanIncludesFeature(plan.id, "webhooks");
  const origin = typeof window === "undefined" ? "https://app.obseri.com" : window.location.origin;
  const code = `<script\n  src="${origin}/obseri-widget.js"\n  data-soul-id="${soul.id}"\n  data-widget-token="${soul.channels.widgetToken}"\n  data-position="${soul.appearance.position}"\n  data-accent="${soul.appearance.accent}"\n  data-analytics="${soul.channels.analyticsEnabled === false ? "off" : "on"}"\n  data-proactive="${soul.channels.proactiveEnabled === false ? "off" : "on"}"\n  data-consent="${soul.channels.consentRequired ? "required" : "not-required"}"\n  async\n></script>`;
  const updateAppearance = (patch: Partial<Soul["appearance"]>) =>
    onUpdate((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
  const updateChannels = (patch: Partial<Soul["channels"]>) =>
    onUpdate((current) => ({ ...current, channels: { ...current.channels, ...patch } }));
  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    onNotice(message);
  }
  async function publish() {
    const followUpIssue = followUpError(soul.personality);
    if (followUpIssue) {
      setTab("followup");
      onNotice(followUpIssue);
      return;
    }
    setBusy(true);
    try {
      const saved = await onSave();
      const publishableSoul = saved.souls.find((candidate) => candidate.id === soul.id);
      if (!publishableSoul) throw new Error("This website was removed. Reload the workspace.");
      const response = await authFetch("/api/souls/publish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-obseri-publish-key": publishableSoul.channels.publishKey,
          "x-obseri-workspace-revision": String(saved.revision || 0),
        },
        body: JSON.stringify(publishableSoul),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        searchIndex?: { indexed: number; total: number };
      };
      if (!response.ok) throw new Error(payload.error?.message || "Publishing failed.");
      onUpdate((current) => ({
        ...current,
        status: "live",
        channels: webhookAvailable
          ? current.channels
          : { ...current.channels, webhookEnabled: false },
      }));
      onNotice(
        payload.searchIndex && payload.searchIndex.indexed < payload.searchIndex.total
          ? "Published. Keyword search is ready; semantic indexing is incomplete and will retry with incoming questions."
          : "Published. Your website widget is ready.",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  }
  async function testWebhook() {
    if (!soul.channels.webhookUrl) return onNotice("Add a destination URL first.");
    setBusy(true);
    try {
      const response = await authFetch("/api/webhooks/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-obseri-publish-key": soul.channels.publishKey,
        },
        body: JSON.stringify({
          soulId: soul.id,
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Test failed.");
      onNotice("Signed test event delivered.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Put it on your website"
      description="Publish once, then paste one script into your site."
      hideHeader
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#e5e5e3] bg-[#f9f9f9] px-4 py-2 sm:px-8">
        <button
          onClick={() => setTab("widget")}
          className={`h-full border-b-2 px-1 text-sm font-medium ${tab === "widget" ? "border-[#1f1e1d] text-[#181817]" : "border-transparent text-[#74726d]"}`}
        >
          Website widget
        </button>
        <button
          type="button"
          aria-pressed={tab === "followup"}
          onClick={() => setTab("followup")}
          className={`h-full border-b-2 px-1 py-2 text-sm font-medium ${tab === "followup" ? "border-[#1f1e1d] text-[#181817]" : "border-transparent text-[#74726d]"}`}
        >
          Follow-up
        </button>
        <button
          onClick={() => setTab("webhook")}
          className={`h-full border-b-2 px-1 text-sm font-medium ${tab === "webhook" ? "border-[#1f1e1d] text-[#181817]" : "border-transparent text-[#74726d]"}`}
        >
          Webhooks
        </button>
        <button
          onClick={() => void publish()}
          disabled={busy}
          className="primary-button ml-auto h-9 px-3.5 text-xs"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : soul.status === "live" ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {soul.status === "live" ? "Publish changes" : "Publish soul"}
        </button>
      </div>
      {tab === "followup" ? (
        readable("personality") ? (
          <fieldset disabled={!writable("personality")}>
            <FollowUpSettings soul={soul} onUpdate={onUpdate} />
          </fieldset>
        ) : (
          <p className="p-6 text-sm text-stone-500">
            Ask your workspace owner for Personality access to view follow-up settings.
          </p>
        )
      ) : tab === "widget" ? (
        <div className="grid min-h-[calc(100vh-112px)] xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 xl:border-r xl:border-[#e5e5e3]">
            <Card>
              <SectionHeading
                title="Install the widget"
                description="Paste this before the closing </body> tag."
              />
              <div className="mt-5 space-y-3 rounded-xl border border-[#e5dfed] bg-[#faf8fc] p-4 text-sm text-[#756681]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={soul.channels.analyticsEnabled !== false}
                    onChange={(e) => updateChannels({ analyticsEnabled: e.target.checked })}
                  />
                  Track page journeys and conversion activity
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={soul.channels.proactiveEnabled !== false}
                    onChange={(e) => updateChannels({ proactiveEnabled: e.target.checked })}
                  />
                  Offer help once on pricing and product pages
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(soul.channels.consentRequired)}
                    onChange={(e) => updateChannels({ consentRequired: e.target.checked })}
                  />
                  Wait for my consent manager before tracking
                </label>
                <p className="text-xs leading-5">
                  No keystroke recording or cross-site identity. Do Not Track and Global Privacy
                  Control disable analytics. Conversion data is retained for 30 days. After changing
                  these options, publish and replace the embed on your site.
                </p>
                {soul.channels.consentRequired && (
                  <p className="break-all text-xs leading-5">
                    After consent is granted, dispatch{" "}
                    <code>
                      window.dispatchEvent(new CustomEvent("obseri:consent", &#123; detail: &#123;
                      granted: true &#125; &#125;))
                    </code>
                    . Dispatch with <code>granted: false</code> when consent is withdrawn. Contact
                    requests remain available without analytics.
                  </p>
                )}
              </div>
              <div className="relative mt-5 overflow-hidden rounded-xl bg-[#1c1c1b] p-5">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[#e0dfdc]">
                  <code>{code}</code>
                </pre>
                <button
                  onClick={() => void copy(code, "Embed code copied.")}
                  className="absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-white hover:bg-white/15"
                >
                  <Clipboard className="h-4 w-4" />
                </button>
              </div>
            </Card>
            <Card>
              <SectionHeading
                title="Appearance"
                description="Keep the launcher subtle and on-brand."
              />
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <fieldset disabled={!writable("appearance")}>
                  <Field label="Accent color">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={soul.appearance.accent}
                        onChange={(event) => updateAppearance({ accent: event.target.value })}
                        className="h-11 w-12 rounded-lg border border-[#dfdedb] bg-white p-1"
                      />
                      <input
                        value={soul.appearance.accent}
                        onChange={(event) => updateAppearance({ accent: event.target.value })}
                        className="clean-input"
                      />
                    </div>
                  </Field>
                  <Field label="Position">
                    <select
                      value={soul.appearance.position}
                      onChange={(event) =>
                        updateAppearance({
                          position: event.target.value as Soul["appearance"]["position"],
                        })
                      }
                      className="clean-input"
                    >
                      <option value="bottom-right">Bottom right</option>
                      <option value="bottom-left">Bottom left</option>
                    </select>
                  </Field>
                </fieldset>
                <Field label="Allowed domains" hint="Comma-separated">
                  <input
                    value={soul.channels.allowedDomains.join(", ")}
                    onChange={(event) =>
                      updateChannels({
                        allowedDomains: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="yourdomain.com"
                    className="clean-input"
                  />
                </Field>
                <fieldset disabled={!writable("appearance")} className="md:col-span-2">
                  <LauncherSettings appearance={soul.appearance} onChange={updateAppearance} />
                </fieldset>
              </div>
            </Card>
          </div>
          <div className="bg-[#f1f0ef] p-5 xl:sticky xl:top-0 xl:h-[calc(100vh-112px)]">
            <div className="h-full bg-[#ebeae8] p-3">
              <div className="relative h-full min-h-[610px] overflow-hidden bg-white">
                <div className="border-b border-[#ecebe9] p-4">
                  <div className="h-3 w-24 rounded-full bg-[#e8e8e6]" />
                </div>
                <div className="p-6">
                  <div className="h-7 w-3/4 rounded-md bg-[#ebebe9]" />
                  <div className="mt-3 h-3 w-full rounded bg-[#f0f0ef]" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-[#f0f0ef]" />
                </div>
                <div
                  className={`absolute bottom-20 ${soul.appearance.position === "bottom-right" ? "right-4" : "left-4"} h-[520px] w-[360px] max-w-[calc(100%-32px)] transition ${previewMode === "closed" ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}
                >
                  {previewMode !== "closed" && (
                    <SoulChat
                      soul={soul}
                      fill
                      voiceMode
                      initialPanelMode={previewMode === "chat" ? "chat" : "voice"}
                      onClose={() => setPreviewMode("closed")}
                      contactAction={<FollowUpAction soul={soul} preview />}
                    />
                  )}
                </div>
                {previewMode === "closed" && (
                  <ChatLauncher
                    appearance={soul.appearance}
                    onClick={() => setPreviewMode(launcherPanel(soul.appearance))}
                    className={`absolute bottom-4 ${soul.appearance.position === "bottom-right" ? "right-4" : "left-4"}`}
                  />
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-[#8b887f]">Live widget preview</p>
          </div>
        </div>
      ) : (
        <div className="min-h-[calc(100vh-112px)]">
          {!webhookAvailable ? (
            <div className="mx-auto flex min-h-[calc(100vh-112px)] max-w-3xl items-center px-5 py-10 sm:px-8">
              <div className="w-full rounded-3xl border border-[#e3e2e0] bg-[#f9f9f9] p-7 sm:p-10">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0f3] text-[#c23d58]">
                  <Webhook className="h-5 w-5" />
                </span>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#c23d58]">
                  Launch feature
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  Connect conversations to your stack.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#74736e]">
                  Signed conversation and lead webhooks are available on Launch and higher. Your
                  widget and chat remain live on {plan.name}.
                </p>
                <button type="button" onClick={onUpgrade} className="primary-button mt-7">
                  Compare plans <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <Card>
              <div className="flex items-start justify-between gap-4">
                <SectionHeading
                  title="Conversation webhooks"
                  description="Send conversation and lead events to your own backend."
                />
                <Toggle
                  checked={soul.channels.webhookEnabled}
                  onChange={(checked) => updateChannels({ webhookEnabled: checked })}
                />
              </div>
              <Field label="Destination URL" className="mt-6">
                <input
                  value={soul.channels.webhookUrl}
                  onChange={(event) => updateChannels({ webhookUrl: event.target.value })}
                  placeholder="https://yourapp.com/webhooks/obseri"
                  className="clean-input"
                />
              </Field>
              <Field label="Signing secret" className="mt-5">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={soul.channels.webhookSecret}
                    className="clean-input font-mono"
                  />
                  <button
                    onClick={() => void copy(soul.channels.webhookSecret, "Signing secret copied.")}
                    className="rounded-xl border border-[#e0dfdc] px-3 hover:bg-[#f5f4f3]"
                  >
                    <Clipboard className="h-4 w-4" />
                  </button>
                </div>
              </Field>
              <button
                onClick={() => void testWebhook()}
                disabled={!soul.channels.webhookUrl || busy}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#e0dfdc] px-4 py-2.5 text-sm font-semibold hover:bg-[#f5f4f3] disabled:opacity-40"
              >
                <Webhook className="h-4 w-4" />
                Send test event
              </button>
              <div className="mt-6 rounded-xl bg-[#f3f3f2] p-4 text-sm leading-6 text-[#666460]">
                Events include a timestamp, unique event ID, idempotency key, and HMAC-SHA256
                signature.
              </div>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function visitorName(conversation: StudioConversation) {
  const contact = extractContact(conversation);
  if (contact.email) return contact.email;
  if (contact.phone) return contact.phone;
  if (conversation.channel === "playground") return "Studio test";
  const host = conversation.origin ? safeHost(conversation.origin) : "";
  return host ? `Visitor on ${host}` : conversation.visitorLabel || "Website visitor";
}

const INTENT_STYLES: Record<SoulConversation["leadIntent"], { label: string; className: string }> =
  {
    high: { label: "Hot lead", className: "bg-[#ffe4ea] text-[#c0264a]" },
    medium: { label: "Warm lead", className: "bg-[#fff1dc] text-[#9a5b10]" },
    low: { label: "Browsing", className: "bg-[#f1f1ef] text-[#6f6e69]" },
    none: { label: "Question", className: "bg-[#f1f1ef] text-[#6f6e69]" },
  };

function IntentBadge({ intent }: { intent: SoulConversation["leadIntent"] }) {
  const style = INTENT_STYLES[intent];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function OverviewView({
  soul,
  user,
  plan,
  conversations,
  onNavigate,
  onOpenConversation,
  onRefresh,
}: {
  soul: Soul;
  user: StudioUser;
  plan: BillingPlan;
  conversations: StudioConversation[];
  onNavigate: (view: StudioView) => void;
  onOpenConversation: (id: string) => void;
  onRefresh: () => void;
}) {
  const team = useTeamWorkspace();
  const permitted = (view: StudioView, write = false) =>
    !team ||
    team.current.role === "owner" ||
    (Boolean(VIEW_SECTION[view]) &&
      canAccess(normalizePermissions(team.current.permissions), VIEW_SECTION[view]!, write));
  const steps = getSetupSteps(soul).filter((step) => permitted(step.view));
  const complete = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  const visitorConversations = conversations.filter((item) => item.channel !== "playground");
  const leads = visitorConversations.filter(isLead);
  const firstName = (user.name || user.email?.split("@")[0] || "").split(/[\s._-]+/)[0];
  const pageLimit = plan.limits.indexedPages;
  const pages = soul.knowledge.pages.length;
  const questions = topQuestions(
    visitorConversations.length ? visitorConversations : conversations,
  );
  const crawling = soul.knowledge.status === "crawling";

  const stats: Array<{ label: string; value: string; detail: string; view: StudioView }> = [
    {
      label: "Conversations",
      value: visitorConversations.length.toLocaleString("en-IN"),
      detail: `${countSince(visitorConversations, 7)} in the last 7 days`,
      view: "conversations",
    },
    {
      label: "Contacts in chat",
      value: leads.length.toLocaleString("en-IN"),
      detail: `${leads.filter((item) => item.leadIntent === "high").length} hot · ${countSince(leads, 7)} this week`,
      view: "conversations",
    },
    {
      label: "Pages learned",
      value: pages.toLocaleString("en-IN"),
      detail:
        pageLimit !== null
          ? `of ${pageLimit.toLocaleString("en-IN")} on ${plan.name}`
          : `on ${plan.name}`,
      view: "knowledge",
    },
    {
      label: "Voice",
      value: soul.voice.enabled ? soul.voice.profileName || "On" : "Off",
      detail: soul.voice.enabled ? "Visitors can talk out loud" : "Text chat only",
      view: "voice",
    },
  ];

  return (
    <div className="min-h-full bg-[#fafaf9]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:py-10">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm text-[#8a8984]">
              <StatusBadge status={soul.status} />
              <a
                href={soul.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:text-[#0b0b0c]"
              >
                {safeHost(soul.siteUrl)}
              </a>
            </p>
            <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
              {greeting()}
              {firstName ? `, ${firstName[0].toUpperCase()}${firstName.slice(1)}` : ""}.
            </h1>
            <p className="mt-2 text-[15px] text-[#6f6e69]">
              {leads.length
                ? `${soul.personality.name || soul.name} has found ${leads.length} lead${leads.length === 1 ? "" : "s"} for you so far.`
                : soul.status === "live"
                  ? `${soul.personality.name || soul.name} is live and ready for your next visitor.`
                  : `Finish setup to put ${soul.personality.name || soul.name} in front of real visitors.`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {permitted("playground") && (
              <button
                type="button"
                onClick={() => onNavigate("playground")}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e2e2df] bg-white px-5 text-sm font-medium transition hover:bg-[#f5f5f3]"
              >
                <Play className="h-4 w-4" /> Preview agent
              </button>
            )}
            {permitted(soul.status === "live" ? "conversations" : "deploy") && (
              <button
                type="button"
                onClick={() => onNavigate(soul.status === "live" ? "conversations" : "deploy")}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0b0b0c] px-5 text-sm font-medium text-white transition hover:bg-[#2a2a2e]"
              >
                {soul.status === "live" ? (
                  <>
                    <MessageCircle className="h-4 w-4" /> View conversations
                  </>
                ) : (
                  <>
                    <Code2 className="h-4 w-4" /> Install on website
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {complete < steps.length && (
          <section className="mt-8 overflow-hidden rounded-[24px] border border-[#ebebe8] bg-white">
            <div className="flex flex-col justify-between gap-4 border-b border-[#f0f0ee] p-5 sm:flex-row sm:items-center sm:p-6">
              <div>
                <p className="text-[15px] font-semibold">Get your agent live</p>
                <p className="mt-1 text-sm text-[#7a7974]">
                  {complete} of {steps.length} done. Most websites finish in under ten minutes.
                </p>
              </div>
              {nextStep && (
                <button
                  type="button"
                  onClick={() => onNavigate(nextStep.view)}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#0b0b0c] px-4 text-sm font-medium text-white transition hover:bg-[#2a2a2e]"
                >
                  Continue: {nextStep.title} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="h-1 bg-[#f0f0ee]">
              <div
                className="h-full bg-gradient-to-r from-[#ff8ba0] to-[#b39cff] transition-[width] duration-700"
                style={{ width: `${(complete / steps.length) * 100}%` }}
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <button
                  key={step.view}
                  type="button"
                  onClick={() => onNavigate(step.view)}
                  className={`group flex items-start gap-3 border-[#f0f0ee] p-5 text-left transition hover:bg-[#fafaf9] ${index ? "border-t sm:border-t-0 sm:border-l" : ""}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-4 [&_svg]:w-4 ${step.done ? "bg-[#0b0b0c] text-white" : "bg-[#f3f3f1] text-[#7a7974]"}`}
                  >
                    {step.done ? <Check /> : step.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{step.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#8a8984]">
                      {step.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!stats.some((stat) => permitted(stat.view)) && (
          <p className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
            No dashboard summaries are shared with you yet. Ask the owner for access to the sections
            you need.
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats
            .filter((stat) => permitted(stat.view))
            .map((stat) => (
              <button
                key={stat.label}
                type="button"
                onClick={() => onNavigate(stat.view)}
                className="group rounded-[20px] border border-[#ebebe8] bg-white p-5 text-left transition hover:border-[#dcdcd8] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,.12)]"
              >
                <p className="flex items-center justify-between text-[13px] text-[#7a7974]">
                  {stat.label}
                  <ArrowUpRight className="h-4 w-4 text-[#b4b3ae] transition group-hover:text-[#0b0b0c]" />
                </p>
                <p className="mt-3 truncate text-[26px] font-semibold leading-none tracking-[-0.04em] sm:text-[30px]">
                  {stat.value}
                </p>
                <p className="mt-2 truncate text-xs text-[#8a8984]">{stat.detail}</p>
              </button>
            ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {permitted("conversations") && (
            <section className="rounded-[24px] border border-[#ebebe8] bg-white">
              <div className="flex items-center justify-between border-b border-[#f0f0ee] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-[15px] font-semibold">Contacts in conversations</h2>
                  <p className="mt-0.5 text-xs text-[#8a8984]">
                    Real visitors who shared contact details in chat
                  </p>
                </div>
                {leads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate("conversations")}
                    className="text-sm font-medium text-[#0b0b0c] hover:underline"
                  >
                    View all
                  </button>
                )}
              </div>
              {leads.length ? (
                <ul className="divide-y divide-[#f0f0ee]">
                  {leads.slice(0, 5).map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => onOpenConversation(lead.id)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#fafaf9] sm:px-6"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f3f1] text-xs font-semibold text-[#5f5e5a]">
                          {visitorName(lead).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">
                              {visitorName(lead)}
                            </span>
                            <IntentBadge intent={lead.leadIntent} />
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-[#7a7974]">
                            “{firstQuestion(lead)}”
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-[#9a9994]">
                          {relativeTime(lead.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3f3f1] text-[#7a7974]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-sm font-semibold">No leads yet</p>
                  <p className="mt-1 max-w-xs text-[13px] leading-5 text-[#8a8984]">
                    {soul.status === "live"
                      ? "When a visitor shows buying intent or shares their details, they’ll appear here."
                      : "Install the widget on your website and leads will start arriving here."}
                  </p>
                  {soul.status !== "live" && permitted("deploy") && (
                    <button
                      type="button"
                      onClick={() => onNavigate("deploy")}
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-[#e2e2df] px-4 text-sm font-medium hover:bg-[#f5f5f3]"
                    >
                      Install widget <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <div className="grid gap-4">
            {permitted("conversations") && (
              <section className="rounded-[24px] border border-[#ebebe8] bg-white p-5 sm:p-6">
                <h2 className="text-[15px] font-semibold">What visitors ask</h2>
                {questions.length ? (
                  <ol className="mt-4 space-y-2.5">
                    {questions.map((item, index) => (
                      <li key={item.question} className="flex items-start gap-3 text-sm">
                        <span className="obs-mono mt-0.5 w-4 shrink-0 text-xs text-[#a3a29d]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 leading-5 text-[#3d3d3a]">
                          {item.question}
                        </span>
                        {item.count > 1 && (
                          <span className="shrink-0 rounded-full bg-[#f3f3f1] px-2 py-0.5 text-[11px] font-medium text-[#6f6e69]">
                            ×{item.count}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-[13px] leading-5 text-[#8a8984]">
                    Visitor questions will show up here, so you can see what your website isn’t
                    answering on its own.
                  </p>
                )}
              </section>
            )}

            {permitted("knowledge") && (
              <section className="rounded-[24px] border border-[#ebebe8] bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold">Knowledge</h2>
                    <p className="mt-1 text-[13px] text-[#8a8984]">
                      {crawling
                        ? "Learning your website now…"
                        : soul.knowledge.lastCrawledAt
                          ? `Last refreshed ${relativeTime(soul.knowledge.lastCrawledAt)}`
                          : "Not learned yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={crawling || !permitted("knowledge", true)}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[#e2e2df] px-3.5 text-[13px] font-medium transition hover:bg-[#f5f5f3] disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${crawling ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Pages", pages],
                    ["Sources", soul.knowledge.sources?.length || (pages ? 1 : 0)],
                    ["Issues", soul.knowledge.errors.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-[#f7f7f5] px-2 py-3">
                      <p className="text-lg font-semibold tracking-[-0.03em]">{value}</p>
                      <p className="text-[11px] text-[#8a8984]">{label}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ConversationFilter = "all" | "leads" | "visitors" | "tests" | "review";

function ConversationsView({
  soul,
  conversations,
  focusId,
  onCorrect,
  onTest,
  onInstall,
}: {
  soul: Soul;
  conversations: StudioConversation[];
  focusId: string | null;
  onCorrect: (question: string, answer: string) => void;
  onTest: () => void;
  onInstall: () => void;
}) {
  const conversationTeam = useTeamWorkspace();
  const canCorrect =
    !conversationTeam ||
    conversationTeam.current.role === "owner" ||
    canAccess(conversationTeam.current.permissions, "knowledge", true);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [followUpFilter, setFollowUpFilter] = useState("any");
  const [inboxUpdates, setInboxUpdates] = useState<
    Record<string, NonNullable<OwnerConversation["followUp"]>>
  >({});
  const followUpFor = (item: StudioConversation) => {
    const local = inboxUpdates[`${soul.id}:${item.id}`];
    return local && local.version >= (item.followUp?.version ?? 0) ? local : item.followUp;
  };
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(focusId ?? conversations[0]?.id ?? "");
  const [mobileDetail, setMobileDetail] = useState(Boolean(focusId));
  const [correctionQuestion, setCorrectionQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (focusId) {
      setSelected(focusId);
      setMobileDetail(true);
    }
  }, [focusId]);

  const reviews = answersToReview(conversations, soul);
  const counts: Record<ConversationFilter, number> = {
    review: reviews.length,
    all: conversations.length,
    leads: conversations.filter(isLead).length,
    visitors: conversations.filter((item) => item.channel !== "playground").length,
    tests: conversations.filter((item) => item.channel === "playground").length,
  };
  const needle = query.trim().toLowerCase();
  const visibleReviews = reviews.filter((item) => item.question.toLowerCase().includes(needle));
  const visible = conversations.filter((item) => {
    if (followUpFilter !== "any") {
      if (item.channel === "playground") return false;
      const state = followUpFor(item);
      if (
        followUpFilter === "unassigned"
          ? !!state?.assigneeId
          : (state?.status ?? "open") !== followUpFilter
      )
        return false;
    }
    if (filter === "review")
      return visibleReviews.some((review) => review.conversationId === item.id);
    if (filter === "leads" && !isLead(item)) return false;
    if (filter === "visitors" && item.channel === "playground") return false;
    if (filter === "tests" && item.channel !== "playground") return false;
    if (!needle) return true;
    return (
      visitorName(item).toLowerCase().includes(needle) ||
      item.messages.some((message) => message.content.toLowerCase().includes(needle))
    );
  });
  const conversation = visible.find((item) => item.id === selected) ?? visible[0];
  const contact = conversation ? extractContact(conversation) : {};

  function downloadLeads() {
    const blob = new Blob([leadsToCsv(conversations)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${safeHost(soul.siteUrl)}-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  if (!conversations.length) {
    return (
      <div className="flex h-full overflow-y-auto bg-[#fafaf9] p-6">
        <div className="m-auto max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#5f5e5a] shadow-[0_1px_2px_rgba(0,0,0,.05)]">
            <MessageCircle className="h-6 w-6" />
          </span>
          <h2 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">No conversations yet</h2>
          <p className="mt-3 text-sm leading-6 text-[#7a7974]">
            Every visitor conversation and lead from your website lands here. Try your agent in
            Preview, or install it on your website to start collecting real ones.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={onTest}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e2e2df] bg-white px-4 text-sm font-medium hover:bg-[#f5f5f3]"
            >
              <Play className="h-4 w-4" /> Preview agent
            </button>
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0b0b0c] px-4 text-sm font-medium text-white hover:bg-[#2a2a2e]"
            >
              <Code2 className="h-4 w-4" /> Install widget
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-white lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside
        aria-label="Conversation inbox"
        className={`${mobileDetail && conversation ? "hidden" : "flex"} min-h-0 min-w-0 flex-col overflow-hidden border-[#ececea] lg:flex lg:border-r`}
      >
        <div className="shrink-0 space-y-3 border-b border-[#ececea] p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Conversations</h1>
            <button
              type="button"
              onClick={downloadLeads}
              disabled={!counts.leads}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e2e2df] px-3 text-xs font-medium transition hover:bg-[#f5f5f3] disabled:opacity-40"
              title="Download leads as CSV"
            >
              <Download className="h-3.5 w-3.5" /> Export leads
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a9994]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, emails…"
              className="clean-input rounded-full pl-9"
              aria-label="Search conversations"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist">
            {(
              [
                ["all", "All"],
                ["leads", "Leads"],
                ["review", "Review"],
                ["visitors", "Visitors"],
                ["tests", "Tests"],
              ] as Array<[ConversationFilter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => {
                  setFilter(id);
                  setFollowUpFilter("any");
                }}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${filter === id ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:bg-[#f3f3f1]"}`}
              >
                {label}
                <span className={filter === id ? "text-white/60" : "text-[#a3a29d]"}>
                  {counts[id]}
                </span>
              </button>
            ))}
          </div>
          {filter !== "tests" && filter !== "review" && (
            <label className="flex items-center justify-between text-xs text-stone-600">
              Follow-up
              <select
                aria-label="Filter follow-up"
                value={followUpFilter}
                onChange={(e) => setFollowUpFilter(e.target.value)}
                className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-stone-900"
              >
                <option value="any">All conversations</option>
                <option value="open">Open</option>
                <option value="waiting">Waiting for reply</option>
                <option value="resolved">Resolved</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
          )}
        </div>
        <div
          role="region"
          aria-label="Conversation list"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {filter === "review" ? (
            <div>
              <div className="border-b border-[#ececea] p-4">
                <h2 className="text-sm font-semibold">Answers to review</h2>
                <p className="mt-1 text-xs leading-5 text-[#65625b]">
                  Questions the assistant explicitly could not answer in the loaded visitor
                  conversations. Check the context before adding a correction.
                </p>
              </div>
              {visibleReviews.map((item) => (
                <article key={item.key} className="space-y-3 border-b border-[#ececea] p-4">
                  <p className="break-words text-sm font-medium">{item.question}</p>
                  <p className="text-xs text-[#65625b]">
                    {item.count} {item.count === 1 ? "occurrence" : "occurrences"} ·{" "}
                    {relativeTime(item.updatedAt)}
                  </p>
                  {item.hasDraftAnswer && (
                    <p className="text-xs text-[#42644e]">
                      Approved answer available · retest before publishing changes.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-[#deded9] px-3 py-2 text-xs font-medium hover:bg-[#f5f5f3]"
                      onClick={() => {
                        setSelected(item.conversationId);
                        setMobileDetail(true);
                      }}
                    >
                      View conversation
                    </button>
                    {canCorrect && (
                      <button
                        type="button"
                        className="rounded-full bg-[#171717] px-3 py-2 text-xs font-medium text-white hover:bg-[#333]"
                        onClick={() => setCorrectionQuestion(item.question)}
                      >
                        Correct answer
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!visibleReviews.length && (
                <p className="p-6 text-center text-sm text-[#65625b]">
                  No unanswered questions match. This queue flags explicit uncertainty, so other
                  answers may still need review.
                </p>
              )}
            </div>
          ) : visible.length ? (
            visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item.id);
                  setMobileDetail(true);
                }}
                aria-current={conversation?.id === item.id ? "true" : undefined}
                className={`w-full border-b border-[#f1f1ef] px-4 py-3.5 text-left transition ${conversation?.id === item.id ? "bg-[#f5f5f3]" : "hover:bg-[#fafaf9]"}`}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {visitorName(item)}
                  </p>
                  <span className="shrink-0 text-[11px] text-[#9a9994]">
                    {relativeTime(item.updatedAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] text-[#7a7974]">{firstQuestion(item)}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <IntentBadge intent={item.leadIntent} />
                  <span className="text-[11px] text-[#a3a29d]">
                    {item.channel === "playground" ? "Studio test" : "Website"} ·{" "}
                    {item.messages.length} messages
                  </span>
                </div>
                {item.channel !== "playground" && (
                  <p className="mt-2 truncate text-[11px] text-stone-600">
                    {
                      { open: "Open", waiting: "Waiting for reply", resolved: "Resolved" }[
                        followUpFor(item)?.status ?? "open"
                      ]
                    }{" "}
                    · {followUpFor(item)?.assigneeLabel || "Unassigned"}
                  </p>
                )}
              </button>
            ))
          ) : (
            <p className="p-6 text-center text-sm text-[#8a8984]">Nothing matches this filter.</p>
          )}
        </div>
      </aside>

      {conversation ? (
        <section
          aria-label="Selected conversation"
          className={`${mobileDetail ? "flex" : "hidden"} min-h-0 min-w-0 flex-col overflow-hidden lg:flex`}
        >
          <header className="flex shrink-0 flex-col gap-4 border-b border-[#ececea] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-[#5f5e5a] hover:text-black lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" /> Back to conversations
              </button>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em]">
                  {visitorName(conversation)}
                </h2>
                <IntentBadge intent={conversation.leadIntent} />
              </div>
              <p className="mt-1 text-xs text-[#8a8984]">
                {conversation.channel === "playground"
                  ? "Studio test"
                  : `Website${conversation.origin ? ` · ${safeHost(conversation.origin)}` : ""}`}{" "}
                · Started {formatDateTime(conversation.startedAt)}
              </p>
            </div>
            {(contact.email || contact.phone) && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}?subject=${encodeURIComponent(`Following up from ${safeHost(soul.siteUrl)}`)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-[#0b0b0c] px-4 text-[13px] font-medium text-white hover:bg-[#2a2a2e]"
                  >
                    Email {contact.email.split("@")[0]}
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e2e2df] px-4 text-[13px] font-medium hover:bg-[#f5f5f3]"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
              </div>
            )}
          </header>
          {conversation.channel !== "playground" && (
            <ConversationWorkflow
              key={`${soul.id}:${conversation.id}`}
              soulId={soul.id}
              conversationId={conversation.id}
              onChange={(inbox) =>
                setInboxUpdates((previous) => ({
                  ...previous,
                  [`${soul.id}:${conversation.id}`]: {
                    status: inbox.status,
                    assigneeId: inbox.assigneeId,
                    version: inbox.version,
                    assigneeLabel:
                      inbox.assignees.find((person) => person.id === inbox.assigneeId)?.label ||
                      (inbox.assigneeId ? "Unavailable teammate" : null),
                  },
                }))
              }
            />
          )}
          <div
            key={conversation.id}
            role="region"
            aria-label="Conversation messages"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain break-words bg-[#fafaf9] px-5 py-6 sm:px-8"
          >
            <div className="mx-auto max-w-2xl space-y-4">
              {conversation.messages.map((message, messageIndex) => (
                <div
                  key={message.id}
                  className={message.role === "visitor" ? "flex justify-end" : "flex"}
                >
                  <div className={message.role === "visitor" ? "max-w-[80%]" : "max-w-[86%]"}>
                    <div
                      className={
                        message.role === "visitor"
                          ? "rounded-2xl rounded-br-md bg-[#0b0b0c] px-4 py-3 text-sm leading-6 text-white"
                          : "rounded-2xl rounded-bl-md border border-[#ececea] bg-white px-4 py-3 text-sm leading-6 text-[#2f2f2c]"
                      }
                    >
                      {message.content}
                    </div>
                    {message.citations?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {message.citations.slice(0, 3).map((citation) => (
                          <a
                            key={citation.chunkId}
                            href={/^https?:\/\//.test(citation.url) ? citation.url : undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[240px] items-center gap-1 truncate rounded-full border border-[#e7e7e4] bg-white px-2.5 py-1 text-[11px] text-[#6f6e69] hover:text-[#0b0b0c]"
                          >
                            <BookOpen className="h-3 w-3 shrink-0" />
                            <span className="truncate">{citation.title}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <p
                      className={`mt-1 text-[11px] text-[#a3a29d] ${message.role === "visitor" ? "text-right" : ""}`}
                    >
                      {relativeTime(message.createdAt)}
                    </p>
                    {canCorrect &&
                      message.role === "assistant" &&
                      conversation.messages[messageIndex - 1]?.role === "visitor" && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-[#65625b] underline underline-offset-2"
                          onClick={() =>
                            setCorrectionQuestion(conversation.messages[messageIndex - 1].content)
                          }
                        >
                          Correct answer
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="hidden items-center justify-center p-8 text-sm text-[#8a8984] lg:flex">
          Select a conversation.
        </div>
      )}
      {correctionQuestion && (
        <CorrectAnswerDialog
          soul={soul}
          question={correctionQuestion}
          onSave={onCorrect}
          onClose={() => setCorrectionQuestion(null)}
        />
      )}
    </div>
  );
}

function HelpView() {
  return (
    <Page title="Help" description="Get a direct answer from the Obseri team." hideHeader>
      <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col justify-between border-b border-[#e5e5e3] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eeedec] text-[#0b0b0c]">
              <MessageCircle className="h-5 w-5" />
            </span>
            <h2 className="mt-7 max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Talk to a real person.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#777671]">
              Send us the website name, the page you were working on, and what you expected to
              happen. Screenshots and exact error text help us resolve issues faster.
            </p>
            <a
              href="mailto:ayush@flamkilabs.com?subject=Obseri%20support"
              className="primary-button mt-7 inline-flex"
            >
              Email ayush@flamkilabs.com
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-12 text-xs text-[#908d85]">
            Founder-led support during the private pilot.
          </p>
        </section>

        <div className="bg-[#f9f9f9]">
          <section className="border-b border-[#e5e5e3] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#666460] shadow-sm">
                <BookOpen className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Before you email</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[#787671]">
                  <li>Confirm the correct website is selected.</li>
                  <li>Refresh Knowledge after changing website content.</li>
                  <li>Use Agent to reproduce the visitor experience.</li>
                </ul>
              </div>
            </div>
          </section>
          <section className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0b0b0c] shadow-sm">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Security reports</h3>
                <p className="mt-3 text-sm leading-6 text-[#787671]">
                  Do not include passwords, API keys, voice samples, or private customer data in a
                  support email. Describe the issue and we will arrange a secure transfer if needed.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

function ProfileView() {
  const { data } = authClient.useSession();
  const user = data?.user;
  const displayName = user?.name || user?.email?.split("@")[0] || "Obseri user";
  return (
    <Page title="Profile" description="Your personal account details." hideHeader>
      <div className="mx-auto w-full max-w-3xl py-6 sm:py-10">
        <Card>
          <SectionHeading title="Profile" description="Your signed-in account." />
          <div className="mt-6 flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#212120] font-semibold text-white">
              {userInitials(user) || "O"}
            </span>
            <div>
              <p className="font-semibold">{displayName}</p>
              <p className="mt-1 text-sm text-stone-500">
                Personal details from your sign-in account.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Display name">
              <input value={displayName} readOnly className="clean-input" />
            </Field>
            <Field label="Email">
              <input value={user?.email ?? ""} readOnly className="clean-input" />
            </Field>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function BillingView({
  onPlanChange,
  onClose,
}: {
  onPlanChange?: (plan: BillingPlan) => void;
  onClose?: () => void;
}) {
  const team = useTeamWorkspace();
  const isOwner = !team || team.current.role === "owner";
  const [billing, setBilling] = useState<BillingSummaryResponse | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [billingBusy, setBillingBusy] = useState<BillingPlanId | "cancel" | null>(null);
  const [billingNotice, setBillingNotice] = useState("");

  const loadBilling = useCallback(async () => {
    try {
      const response = await authFetch("/api/billing/summary", { cache: "no-store" });
      if (!response.ok) throw new Error("Billing details could not be loaded.");
      const summary = (await response.json()) as BillingSummaryResponse;
      setBilling(summary);
      onPlanChange?.(summary.plan);
    } catch (error) {
      setBillingNotice(
        error instanceof Error ? error.message : "Billing details could not be loaded.",
      );
    }
  }, [onPlanChange]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  async function beginCheckout(planId: BillingPlanId) {
    if (planId === "free" || planId === "enterprise") return;
    if (billing?.complimentary) {
      setBillingNotice("Your workspace has complimentary access. Contact support to change plans.");
      return;
    }
    setBillingBusy(planId);
    setBillingNotice("");
    try {
      if (
        billing?.subscription &&
        ["active", "authenticated"].includes(billing.subscription.status)
      ) {
        if (billing.subscription.cancelAtPeriodEnd) {
          throw new Error(
            "This subscription is scheduled to end. Contact support to restore or change it.",
          );
        }
        const plan = BILLING_PLANS[planId];
        const confirmed = window.confirm(
          `Change to ${plan.name} ${cycle} now? Razorpay will calculate any prorated charge or refund.`,
        );
        if (!confirmed) {
          setBillingBusy(null);
          return;
        }
        const change = await authFetch("/api/billing/change", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subscriptionId: billing.subscription.id,
            planId,
            cycle,
          }),
        });
        const payload = (await change.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (!change.ok)
          throw new Error(payload?.error?.message || "The plan could not be changed.");
        await loadBilling();
        setBillingNotice(`Your plan is now ${plan.name}.`);
        setBillingBusy(null);
        return;
      }
      await loadRazorpayScript();
      const response = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });
      const payload = (await response.json()) as {
        checkout?: {
          keyId: string;
          subscriptionId: string;
          name: string;
          description: string;
          email: string;
        };
        error?: { message?: string };
      };
      if (!response.ok || !payload.checkout) {
        throw new Error(payload.error?.message || "Checkout could not be started.");
      }
      if (!window.Razorpay) throw new Error("Secure checkout did not load.");
      const checkout = new window.Razorpay({
        key: payload.checkout.keyId,
        subscription_id: payload.checkout.subscriptionId,
        name: payload.checkout.name,
        description: payload.checkout.description,
        image: `${window.location.origin}/obseri-pulse-mark.svg`,
        prefill: { email: payload.checkout.email },
        theme: { color: "#ff5c7a" },
        modal: { ondismiss: () => setBillingBusy(null) },
        handler: async (result: RazorpayCheckoutResponse) => {
          const confirmation = await authFetch("/api/billing/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(result),
          });
          if (!confirmation.ok)
            throw new Error("Payment was received but confirmation is pending.");
          await loadBilling();
          setBillingNotice("Your plan is active.");
          setBillingBusy(null);
        },
      });
      checkout.on("payment.failed", () => {
        setBillingNotice("Payment was not completed. No plan change was made.");
        setBillingBusy(null);
      });
      checkout.open();
    } catch (error) {
      setBillingNotice(error instanceof Error ? error.message : "Checkout could not be started.");
      setBillingBusy(null);
    }
  }

  async function cancelSubscription() {
    if (!billing?.subscription?.id) return;
    setBillingBusy("cancel");
    setBillingNotice("");
    try {
      const response = await authFetch("/api/billing/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriptionId: billing.subscription.id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message || "Cancellation could not be scheduled.");
      }
      await loadBilling();
      setBillingNotice("Cancellation is scheduled for the end of this billing period.");
    } catch (error) {
      setBillingNotice(error instanceof Error ? error.message : "Cancellation failed.");
    } finally {
      setBillingBusy(null);
    }
  }

  if (!isOwner)
    return (
      <Page title="Workspace plan" description="Billing is managed by the workspace owner.">
        <Card>
          <h2 className="text-xl font-semibold">{billing?.plan.name ?? "Workspace"} plan</h2>
          <p className="mt-3 text-sm text-stone-500">
            Your team shares this plan's website, response and voice limits. Contact your workspace
            owner to change the subscription.
          </p>
          <button onClick={onClose} className="mt-5 underline">
            Close plans
          </button>
        </Card>
      </Page>
    );
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-title"
      className="obs-app fixed inset-0 z-[100] overflow-y-auto bg-[#fafaf9] text-[#0b0b0c]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close plans"
        className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#e2e2df] bg-white text-[#5f5e5a] shadow-[0_1px_2px_rgba(0,0,0,.05)] transition hover:bg-[#f5f5f3] hover:text-[#0b0b0c] sm:right-6 sm:top-6"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto flex min-h-full max-w-[1320px] flex-col px-4 pb-10 pt-16 sm:px-6 sm:pt-14">
        <header className="shrink-0 text-center">
          <h1
            id="billing-title"
            className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.05em]"
          >
            Choose the plan that fits your traffic
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-6 text-[#6f6e69]">
            Start free, then upgrade when your agent is bringing in conversations. Change or cancel
            any time.
          </p>
          <div
            className="mx-auto mt-7 grid w-full max-w-[380px] grid-cols-2 rounded-full border border-[#e7e7e4] bg-white p-1"
            aria-label="Billing interval"
          >
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={`h-11 rounded-full text-sm font-semibold transition-all ${
                  cycle === value
                    ? "bg-[#0b0b0c] text-white shadow-sm"
                    : "text-[#5f5e5a] hover:text-[#0b0b0c]"
                }`}
              >
                {value === "annual" ? "Annual · Save 15%" : "Monthly"}
              </button>
            ))}
          </div>
        </header>

        {billingNotice && (
          <p className="mx-auto mt-5 max-w-3xl rounded-xl border border-[#ffd0d9] bg-[#fff1f4] px-4 py-3 text-center text-sm text-[#b3263f]">
            {billingNotice}
          </p>
        )}

        {billing?.complimentary && (
          <p className="mx-auto mt-6 rounded-xl bg-stone-100 px-5 py-3 text-sm">
            Complimentary {billing.plan.name} access. No subscription charge or automatic renewal.
          </p>
        )}
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {SELF_SERVE_PLAN_IDS.map((planId) => (
            <PlanCard
              key={planId}
              plan={BILLING_PLANS[planId]}
              cycle={cycle}
              current={
                billing?.plan.id === planId &&
                (planId === "free" ||
                  !!billing.complimentary ||
                  billing.subscription?.cycle === cycle)
              }
              busy={billingBusy === planId}
              onChoose={() => void beginCheckout(planId)}
            />
          ))}
        </div>

        <footer className="mt-8 flex shrink-0 flex-col items-center justify-center gap-2 text-center text-sm text-[#6f6e69] sm:flex-row">
          <span>Need help with a larger rollout?</span>
          <a
            href="mailto:ayush@flamkilabs.com?subject=Obseri%20Enterprise"
            className="font-semibold text-[#0b0b0c] underline decoration-black/25 underline-offset-4 transition hover:decoration-black"
          >
            Talk to enterprise sales
          </a>
        </footer>

        {billing?.subscription && !billing.complimentary && (
          <div className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-xs text-[#8a8984]">
            <div>
              <span className="font-semibold">{billing.plan.name}</span>
              <span className="ml-2">
                {billing.subscription.currentPeriodEnd
                  ? `${billing.subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${new Date(
                      billing.subscription.currentPeriodEnd,
                    ).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : "Active subscription"}
              </span>
            </div>
            {billing.subscription.status === "active" &&
              !billing.subscription.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={() => void cancelSubscription()}
                  disabled={billingBusy !== null}
                  className="text-xs font-semibold text-[#5f5e5a] underline underline-offset-4 transition hover:text-[#0b0b0c] disabled:opacity-50"
                >
                  {billingBusy === "cancel" ? "Scheduling…" : "Cancel at period end"}
                </button>
              )}
          </div>
        )}
      </div>
    </section>
  );
}

type BillingSummaryResponse = {
  plan: BillingPlan;
  complimentary?: { expiresAt: string | null } | null;
  subscription: {
    id: string;
    status: string;
    cycle: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: { textResponses: number; voiceSeconds: number };
};

function UsageBar({ label, value, limit }: { label: string; value: number; limit: number | null }) {
  const percentage = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#595854]">{label}</span>
        <span className="text-[#7f7d78]">
          {value.toLocaleString("en-IN")} / {limit?.toLocaleString("en-IN") ?? "Custom"}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e7e5]">
        <div className="h-full rounded-full bg-[#ff5c7a]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  current,
  busy,
  onChoose,
}: {
  plan: BillingPlan;
  cycle: "monthly" | "annual";
  current: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const total = cycle === "annual" ? plan.annualPriceMinor : plan.monthlyPriceMinor;
  const monthlyEquivalent =
    cycle === "annual" && total !== null && total > 0 ? Math.round(total / 12) : total;
  const isHighlighted = plan.highlighted;
  const eyebrow =
    plan.id === "free"
      ? "Explore"
      : plan.id === "launch"
        ? "Go live"
        : plan.id === "growth"
          ? "Build pipeline"
          : "Run volume";
  const limitLabel = (value: number | null, noun: string) =>
    value === null
      ? `Custom ${noun}s`
      : `${value.toLocaleString("en-IN")} ${noun}${value === 1 ? "" : "s"}`;
  const limitRows = [
    limitLabel(plan.limits.websites, "website"),
    limitLabel(plan.limits.indexedPages, "indexed page"),
    `${limitLabel(plan.limits.textResponsesPerMonth, "text response")} / month`,
    `${limitLabel(plan.limits.voiceMinutesPerMonth, "voice minute")} / month`,
  ];
  if (plan.limits.seats && plan.limits.seats > 1) {
    limitRows.push(`${plan.limits.seats.toLocaleString("en-IN")} team seats`);
  }
  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-[24px] border p-6 sm:p-7 ${
        isHighlighted
          ? "border-[#0b0b0c] bg-[#0b0b0c] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)]"
          : "border-[#ebebe8] bg-white text-[#0b0b0c]"
      }`}
    >
      {isHighlighted ? (
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,111,145,.45),rgba(179,156,255,.25)_45%,transparent_70%)] blur-2xl" />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`obs-mono text-[11px] font-medium uppercase tracking-[0.14em] ${isHighlighted ? "text-white/50" : "text-[#8a8a8f]"}`}
          >
            {eyebrow}
          </p>
          <h3 className="mt-3 text-[2rem] font-semibold tracking-[-.04em]">{plan.name}</h3>
        </div>
        {isHighlighted && (
          <span className="relative rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white">
            Most popular
          </span>
        )}
      </div>
      <p
        className={`mt-3 min-h-12 text-[14px] leading-6 ${isHighlighted ? "text-white/60" : "text-[#6f6e69]"}`}
      >
        {plan.description}
      </p>
      <div className="mt-7 min-h-[78px]">
        {monthlyEquivalent === 0 ? (
          <p className="text-[2.75rem] font-semibold tracking-[-.055em]">{formatPrice(0)}</p>
        ) : (
          <>
            <div className="flex items-end gap-1.5">
              <span className="text-[2.75rem] font-semibold leading-none tracking-[-.055em]">
                {monthlyEquivalent === null ? "Custom" : formatPrice(monthlyEquivalent)}
              </span>
              {monthlyEquivalent !== null ? (
                <span
                  className={`pb-1 text-[12px] ${isHighlighted ? "text-white/50" : "text-[#8a8a8f]"}`}
                >
                  / month
                </span>
              ) : null}
            </div>
            {total !== null ? (
              <p
                className={`mt-2 text-[11px] ${isHighlighted ? "text-white/45" : "text-[#8a8a8f]"}`}
              >
                {cycle === "annual" ? `${formatPrice(total)} billed yearly` : "Billed monthly"} ·
                USD
              </p>
            ) : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onChoose}
        disabled={current || busy || plan.id === "free"}
        className={`mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full text-sm font-bold transition disabled:cursor-default ${
          current || plan.id === "free"
            ? isHighlighted
              ? "border border-white/15 bg-transparent text-white/50"
              : "border border-[#e7e7e4] bg-[#fafaf9] text-[#8a8a8f]"
            : isHighlighted
              ? "bg-white text-[#0b0b0c] hover:bg-[#f0f0ee] disabled:opacity-60"
              : "bg-[#0b0b0c] text-white hover:bg-[#2a2a2e] disabled:opacity-60"
        }`}
      >
        {current
          ? "Current plan"
          : busy
            ? "Opening checkout…"
            : plan.id === "free"
              ? "Included"
              : `Choose ${plan.name}`}
        {!current && !busy && plan.id !== "free" ? <ChevronRight className="h-3.5 w-3.5" /> : null}
      </button>

      <div className={`my-7 h-px ${isHighlighted ? "bg-white/10" : "bg-[#efefec]"}`} />
      <ul className="space-y-3.5">
        {limitRows.map((label) => (
          <li
            key={label}
            className={`flex gap-3 text-[13px] leading-5 ${isHighlighted ? "text-white/75" : "text-[#3d3d3a]"}`}
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${isHighlighted ? "text-[#ff8ba0]" : "text-[#0b0b0c]"}`}
            />
            {label}
          </li>
        ))}
        {plan.features.slice(0, plan.id === "free" ? 2 : 3).map((feature) => (
          <li
            key={feature}
            className={`flex gap-3 text-[13px] leading-5 ${isHighlighted ? "text-white/75" : "text-[#3d3d3a]"}`}
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${isHighlighted ? "text-[#ff8ba0]" : "text-[#0b0b0c]"}`}
            />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  razorpayScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure checkout could not be loaded."));
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
}

function SettingsView({
  soul,
  onUpdate,
  onDelete,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onDelete: () => void;
}) {
  return (
    <Page title="Settings" description="Manage the selected website and its data." hideHeader>
      <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 lg:border-r lg:border-[#e5e5e3]">
          <Card>
            <SectionHeading
              title="Website"
              description="Identity and visitor access for the selected website."
            />
            <div className="mt-6 flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-black/5 bg-[#f3f3f2]">
                <img
                  src={websiteFaviconUrl(soul.siteUrl)}
                  alt=""
                  className="h-7 w-7 rounded object-contain"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{soul.name}</p>
                <a
                  href={soul.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-sm text-[#0b0b0c] hover:underline"
                >
                  {safeHost(soul.siteUrl)}
                </a>
              </div>
            </div>
            <Field label="Website name" className="mt-6">
              <input
                value={soul.name}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, name: event.target.value }))
                }
                className="clean-input"
              />
            </Field>
            <div className="mt-6 flex items-center justify-between rounded-xl border border-[#e3e3e1] p-4">
              <div>
                <p className="text-sm font-semibold">Visitor widget</p>
                <p className="mt-1 text-xs text-[#7b7974]">Allow voice and chat on this website.</p>
              </div>
              <Toggle
                checked={soul.channels.widgetEnabled}
                onChange={(widgetEnabled) =>
                  onUpdate((current) => ({
                    ...current,
                    channels: { ...current.channels, widgetEnabled },
                  }))
                }
              />
            </div>
          </Card>
        </div>
        <div className="min-w-0 bg-[#f9f9f9]">
          <Card>
            <h3 className="font-semibold">Website data</h3>
            <p className="mt-2 text-sm leading-6 text-[#777671]">
              Download this website’s knowledge, personality, voice, and configuration.
            </p>
            <button
              onClick={() => exportSoul(soul)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e0dfdc] px-4 py-2.5 text-sm font-semibold hover:bg-[#f5f4f3]"
            >
              <Download className="h-4 w-4" />
              Export website
            </button>
          </Card>
          <Card className="border-[#edd8d2]">
            <h3 className="font-semibold text-[#8b493a]">Delete website</h3>
            <p className="mt-2 text-sm leading-6 text-[#8a6a62]">
              Permanently remove its knowledge, settings, and conversations.
            </p>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${soul.name}?`)) onDelete();
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e8c8bf] px-4 py-2.5 text-sm font-semibold text-[#984c3b] hover:bg-[#fff7f4]"
            >
              <Trash2 className="h-4 w-4" />
              Delete website
            </button>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function CreateSoulDialog({
  initialUrl = "",
  onClose,
  onCreate,
}: {
  initialUrl?: string;
  onClose: () => void;
  onCreate: (input: { name: string; url: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name, url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This website could not be added.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-lg rounded-2xl border border-[#dfdedb] bg-white p-6 shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-[#817f7a] hover:bg-[#f2f2f1]"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ebeae8] text-[#0b0b0c]">
          <Globe2 className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Create a website soul</h2>
        <p className="mt-2 text-sm leading-6 text-[#777671]">
          Enter the website once. Obseri will read its important public pages and build the starting
          knowledge.
        </p>
        <Field label="Website URL" className="mt-6">
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://yourwebsite.com"
            className="clean-input"
          />
        </Field>
        <Field label="Name" hint="Optional" className="mt-5">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your website"
            className="clean-input"
          />
        </Field>
        {error && (
          <p className="mt-5 rounded-xl bg-[#fff1f4] px-4 py-3 text-sm text-[#8d2f44]">{error}</p>
        )}
        <button
          disabled={!url.trim() || busy}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e1e1d] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Learn this website
        </button>
      </form>
    </div>
  );
}

function Page({
  title,
  description,
  action,
  hideHeader = false,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full w-full flex-col bg-white">
      {!hideHeader && (
        <div className="flex min-h-[76px] shrink-0 items-center justify-between gap-5 border-b border-[#e5e5e3] px-5 py-4 sm:px-7 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-[#1f1e1d]">
              {title}
            </h1>
            <p className="mt-1 truncate text-xs text-[#82807a]">{description}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`border-b border-[#e5e5e3] bg-white p-5 sm:p-6 lg:p-7 ${className}`}>
      {children}
    </section>
  );
}
function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-[#908d85]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[#7b7974]">{description}</p>
    </div>
  );
}
function StatusBadge({ status }: { status: Soul["status"] }) {
  const label =
    status === "live"
      ? "Live"
      : status === "learning"
        ? "Learning"
        : status === "paused"
          ? "Paused"
          : "Draft";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status === "live" ? "bg-[#e9f9ef] text-[#15803d]" : status === "learning" ? "bg-[#fff4d8] text-[#8b6721]" : "bg-[#f0f0ef] text-[#73726d]"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-[#22c55e]" : status === "learning" ? "animate-pulse bg-[#d99a1e]" : "bg-[#a3a29d]"}`}
      />
      {label}
    </span>
  );
}
function EmptyPanel({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f0ef] text-[#777671] [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#7e7c77]">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ebeae8] text-[#0b0b0c]">
          <Globe2 className="h-6 w-6" />
        </span>
        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Start with your website</h2>
        <p className="mt-3 text-sm leading-6 text-[#777671]">
          Obseri will learn its public pages and help you turn them into a useful, voiced presence.
        </p>
        <button onClick={onCreate} className="primary-button mt-6">
          <Plus className="h-4 w-4" />
          Create website soul
        </button>
      </div>
    </div>
  );
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[#0b0b0c]" : "bg-[#d9d8d4]"}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function websiteFaviconUrl(value: string) {
  const host = safeHost(value) || "obseri.com";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function knowledgePagePath(value: string) {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`;
    return `${url.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return value;
  }
}

function crawlUrlLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}
function exportSoul(soul: Soul) {
  const blob = new Blob([JSON.stringify(soul, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${safeHost(soul.siteUrl)}-soul.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

const DEMO_SOUL: Soul = {
  id: "obseri-demo-soul",
  workspaceId: "local-workspace",
  name: "Obseri Guide",
  siteUrl: "https://obseri.com",
  status: "draft",
  createdAt: "2026-07-14T05:00:00.000Z",
  updatedAt: "2026-07-14T05:00:00.000Z",
  knowledge: {
    rootUrl: "https://obseri.com",
    status: "ready",
    lastCrawledAt: "2026-07-14T05:00:00.000Z",
    crawlDurationMs: 1840,
    errors: [],
    keywords: ["website", "knowledge", "personality", "voice", "widget", "citations"],
    pages: [
      {
        id: "demo-home",
        url: "https://obseri.com",
        title: "Obseri — Give your interface its soul",
        description:
          "Obseri turns any website into a source-grounded conversational presence with a designed personality and voice.",
        hash: "1111111111111111111111111111111111111111111111111111111111111111",
        wordCount: 640,
        capturedAt: "2026-07-14T05:00:00.000Z",
        status: "ready",
        chunks: [
          {
            id: "demo-home-0",
            pageUrl: "https://obseri.com",
            pageTitle: "Obseri — Give your interface its soul",
            text: "Obseri turns any website into a living, conversational presence. It explores public pages, builds a source-grounded knowledge base, and gives the interface a configurable personality and voice.",
            order: 0,
            tokenEstimate: 42,
          },
          {
            id: "demo-home-1",
            pageUrl: "https://obseri.com",
            pageTitle: "Obseri — Give your interface its soul",
            text: "Visitors talk to the website through a minimal widget using text or voice. Answers are grounded in captured website knowledge and include citations to original pages.",
            order: 1,
            tokenEstimate: 37,
          },
        ],
      },
      {
        id: "demo-integrations",
        url: "https://obseri.com/integrations",
        title: "Obseri integrations",
        description:
          "Install the widget with one script and send signed conversation or lead events into your stack.",
        hash: "2222222222222222222222222222222222222222222222222222222222222222",
        wordCount: 410,
        capturedAt: "2026-07-14T05:00:00.000Z",
        status: "ready",
        chunks: [
          {
            id: "demo-integrations-0",
            pageUrl: "https://obseri.com/integrations",
            pageTitle: "Obseri integrations",
            text: "Install the Obseri widget with one script tag. Configure the soul id, launcher position, accent color, and allowed domains.",
            order: 0,
            tokenEstimate: 29,
          },
          {
            id: "demo-integrations-1",
            pageUrl: "https://obseri.com/integrations",
            pageTitle: "Obseri integrations",
            text: "Conversation and lead events can be delivered through signed webhooks. Obseri also exposes APIs for chat, ingestion, voice, and publishing.",
            order: 1,
            tokenEstimate: 31,
          },
        ],
      },
      {
        id: "demo-voice",
        url: "https://obseri.com/voice",
        title: "Voice and consent",
        description:
          "Choose from 10 Neural voices, shared across previews and your website assistant.",
        hash: "3333333333333333333333333333333333333333333333333333333333333333",
        wordCount: 320,
        capturedAt: "2026-07-14T05:00:00.000Z",
        status: "ready",
        chunks: [
          {
            id: "demo-voice-0",
            pageUrl: "https://obseri.com/voice",
            pageTitle: "Voice and consent",
            text: "Obseri offers 10 Neural voices that stay consistent across devices.",
            order: 0,
            tokenEstimate: 28,
          },
        ],
      },
    ],
  },
  personality: {
    name: "Ona",
    role: "Website guide",
    purpose: "Help visitors understand Obseri and take the right next step.",
    tone: "warm",
    traits: ["clear", "curious", "helpful"],
    greeting: "Hi — I’m Ona. Ask me what Obseri could add to your website.",
    instructions:
      "Answer naturally from verified website knowledge. Keep answers concise and useful.",
    guardrails: [
      "Never invent facts beyond the knowledge base.",
      "Say clearly when knowledge is missing.",
    ],
    unknownResponse:
      "I don’t have that in my knowledge yet, but I can point you to the closest source.",
    leadCapture: true,
    escalationEmail: "ayush@flamkilabs.com",
  },
  voice: {
    enabled: true,
    provider: "supertonic",
    profileId: "F1",
    profileName: "Aster",
    browserVoiceName: "",
    language: "en",
    speed: 1,
    pitch: 1,
    cloneConsentRecorded: false,
  },
  appearance: {
    accent: "#ff5c7a",
    position: "bottom-right",
    launcher: "pill",
    theme: "light",
    glass: 0.82,
    welcomeLabel: "Ask this website",
  },
  channels: {
    widgetEnabled: true,
    webhookEnabled: false,
    allowedDomains: ["obseri.com"],
    webhookUrl: "",
    webhookSecret: "",
    publishKey: "",
    widgetToken: "",
  },
  conversations: [],
};

const DEMO_WORKSPACE: SoulWorkspace = {
  id: "local-workspace",
  name: "Obseri Workspace",
  souls: [DEMO_SOUL],
  activeSoulId: DEMO_SOUL.id,
};
