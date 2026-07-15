import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Fingerprint,
  Globe2,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Mic2,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Trash2,
  Tablet,
  Upload,
  UserRound,
  WandSparkles,
  Webhook,
  X,
} from "lucide-react";
import SoulChat from "@/components/SoulChat";
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
  type SoulMessage,
  type SoulWorkspace,
} from "@/lib/soul";
import { rankKnowledgeChunks, type ChatResponse } from "@/lib/conversation";
import { streamWebsiteCrawl } from "@/lib/crawl-client";
import type { CrawlProgressEvent } from "@/lib/knowledge";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Soul Studio · Obseri" },
      {
        name: "description",
        content: "Build the knowledge, personality, voice, and presence behind your website.",
      },
    ],
  }),
  component: SoulStudio,
});

type StudioView =
  "knowledge" | "personality" | "voice" | "playground" | "deploy" | "conversations" | "settings";

const STORAGE_KEY = "obseri.soul-studio.v1";
const SIDEBAR_STORAGE_KEY = "obseri.sidebar-collapsed.v1";

const PAGE_META: Record<StudioView, { title: string; description: string }> = {
  knowledge: { title: "Knowledge", description: "The pages and facts your soul can use." },
  personality: {
    title: "Personality",
    description: "Decide who your website is and how it behaves.",
  },
  voice: { title: "Voice", description: "Choose how your website sounds." },
  playground: {
    title: "Agent",
    description: "Experience your website and its soul exactly as a visitor will.",
  },
  deploy: { title: "Integrate", description: "Publish the widget and connect your systems." },
  conversations: {
    title: "Conversations",
    description: "Understand what visitors are asking for.",
  },
  settings: { title: "Settings", description: "Manage your profile, workspace, and data." },
};

function SoulStudio() {
  const [workspace, setWorkspace] = useState<SoulWorkspace>(DEMO_WORKSPACE);
  const [view, setView] = useState<StudioView>("playground");
  const [hydrated, setHydrated] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [quickStartUrl, setQuickStartUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [crawlEvents, setCrawlEvents] = useState<Record<string, CrawlProgressEvent[]>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWorkspace(normalizeWorkspace(JSON.parse(saved) as SoulWorkspace));
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      // Keep the starter workspace when local data is unavailable.
    } finally {
      setHydrated(true);
    }
  }, []);

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
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }, [hydrated, workspace]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [hydrated, sidebarCollapsed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const soul =
    workspace.souls.find((candidate) => candidate.id === workspace.activeSoulId) ??
    workspace.souls[0] ??
    null;

  function updateSoul(updater: (current: Soul) => Soul) {
    if (!soul) return;
    setWorkspace((current) => ({
      ...current,
      souls: current.souls.map((candidate) =>
        candidate.id === soul.id
          ? { ...updater(candidate), updatedAt: new Date().toISOString() }
          : candidate,
      ),
    }));
  }

  function navigate(next: StudioView) {
    setView(next);
    setMobileNav(false);
    setProfileOpen(false);
  }

  async function createWebsiteSoul(input: { name: string; url: string }) {
    const normalizedUrl = /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`;
    const nextSoul = createSoul(normalizedUrl, input.name);
    setWorkspace((current) => ({
      ...current,
      souls: [...current.souls, nextSoul],
      activeSoulId: nextSoul.id,
    }));
    setCreateOpen(false);
    setQuickStartUrl("");
    setView("knowledge");
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
      setNotice(`Learned ${crawled.pages.length} pages from ${safeHost(source.rootUrl)}.`);
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
    if (!soul || messages.length < 2) return;
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

  return (
    <div className="h-screen overflow-hidden bg-[#f7f7f5] font-sans text-[#191b18]">
      <div className="flex h-full">
        <Sidebar
          workspace={workspace}
          soul={soul}
          view={view}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNav}
          onClose={() => setMobileNav(false)}
          onNavigate={navigate}
          onNew={() => setCreateOpen(true)}
          onExpand={() => setSidebarCollapsed(false)}
          onSoulChange={(id) => setWorkspace((current) => ({ ...current, activeSoulId: id }))}
        />

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            workspace={workspace}
            soul={soul}
            sidebarCollapsed={sidebarCollapsed}
            profileOpen={profileOpen}
            onMenu={() => setMobileNav(true)}
            onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            onProfile={() => setProfileOpen((current) => !current)}
            onNavigate={navigate}
          />

          <main
            className={`mx-auto min-h-0 w-full flex-1 ${
              view === "playground"
                ? "max-w-none overflow-hidden p-0"
                : "max-w-[1240px] overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
            }`}
          >
            {!soul ? (
              <EmptyState onCreate={() => setCreateOpen(true)} />
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
              <PersonalityView soul={soul} onUpdate={updateSoul} />
            ) : view === "voice" ? (
              <VoiceView soul={soul} onUpdate={updateSoul} onNotice={setNotice} />
            ) : view === "playground" ? (
              <PlaygroundView
                soul={soul}
                onUpdate={updateSoul}
                onMessagesChange={saveConversation}
                onIntegrate={() => navigate("deploy")}
              />
            ) : view === "deploy" ? (
              <DeployView soul={soul} onUpdate={updateSoul} onNotice={setNotice} />
            ) : view === "conversations" ? (
              <ConversationsView soul={soul} onTest={() => navigate("playground")} />
            ) : (
              <SettingsView
                soul={soul}
                workspace={workspace}
                onDelete={() => {
                  setWorkspace((current) => {
                    const souls = current.souls.filter((candidate) => candidate.id !== soul.id);
                    return { ...current, souls, activeSoulId: souls[0]?.id ?? null };
                  });
                  setView("knowledge");
                }}
              />
            )}
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
        <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-black/10 bg-[#191b18] px-4 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
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
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onNavigate: (view: StudioView) => void;
  onNew: () => void;
  onExpand: () => void;
  onSoulChange: (id: string) => void;
}) {
  const [soulMenuOpen, setSoulMenuOpen] = useState(false);
  const items: Array<{ id: StudioView; label: string; icon: ReactNode }> = [
    { id: "playground", label: "Agent", icon: <Monitor /> },
    { id: "knowledge", label: "Knowledge", icon: <BookOpen /> },
    { id: "personality", label: "Personality", icon: <Fingerprint /> },
    { id: "voice", label: "Voice", icon: <Mic2 /> },
    { id: "deploy", label: "Integrate", icon: <Code2 /> },
    { id: "conversations", label: "Conversations", icon: <MessageCircle /> },
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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[252px] shrink-0 flex-col overflow-hidden border-r border-[#e3e4e0] bg-white transition-[width,transform] duration-300 ease-out lg:static lg:translate-x-0 ${collapsed ? "lg:w-[72px]" : "lg:w-[252px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between px-5 transition-[padding] duration-300 ${collapsed ? "lg:px-4" : "lg:px-5"}`}
        >
          <Link
            to="/"
            className="overflow-hidden text-xl font-extrabold tracking-[-0.04em]"
            aria-label="Obseri home"
          >
            <span className={collapsed ? "lg:hidden" : ""}>
              Obseri<span className="text-[#74a83b]">.</span>
            </span>
            <span className={`hidden text-lg ${collapsed ? "lg:inline" : ""}`}>
              O<span className="text-[#74a83b]">.</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#6f736d] hover:bg-[#f2f3f0] lg:hidden"
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
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[#dedfdb] bg-white p-2 text-left shadow-sm transition hover:border-[#cfd2cb] hover:bg-[#fafbf9] ${collapsed ? "lg:justify-center lg:p-1.5" : ""}`}
              aria-expanded={soulMenuOpen}
              aria-label={collapsed ? `Open ${soul?.name || "website"} menu` : undefined}
              title={collapsed ? soul?.name || "Choose a website" : undefined}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf4df] text-sm font-bold text-[#476d24] ${collapsed ? "lg:h-8 lg:w-8" : ""}`}
              >
                {soul?.name.charAt(0) || "O"}
              </span>
              <span className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
                <span className="block truncate text-sm font-semibold">
                  {soul?.name || "Website"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[#858a82]">
                  {soul ? safeHost(soul.siteUrl) : "Choose a website"}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#858982] transition ${soulMenuOpen ? "rotate-180" : ""} ${collapsed ? "lg:hidden" : ""}`}
              />
            </button>
          </div>

          {soulMenuOpen && (
            <div className="absolute left-3 right-3 top-[56px] z-[60] overflow-hidden rounded-xl border border-[#dfe1dc] bg-white p-1.5 shadow-[0_16px_40px_rgba(28,32,25,0.14)]">
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#999d96]">
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
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${candidate.id === soul?.id ? "bg-[#f0f5eb]" : "hover:bg-[#f5f6f3]"}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#edf0ea] text-xs font-semibold text-[#62685f]">
                      {candidate.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{candidate.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#8a8e87]">
                        {safeHost(candidate.siteUrl)}
                      </span>
                    </span>
                    {candidate.id === soul?.id && <Check className="h-3.5 w-3.5 text-[#6f9948]" />}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-[#eceee9]" />
              <button
                onClick={() => {
                  setSoulMenuOpen(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#557b32] hover:bg-[#f0f5eb]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#d9e3cf] bg-white">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                Add another website
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === item.id ? "bg-[#efefed] text-[#171916]" : "text-[#666a64] hover:bg-[#f5f5f3] hover:text-[#171916]"}`}
                aria-label={item.label}
                aria-current={view === item.id ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">{item.icon}</span>
                <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="border-t border-[#ecece9] p-3">
          <button
            onClick={() => onNavigate("settings")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${collapsed ? "lg:justify-center lg:px-0" : ""} ${view === "settings" ? "bg-[#efefed] text-[#171916]" : "text-[#666a64] hover:bg-[#f5f5f3]"}`}
            aria-label="Settings"
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="h-[18px] w-[18px]" />
            <span className={collapsed ? "lg:hidden" : ""}>Settings</span>
          </button>
          <a
            href="mailto:flamki@obseri.com"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#666a64] hover:bg-[#f5f5f3] ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
            aria-label="Help"
            title={collapsed ? "Help" : undefined}
          >
            <CircleHelp className="h-[18px] w-[18px]" />
            <span className={collapsed ? "lg:hidden" : ""}>Help</span>
          </a>
        </div>
      </aside>
    </>
  );
}

function Topbar({
  workspace,
  soul,
  sidebarCollapsed,
  profileOpen,
  onMenu,
  onToggleSidebar,
  onProfile,
  onNavigate,
}: {
  workspace: SoulWorkspace;
  soul: Soul | null;
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
    <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#e3e4e0] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-[#666a64] hover:bg-[#f2f3f0] lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#626760] transition hover:bg-[#f1f2ef] hover:text-[#171916] lg:flex"
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
        <div className="relative z-50">
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
            className={`relative z-50 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-extrabold tracking-[-0.05em] transition ${setupOpen ? "border-[#a8c88b] bg-[#f0f7e9] text-[#355d18]" : "border-[#dedfdb] bg-white text-[#20231f] hover:border-[#c7d6b9] hover:bg-[#f7faf4]"}`}
            aria-label="Open setup progress"
            aria-expanded={setupOpen}
            title={`${completeSteps} of ${setupSteps.length} setup steps complete`}
          >
            O<span className="text-[#76aa41]">.</span>
            <span
              className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white px-0.5 text-[8px] font-bold tracking-normal text-white ${completeSteps === setupSteps.length && setupSteps.length ? "bg-[#65953a]" : "bg-[#20231f]"}`}
            >
              {completeSteps}
            </span>
          </button>
          {setupOpen && soul && (
            <SetupProgressMenu
              soul={soul}
              steps={setupSteps}
              onNavigate={(next) => {
                setSetupOpen(false);
                onNavigate(next);
              }}
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.01em]">{workspace.name}</p>
          {soul ? (
            <a
              href={soul.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-xs text-[#7a7e77] transition hover:text-[#4f792c]"
              title={`Open ${safeHost(soul.siteUrl)}`}
            >
              <Globe2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{safeHost(soul.siteUrl)}</span>
            </a>
          ) : (
            <p className="mt-0.5 text-xs text-[#7a7e77]">No website selected</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative z-50">
          <button
            onClick={() => {
              setSetupOpen(false);
              onProfile();
            }}
            className="flex items-center gap-2 rounded-full border border-[#dedfdb] bg-white p-1 pr-2 shadow-sm hover:bg-[#f7f7f5]"
            aria-expanded={profileOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#20221f] text-xs font-semibold text-white">
              BB
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#747870]" />
          </button>
          {profileOpen && <ProfileMenu soul={soul} onNavigate={onNavigate} />}
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
    <div className="absolute left-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#dfe1dc] bg-white shadow-[0_20px_60px_rgba(25,29,22,0.18)]">
      <div className="border-b border-[#eceee9] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Website setup</p>
            <p className="mt-1 truncate text-xs text-[#777c74]">{soul.name}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f0f3ed] px-2.5 py-1 text-[11px] font-semibold text-[#5d6359]">
            {complete} of {steps.length}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ebe5]">
          <div
            className="h-full rounded-full bg-[#75a847] transition-[width] duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="p-2">
        {steps.map((step) => (
          <button
            key={step.view}
            onClick={() => onNavigate(step.view)}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f5f6f3]"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-4 [&_svg]:w-4 ${step.done ? "bg-[#eaf4df] text-[#547d2e]" : "bg-[#f0f1ee] text-[#747971]"}`}
            >
              {step.done ? <Check /> : step.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{step.title}</span>
              <span className="mt-0.5 block truncate text-xs text-[#7a7f77]">{step.detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a1a59e] transition group-hover:translate-x-0.5 group-hover:text-[#555b52]" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[#eceee9] bg-[#fafbf9] px-4 py-3 text-xs text-[#6f756b]">
        <span
          className={`h-2 w-2 rounded-full ${complete === steps.length ? "bg-[#70a43f]" : "bg-[#c4a14e]"}`}
        />
        {complete === steps.length
          ? "Your website soul is fully set up."
          : `${steps.length - complete} setup ${steps.length - complete === 1 ? "step" : "steps"} remaining.`}
      </div>
    </div>
  );
}

function ProfileMenu({
  soul,
  onNavigate,
}: {
  soul: Soul | null;
  onNavigate: (view: StudioView) => void;
}) {
  return (
    <div className="absolute right-0 top-12 z-50 w-[310px] overflow-hidden rounded-2xl border border-[#dedfdb] bg-white p-2 shadow-[0_18px_55px_rgba(0,0,0,.14)]">
      <div className="p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#20221f] text-sm font-semibold text-white">
            BB
          </span>
          <div>
            <p className="text-sm font-semibold">Obseri Founder</p>
            <p className="text-xs text-[#7b7f78]">Local workspace</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[#e5e6e2] bg-[#fafaf8] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#73776f]">Founder plan</span>
          <span className="rounded-md bg-[#20221f] px-2 py-1 text-xs font-semibold text-white">
            Active
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3e4df]">
          <div className="h-full w-[42%] rounded-full bg-[#7da84c]" />
        </div>
        <p className="mt-2 text-xs text-[#777b74]">
          {soul?.knowledge.pages.length ?? 0} pages learned
        </p>
      </div>
      <div className="my-2 h-px bg-[#ecece9]" />
      <MenuRow
        icon={<UserRound />}
        label="Profile and workspace"
        onClick={() => onNavigate("settings")}
      />
      <MenuRow icon={<Settings />} label="Settings" onClick={() => onNavigate("settings")} />
      <div className="my-2 h-px bg-[#ecece9]" />
      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#a1a49e]">
        <LogOut className="h-4 w-4" />
        Sign out <span className="ml-auto text-xs">OAuth soon</span>
      </div>
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
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#4f534d] hover:bg-[#f3f4f1] [&_svg]:h-4 [&_svg]:w-4"
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
    ? rankKnowledgeChunks(
        testQuery,
        knowledge.pages.filter((page) => page.enabled !== false).flatMap((page) => page.chunks),
      ).slice(0, 5)
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
    <Page title="Knowledge" description="The pages and facts your soul can use.">
      {(crawlEvents.length > 0 || soul.knowledge.status === "crawling") && (
        <CrawlProgressPanel events={crawlEvents} />
      )}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-5 border-b border-[#e8eae5] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-semibold">Knowledge library</h2>
                <span className="rounded-full bg-[#edf4e6] px-2 py-0.5 text-[10px] font-semibold text-[#5e823a]">
                  {knowledge.pages.filter((page) => page.enabled !== false).length} active
                </span>
              </div>
              <p className="mt-1 text-xs text-[#7c8179]">
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
              <button onClick={() => setAddOpen(true)} className="primary-button h-10 px-4 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add source
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-b border-[#e8eae5] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="relative w-full sm:max-w-[380px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#92968f]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, URLs, and content"
              className="h-9 w-full rounded-lg border border-[#dfe1dc] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#9fbb83]"
            />
          </div>
          <p className="text-[11px] text-[#7d827a]">{pages.length} documents</p>
        </div>
        {!pages.length && soul.knowledge.status === "crawling" ? (
          <div className="flex items-center gap-3 px-6 py-8 text-sm text-[#666a63]">
            <LoaderCircle className="h-4 w-4 animate-spin text-[#709c43]" />
            Pages will appear here when they are ready.
          </div>
        ) : pages.length ? (
          <div className="divide-y divide-[#ecece9]">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => setSelectedPageId(page.id)}
                className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-[#fafbf9] sm:px-6"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e8e1] bg-[#f5f7f3] text-[#687165]">
                  <FileText className="h-[15px] w-[15px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#252824]">
                    {page.title || safeHost(page.url)}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-[#858a82]">
                    {knowledgePagePath(page.url)}
                  </p>
                </div>
                <span
                  className={`hidden rounded-full px-2 py-1 text-[10px] font-medium sm:block ${page.enabled === false ? "bg-[#f0f1ee] text-[#8b8f88]" : page.changeType === "changed" || page.changeType === "new" ? "bg-[#edf4e6] text-[#5b8037]" : "bg-[#f3f4f1] text-[#747970]"}`}
                >
                  {page.enabled === false
                    ? "Excluded"
                    : page.changeType === "new"
                      ? "New"
                      : page.changeType === "changed"
                        ? "Updated"
                        : `${page.chunks.length} blocks`}
                </span>
                <span className="hidden text-[10px] text-[#8b8f88] md:block">
                  {formatBytes(page.sizeBytes ?? 0)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-[#9a9e97]" />
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
      <Card className="p-0">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f4ec] text-[#5e823a]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Retrieval lab</h3>
                <p className="mt-0.5 text-[11px] text-[#7e837b]">
                  See exactly what the assistant will retrieve before it answers.
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-[#8c9189]" />
          </summary>
          <div className="border-t border-[#e8eae5] px-5 py-5 sm:px-6">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e938b]" />
              <input
                value={testQuery}
                onChange={(event) => setTestQuery(event.target.value)}
                placeholder="Try a real visitor question, e.g. What does the Pro plan include?"
                className="clean-input pl-10"
              />
            </div>
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
                      className="flex w-full gap-3 rounded-xl border border-[#e5e7e2] p-3 text-left hover:bg-[#fafbf9]"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef4e8] text-[10px] font-bold text-[#5b8037]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-xs font-semibold">{hit.pageTitle}</span>
                          <span className="shrink-0 text-[10px] text-[#6d736a]">
                            score {hit.score.toFixed(2)}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-[#747970]">
                          {hit.text}
                        </span>
                        <span className="mt-1.5 block text-[10px] text-[#8b8f88]">
                          Matched {hit.matchedTerms.join(", ")}
                          {hit.phraseMatch ? " · exact phrase" : ""}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-xl bg-[#f7f8f5] p-4 text-xs text-[#777c74]">
                    No grounded evidence matched. The assistant will use the configured “I don’t
                    know” response.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      </Card>
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
    </Page>
  );
}

function AddKnowledgeSourceDialog({
  onClose,
  onWebsite,
  onManual,
}: {
  onClose: () => void;
  onWebsite: (source: KnowledgeSource) => Promise<void>;
  onManual: (name: string, content: string) => void;
}) {
  const [kind, setKind] = useState<"website" | "manual">("website");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pageLimit, setPageLimit] = useState(40);
  const [crawlDepth, setCrawlDepth] = useState(4);
  const [cadence, setCadence] = useState<KnowledgeSource["cadence"]>("manual");
  const [excludePatterns, setExcludePatterns] = useState("/admin/*, /account/*, /search*");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
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
        className="relative w-full max-w-[560px] rounded-2xl border border-black/10 bg-white shadow-[0_30px_90px_rgba(0,0,0,.18)]"
      >
        <div className="flex items-start justify-between border-b border-[#e8eae5] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Add knowledge source</h2>
            <p className="mt-1 text-xs text-[#7d827a]">
              Connect a site or add trusted text your agent can cite.
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-button">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f4f1] p-1">
            <button
              type="button"
              onClick={() => setKind("website")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === "website" ? "bg-white shadow-sm" : "text-[#747970]"}`}
            >
              <Globe2 className="mr-2 inline h-3.5 w-3.5" />
              Website crawl
            </button>
            <button
              type="button"
              onClick={() => setKind("manual")}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${kind === "manual" ? "bg-white shadow-sm" : "text-[#747970]"}`}
            >
              <FileText className="mr-2 inline h-3.5 w-3.5" />
              Paste text
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
              <Field label="Exclude paths" hint="Comma separated · supports *" className="mt-4">
                <input
                  value={excludePatterns}
                  onChange={(event) => setExcludePatterns(event.target.value)}
                  placeholder="/admin/*, /account/*"
                  className="clean-input font-mono text-xs"
                />
              </Field>
              <div className="mt-4 rounded-xl border border-[#e2e8dc] bg-[#f6faf2] p-3 text-[11px] leading-5 text-[#617153]">
                Obseri respects robots.txt, discovers sitemaps and llms.txt, removes duplicate
                pages, and shows every crawl step live.
              </div>
            </>
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
        <div className="flex justify-end gap-2 border-t border-[#e8eae5] px-6 py-4">
          <button type="button" onClick={onClose} className="secondary-button">
            Cancel
          </button>
          <button className="primary-button">
            <Plus className="h-4 w-4" />
            {kind === "website" ? "Start crawl" : "Add knowledge"}
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
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e5e7e2] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e4e7e0] bg-[#f5f7f3]">
              <Globe2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[#858a82]">Knowledge document</p>
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
          <aside className="overflow-y-auto border-r border-[#e5e7e2] bg-[#fafbf9] p-5 sm:p-6">
            <div className="flex items-center justify-between rounded-xl border border-[#e3e5e0] bg-white p-3">
              <div>
                <p className="text-xs font-semibold">Use in answers</p>
                <p className="mt-0.5 text-[10px] text-[#858a82]">Exclude without deleting</p>
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a8f87]">
                    Normalized content
                  </p>
                  <p className="mt-1 text-xs text-[#777c74]">
                    This is the clean evidence sent to retrieval, not raw page HTML.
                  </p>
                </div>
                <span className="rounded-lg bg-[#f2f4f0] px-2.5 py-1.5 text-[10px] text-[#71766e]">
                  {page.chunks.length} chunks
                </span>
              </div>
              {editing ? (
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-[520px] w-full resize-none rounded-xl border border-[#b6c9a4] bg-white p-5 font-mono text-xs leading-6 outline-none ring-4 ring-[#eff5e9]"
                />
              ) : (
                <article className="whitespace-pre-wrap rounded-xl border border-[#e3e5e0] bg-[#fcfcfb] p-5 text-sm leading-7 text-[#3f443d]">
                  {content || "No readable content."}
                </article>
              )}
              {!!revisions.length && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold">Revision history</h3>
                  <div className="mt-2 divide-y divide-[#eceee9] rounded-xl border border-[#e3e5e0]">
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
                          <span className="text-[#858a82]">
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
      <dt className="font-semibold text-[#4b5049]">{label}</dt>
      <dd className="mt-1 break-words leading-5 text-[#7d827a]">
        {link && /^https?:\/\//.test(value) ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-[#567c32] hover:underline"
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
  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : [content]) {
    if (current && current.length + paragraph.length > 1_200) {
      blocks.push(current);
      current = paragraph;
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) blocks.push(current);
  return blocks
    .flatMap((block) => (block.length <= 1_400 ? [block] : (block.match(/[\s\S]{1,1400}/g) ?? [])))
    .map((text, order) => ({
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
          failed ? "border-[#efd7cf] bg-[#fff8f5]" : "border-[#dce8d2] bg-[#f7fbf3]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              failed ? "bg-[#ffebe5] text-[#a14f39]" : "bg-[#e7f2dd] text-[#5f8738]"
            }`}
          >
            {failed ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {failed ? "Website crawl stopped" : "Knowledge is up to date"}
            </p>
            <p className="mt-0.5 truncate text-xs text-[#747a71]">
              {latest?.message ?? "Website processing finished."}
            </p>
          </div>
        </div>
        {!failed && (
          <div className="flex items-center gap-3 pl-11 text-[11px] text-[#6f766b] sm:pl-0">
            <span>{stats.fetched} read</span>
            <span className="h-1 w-1 rounded-full bg-[#b8bdb3]" />
            <span>{stats.indexed} learned</span>
            <span className="h-1 w-1 rounded-full bg-[#b8bdb3]" />
            <span>{stats.duplicates + stats.blocked + stats.skipped} filtered</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dde2d8] bg-white shadow-[0_12px_35px_rgba(36,46,29,0.06)]">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              failed
                ? "bg-[#fff0eb] text-[#a14f39]"
                : complete
                  ? "bg-[#edf6e6] text-[#5f8738]"
                  : "bg-[#f0f5eb] text-[#668d40]"
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
                <p className="mt-1 truncate text-sm text-[#71766e]">
                  {latest?.message ?? "Preparing the crawler and checking website rules"}
                </p>
              </div>
              <span className="rounded-full bg-[#f2f3f0] px-3 py-1 text-xs font-semibold tabular-nums text-[#666b63]">
                {progress}%
              </span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#eceee9]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${failed ? "bg-[#c86e56]" : "bg-[#78a64b]"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e6e8e3] bg-[#e6e8e3] sm:grid-cols-4">
          {[
            ["Discovered", stats.discovered],
            ["Read", stats.fetched],
            ["Learned", stats.indexed],
            ["Filtered", stats.skipped + stats.duplicates + stats.blocked],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#fafbf9] px-4 py-3">
              <p className="text-lg font-semibold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-[#7b8078]">{label}</p>
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
                    <LoaderCircle className="h-4 w-4 animate-spin text-[#78a64b]" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-[#8b9188]" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#646961]">{event.message}</span>
                {event.url && (
                  <span className="hidden max-w-[260px] truncate text-xs text-[#959991] lg:block">
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

function PersonalityView({
  soul,
  onUpdate,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
}) {
  const update = (patch: Partial<Soul["personality"]>) =>
    onUpdate((current) => ({ ...current, personality: { ...current.personality, ...patch } }));
  return (
    <Page
      title="Shape the personality"
      description="Keep it recognizable, useful, and true to the website."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <SectionHeading title="Identity" description="What should visitors call it?" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={soul.personality.name}
                  onChange={(event) => update({ name: event.target.value })}
                  className="clean-input"
                />
              </Field>
              <Field label="Role">
                <input
                  value={soul.personality.role}
                  onChange={(event) => update({ role: event.target.value })}
                  className="clean-input"
                />
              </Field>
            </div>
            <Field label="Purpose" className="mt-5">
              <textarea
                value={soul.personality.purpose}
                onChange={(event) => update({ purpose: event.target.value })}
                rows={3}
                className="clean-input resize-none"
              />
            </Field>
          </Card>
          <Card>
            <SectionHeading title="Tone" description="Choose one clear communication style." />
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TONES.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => update({ tone: tone.id })}
                  className={`rounded-xl border px-4 py-3 text-left transition ${soul.personality.tone === tone.id ? "border-[#8aaf62] bg-[#f1f7ea]" : "border-[#e1e2de] hover:bg-[#fafaf8]"}`}
                >
                  <p className="text-sm font-semibold capitalize">{tone.id}</p>
                  <p className="mt-1 text-xs text-[#7b7f78]">{tone.detail}</p>
                </button>
              ))}
            </div>
            <Field label="Traits" hint="Separate with commas" className="mt-5">
              <input
                value={soul.personality.traits.join(", ")}
                onChange={(event) =>
                  update({
                    traits: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .slice(0, 8),
                  })
                }
                className="clean-input"
              />
            </Field>
          </Card>
          <Card>
            <SectionHeading
              title="Behavior"
              description="Simple instructions are usually strongest."
            />
            <Field label="Greeting" className="mt-5">
              <textarea
                value={soul.personality.greeting}
                onChange={(event) => update({ greeting: event.target.value })}
                rows={2}
                className="clean-input resize-none"
              />
            </Field>
            <Field label="Answering instructions" className="mt-5">
              <textarea
                value={soul.personality.instructions}
                onChange={(event) => update({ instructions: event.target.value })}
                rows={4}
                className="clean-input resize-none"
              />
            </Field>
            <Field label="When it does not know" className="mt-5">
              <textarea
                value={soul.personality.unknownResponse}
                onChange={(event) => update({ unknownResponse: event.target.value })}
                rows={2}
                className="clean-input resize-none"
              />
            </Field>
          </Card>
        </div>
        <div className="xl:sticky xl:top-24 xl:h-fit">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#7a7e77]">
              Preview
            </p>
            <div className="mt-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eaf4df] font-semibold text-[#4c7327]">
                {soul.personality.name.charAt(0)}
              </span>
              <div>
                <p className="font-semibold">{soul.personality.name}</p>
                <p className="text-sm text-[#787c75]">{soul.personality.role}</p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl rounded-tl-md bg-[#f0f1ee] p-4 text-sm leading-6 text-[#363a35]">
              {soul.personality.greeting}
            </div>
            <div className="mt-6 border-t border-[#ecece9] pt-5">
              <p className="text-sm font-medium">Current character</p>
              <p className="mt-2 text-sm leading-6 text-[#73776f]">
                {soul.personality.tone}, {soul.personality.traits.join(", ") || "helpful"}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

type VoiceboxProfile = {
  id: string;
  name: string;
  description?: string | null;
  language?: string;
  voice_type?: string;
  preset_engine?: string | null;
  preset_voice_id?: string | null;
  default_engine?: string | null;
  sample_count?: number;
};

type VoiceboxPreset = {
  engine: "kokoro" | "qwen_custom_voice";
  voiceId: string;
  name: string;
  gender: string;
  language: string;
};

type StudioVoice = {
  id: string;
  name: string;
  detail: string;
  language: string;
  provider: "browser" | "voicebox";
  browserVoiceName?: string;
  profileId?: string;
  presetEngine?: "kokoro" | "qwen_custom_voice";
  presetVoiceId?: string;
  gender?: string;
};

const VOICE_GRADIENTS = [
  "linear-gradient(135deg,#dce9d2 0%,#7a9b8b 48%,#293a34 100%)",
  "linear-gradient(135deg,#f4d3b4 0%,#b86b54 46%,#422a2d 100%)",
  "linear-gradient(135deg,#d7d8f5 0%,#7874ba 48%,#302a55 100%)",
  "linear-gradient(135deg,#d5eef0 0%,#5e9fa4 46%,#173c43 100%)",
  "linear-gradient(135deg,#f1e2b8 0%,#aa8a52 46%,#3b3023 100%)",
  "linear-gradient(135deg,#ead7e8 0%,#956d91 48%,#392a3b 100%)",
];

const VOICE_WAVEFORM = [18, 30, 44, 26, 54, 36, 22, 48, 62, 32, 46, 24, 58, 38, 20, 42, 30];

function voiceGradient(id: string) {
  const hash = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return VOICE_GRADIENTS[hash % VOICE_GRADIENTS.length];
}

function cleanVoiceName(name: string) {
  return (
    name
      .replace(/^(Microsoft|Google|Apple)\s+/i, "")
      .replace(/\s+Online\s*\(Natural\).*$/i, "")
      .replace(/\s+-\s+.*$/, "")
      .trim() || "Natural"
  );
}

function languageName(code: string) {
  const normalized = code || "en";
  try {
    const language = new Intl.DisplayNames(["en"], { type: "language" }).of(
      normalized.split("-")[0],
    );
    return language ? `${language} · ${normalized}` : normalized;
  } catch {
    return normalized;
  }
}

function VoiceView({
  soul,
  onUpdate,
  onNotice,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onNotice: (message: string) => void;
}) {
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicebox, setVoicebox] = useState<{
    connected: boolean;
    profiles: VoiceboxProfile[];
    presets: VoiceboxPreset[];
    message?: string;
  }>({ connected: false, profiles: [], presets: [] });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<"explore" | "mine">("explore");
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [previewText, setPreviewText] = useState(
    `Hi, I’m ${soul.personality.name}. How can I help you today?`,
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const audioRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const previewRequestRef = useRef<AbortController | null>(null);
  const previewTokenRef = useRef(0);

  useEffect(() => {
    const load = () => setBrowserVoices(window.speechSynthesis?.getVoices() ?? []);
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    void fetch("/api/voice/profiles")
      .then((response) => response.json())
      .then(
        (data: {
          connected?: boolean;
          profiles?: VoiceboxProfile[];
          presets?: VoiceboxPreset[];
          message?: string;
        }) =>
          setVoicebox({
            connected: Boolean(data.connected),
            profiles: Array.isArray(data.profiles) ? data.profiles : [],
            presets: Array.isArray(data.presets) ? data.presets : [],
            message: data.message,
          }),
      )
      .catch(() => undefined);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(
    () => () => {
      previewTokenRef.current += 1;
      previewRequestRef.current?.abort();
      previewRequestRef.current = null;
      window.speechSynthesis?.cancel();
      if (audioRef.current) {
        audioRef.current.audio.pause();
        URL.revokeObjectURL(audioRef.current.url);
        audioRef.current = null;
      }
    },
    [],
  );

  const update = (patch: Partial<Soul["voice"]>) =>
    onUpdate((current) => ({ ...current, voice: { ...current.voice, ...patch } }));

  const defaultVoice: StudioVoice = {
    id: "browser:default",
    name: "Natural",
    detail: "Balanced device voice · ready now",
    language: soul.voice.language || "en",
    provider: "browser",
    browserVoiceName: "",
  };
  const presetVoices: StudioVoice[] = voicebox.presets.map((preset) => {
    const profile = voicebox.profiles.find(
      (candidate) =>
        candidate.preset_engine === preset.engine && candidate.preset_voice_id === preset.voiceId,
    );
    const engineLabel = preset.engine === "kokoro" ? "Kokoro" : "Qwen";
    const gender = preset.gender
      ? `${preset.gender.charAt(0).toUpperCase()}${preset.gender.slice(1)}`
      : "Preset";
    return {
      id: `preset:${preset.engine}:${preset.voiceId}`,
      name: preset.name,
      detail: `${gender} · ${languageName(preset.language)} · ${engineLabel}`,
      language: preset.language,
      provider: "voicebox" as const,
      profileId: profile?.id,
      presetEngine: preset.engine,
      presetVoiceId: preset.voiceId,
      gender: preset.gender,
    };
  });
  const customVoices: StudioVoice[] = voicebox.profiles.map((profile) => ({
    id:
      profile.voice_type === "preset" && profile.preset_engine && profile.preset_voice_id
        ? `preset:${profile.preset_engine}:${profile.preset_voice_id}`
        : `voicebox:${profile.id}`,
    name: profile.name,
    detail: `${languageName(profile.language || soul.voice.language)} · ${profile.voice_type === "preset" ? `${profile.preset_engine === "kokoro" ? "Kokoro" : "Qwen"} preset` : "Cloned voice"}`,
    language: profile.language || soul.voice.language,
    provider: "voicebox" as const,
    profileId: profile.id,
    presetEngine:
      profile.preset_engine === "kokoro" || profile.preset_engine === "qwen_custom_voice"
        ? profile.preset_engine
        : undefined,
    presetVoiceId: profile.preset_voice_id ?? undefined,
  }));
  const deviceVoices: StudioVoice[] = [
    defaultVoice,
    ...browserVoices.map((voice) => ({
      id: `browser:${voice.name}:${voice.lang}`,
      name: cleanVoiceName(voice.name),
      detail: `${languageName(voice.lang)} · ${voice.localService ? "On-device" : "Streaming"}`,
      language: voice.lang,
      provider: "browser" as const,
      browserVoiceName: voice.name,
    })),
  ];
  const exploreVoices: StudioVoice[] =
    soul.voice.provider === "browser" || !voicebox.connected || !presetVoices.length
      ? deviceVoices
      : presetVoices;
  const activeVoice =
    soul.voice.provider === "voicebox"
      ? (customVoices.find((voice) => voice.profileId === soul.voice.profileId) ?? {
          id: `voicebox:${soul.voice.profileId || "selected"}`,
          name: soul.voice.profileName || "Custom voice",
          detail: `${languageName(soul.voice.language)} · Custom profile`,
          language: soul.voice.language,
          provider: "voicebox" as const,
          profileId: soul.voice.profileId,
        })
      : (deviceVoices.find((voice) => voice.browserVoiceName === soul.voice.browserVoiceName) ??
        defaultVoice);
  const mineVoices = Array.from(
    new Map<string, StudioVoice>([
      [activeVoice.id, activeVoice] as const,
      ...customVoices.map((voice) => [voice.id, voice] as const),
    ]).values(),
  );
  const tabVoices = libraryTab === "explore" ? exploreVoices : mineVoices;
  const languageOptions = Array.from(new Set(tabVoices.map((voice) => voice.language))).slice(0, 5);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredVoices = tabVoices.filter(
    (voice) =>
      (languageFilter === "all" || voice.language === languageFilter) &&
      (!normalizedQuery ||
        voice.name.toLowerCase().includes(normalizedQuery) ||
        voice.detail.toLowerCase().includes(normalizedQuery)),
  );

  useEffect(() => {
    if (activeVoice.provider !== "voicebox" || !activeVoice.profileId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: previewText,
          profileId: activeVoice.profileId,
          language: activeVoice.language,
          engine: activeVoice.presetEngine,
          speed: soul.voice.speed,
        }),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeVoice.language,
    activeVoice.presetEngine,
    activeVoice.profileId,
    activeVoice.provider,
    previewText,
    soul.voice.speed,
  ]);

  function stopPreview() {
    previewTokenRef.current += 1;
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.audio.pause();
      URL.revokeObjectURL(audioRef.current.url);
      audioRef.current = null;
    }
    setPlayingId(null);
  }

  async function ensureVoiceProfile(voice: StudioVoice) {
    if (voice.provider !== "voicebox" || voice.profileId) return voice;
    if (!voice.presetEngine || !voice.presetVoiceId)
      throw new Error("This Voicebox profile is not ready yet.");

    setPreparingId(voice.id);
    try {
      const response = await fetch("/api/voice/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engine: voice.presetEngine,
          voiceId: voice.presetVoiceId,
          name: voice.name,
          language: voice.language,
        }),
      });
      const payload = (await response.json()) as {
        profile?: VoiceboxProfile;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile)
        throw new Error(payload.error?.message || "Voicebox could not prepare this voice.");
      setVoicebox((current) => ({
        ...current,
        profiles: current.profiles.some((profile) => profile.id === payload.profile?.id)
          ? current.profiles
          : [...current.profiles, payload.profile as VoiceboxProfile],
      }));
      return { ...voice, profileId: payload.profile.id };
    } finally {
      setPreparingId(null);
    }
  }

  async function previewVoice(voice: StudioVoice) {
    if (playingId === voice.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const token = previewTokenRef.current;
    setPlayingId(voice.id);

    let playableVoice = voice;
    if (voice.provider === "voicebox" && !voice.profileId) {
      try {
        playableVoice = await ensureVoiceProfile(voice);
      } catch (error) {
        setPlayingId(null);
        onNotice(error instanceof Error ? error.message : "Voicebox could not prepare this voice.");
        return;
      }
    }

    if (playableVoice.provider === "voicebox" && playableVoice.profileId) {
      const previewRequest = new AbortController();
      previewRequestRef.current = previewRequest;
      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: previewText,
            profileId: playableVoice.profileId,
            language: playableVoice.language,
            engine: playableVoice.presetEngine,
            speed: soul.voice.speed,
          }),
          signal: previewRequest.signal,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(payload?.error?.message || "Voicebox preview is unavailable.");
        }
        if (previewTokenRef.current !== token) return;
        const blob = await response.blob();
        if (previewTokenRef.current !== token) return;
        previewRequestRef.current = null;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = { audio, url };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setPlayingId(null);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setPlayingId(null);
          onNotice("The voice preview could not be played.");
        };
        await audio.play();
      } catch (error) {
        if (previewRequestRef.current === previewRequest) previewRequestRef.current = null;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPlayingId(null);
        onNotice(error instanceof Error ? error.message : "Voice preview failed.");
      }
      return;
    }

    if (!("speechSynthesis" in window)) {
      setPlayingId(null);
      onNotice("Voice previews are not supported in this browser.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(previewText);
    utterance.lang = voice.language;
    utterance.rate = soul.voice.speed;
    utterance.pitch = soul.voice.pitch;
    const selected = browserVoices.find(
      (candidate) => candidate.name === voice.browserVoiceName && candidate.lang === voice.language,
    );
    if (selected) utterance.voice = selected;
    utterance.onend = () => {
      if (previewTokenRef.current === token) setPlayingId(null);
    };
    utterance.onerror = () => {
      if (previewTokenRef.current === token) setPlayingId(null);
    };
    window.speechSynthesis.speak(utterance);
  }

  async function selectVoice(voice: StudioVoice) {
    stopPreview();
    let selectedVoice = voice;
    if (voice.provider === "voicebox" && !voice.profileId) {
      try {
        selectedVoice = await ensureVoiceProfile(voice);
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Voicebox could not prepare this voice.");
        return;
      }
    }
    if (selectedVoice.provider === "voicebox") {
      update({
        enabled: true,
        provider: "voicebox",
        profileId: selectedVoice.profileId ?? "",
        profileName: selectedVoice.name,
        language: selectedVoice.language,
      });
    } else {
      update({
        enabled: true,
        provider: "browser",
        profileId: "",
        profileName: selectedVoice.name,
        browserVoiceName: selectedVoice.browserVoiceName ?? "",
        language: selectedVoice.language,
      });
    }
    onNotice(`${selectedVoice.name} is now your active voice.`);
  }

  return (
    <Page title="Choose a voice" description="Explore, preview, and shape how your website sounds.">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-2xl border border-[#dedfdb] bg-white shadow-sm">
            <div className="relative overflow-hidden bg-[#11130f] p-6 text-white sm:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(183,247,116,.15),transparent_34%),radial-gradient(circle_at_8%_100%,rgba(116,150,247,.13),transparent_38%)]" />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b7f774] shadow-[0_0_12px_rgba(183,247,116,.7)]" />
                  Active voice
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/45">{soul.voice.enabled ? "On" : "Off"}</span>
                  <Toggle
                    checked={soul.voice.enabled}
                    onChange={(enabled) => update({ enabled })}
                  />
                </div>
              </div>

              <div className="relative mt-9 flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/15 text-xl font-semibold shadow-[0_12px_40px_rgba(0,0,0,.35)]"
                    style={{ background: voiceGradient(activeVoice.id) }}
                  >
                    {activeVoice.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-semibold tracking-[-0.035em]">
                      {activeVoice.name}
                    </h2>
                    <p className="mt-1 truncate text-sm text-white/48">{activeVoice.detail}</p>
                  </div>
                </div>
                <button
                  onClick={() => void previewVoice(activeVoice)}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-semibold text-[#171a17] transition hover:bg-[#b7f774]"
                >
                  {playingId === activeVoice.id ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                  {playingId === activeVoice.id ? "Stop preview" : "Preview voice"}
                </button>
              </div>

              <div className="relative mt-9 flex h-16 items-center gap-1 rounded-xl border border-white/8 bg-black/20 px-4">
                {VOICE_WAVEFORM.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={`min-w-0 flex-1 rounded-full bg-white/25 transition duration-500 ${playingId === activeVoice.id ? "animate-pulse bg-[#b7f774]/70" : ""}`}
                    style={{ height }}
                  />
                ))}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <label className="block">
                <span className="flex items-center justify-between text-sm font-medium">
                  <span>Preview script</span>
                  <span className="text-xs font-normal text-[#8a8e87]">
                    {previewText.length}/240
                  </span>
                </span>
                <textarea
                  value={previewText}
                  maxLength={240}
                  rows={3}
                  onChange={(event) => setPreviewText(event.target.value)}
                  className="clean-input mt-2 resize-none leading-6"
                />
              </label>

              <div className="mt-6 grid gap-x-6 border-t border-[#ecece9] pt-1 sm:grid-cols-2">
                <Range
                  label="Speed"
                  value={soul.voice.speed}
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  onChange={(speed) => update({ speed })}
                />
                <Range
                  label="Pitch"
                  value={soul.voice.pitch}
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  onChange={(pitch) => update({ pitch })}
                />
              </div>

              <div className="mt-6 flex flex-col gap-4 border-t border-[#ecece9] pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Voice engine</p>
                  <p className="mt-1 text-xs text-[#7b7f78]">
                    Browser voices are instant. Voicebox unlocks custom profiles.
                  </p>
                </div>
                <div className="flex rounded-xl bg-[#f1f2ef] p-1 text-xs font-semibold">
                  <button
                    onClick={() => void selectVoice(defaultVoice)}
                    className={`rounded-lg px-3 py-2 transition ${soul.voice.provider === "browser" ? "bg-white shadow-sm" : "text-[#777b74]"}`}
                  >
                    Browser
                  </button>
                  <button
                    disabled={!voicebox.connected || !customVoices.length}
                    onClick={() => {
                      if (customVoices[0]) void selectVoice(customVoices[0]);
                    }}
                    className={`rounded-lg px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${soul.voice.provider === "voicebox" ? "bg-white shadow-sm" : "text-[#777b74]"}`}
                  >
                    Voicebox
                  </button>
                </div>
              </div>
            </div>
          </section>

          <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0ebfa] text-[#7257a0]">
                <Mic2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Clone an authorized voice</h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-[#747870]">
                  Create a custom profile from a clean sample you own or have permission to use.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[#777b74]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#638c3b]" /> Consent is recorded with
                  every clone.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCloneOpen(true)}
              disabled={!voicebox.connected}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#dfe0dc] px-4 text-xs font-semibold transition hover:bg-[#f6f6f4] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Upload className="h-4 w-4" /> Clone voice
            </button>
          </Card>
        </div>

        <section className="flex h-[calc(100vh-190px)] min-h-[590px] max-h-[730px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#dedfdb] bg-white shadow-sm xl:sticky xl:top-0">
          <div className="border-b border-[#ecece9] px-5 pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Voice library</h2>
                <p className="mt-1 text-xs text-[#7c8079]">
                  Explore and choose your website voice.
                </p>
              </div>
              <span className="rounded-full bg-[#f1f2ef] px-2.5 py-1 text-xs font-medium text-[#696d66]">
                {tabVoices.length} voices
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 text-sm">
              <button
                onClick={() => {
                  setLibraryTab("explore");
                  setLanguageFilter("all");
                }}
                className={`border-b-2 px-3 pb-3 font-medium transition ${libraryTab === "explore" ? "border-[#1b1d1a] text-[#1b1d1a]" : "border-transparent text-[#8a8e87]"}`}
              >
                Explore
              </button>
              <button
                onClick={() => {
                  setLibraryTab("mine");
                  setLanguageFilter("all");
                }}
                className={`border-b-2 px-3 pb-3 font-medium transition ${libraryTab === "mine" ? "border-[#1b1d1a] text-[#1b1d1a]" : "border-transparent text-[#8a8e87]"}`}
              >
                My voices
              </button>
            </div>
          </div>

          <div className="border-b border-[#ecece9] p-4">
            <label className="flex h-11 items-center gap-3 rounded-xl border border-[#dfe0dc] px-3 transition focus-within:border-[#969b93]">
              <Search className="h-4 w-4 shrink-0 text-[#8a8e87]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search voices"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9b9f98]"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear voice search">
                  <X className="h-4 w-4 text-[#8a8e87]" />
                </button>
              )}
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-[11px] font-medium">
              <button
                onClick={() => setLanguageFilter("all")}
                className={`shrink-0 rounded-full border px-3 py-1.5 transition ${languageFilter === "all" ? "border-[#7fa653] bg-[#f1f7eb] text-[#53752f]" : "border-[#e0e1dd] text-[#777b74] hover:bg-[#f7f7f5]"}`}
              >
                All voices
              </button>
              {languageOptions.map((language) => (
                <button
                  key={language}
                  onClick={() => setLanguageFilter(language)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 transition ${languageFilter === language ? "border-[#7fa653] bg-[#f1f7eb] text-[#53752f]" : "border-[#e0e1dd] text-[#777b74] hover:bg-[#f7f7f5]"}`}
                >
                  {language.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredVoices.length ? (
              <div className="space-y-1">
                {filteredVoices.map((voice) => {
                  const selected = activeVoice.id === voice.id;
                  const playing = playingId === voice.id;
                  return (
                    <div
                      key={voice.id}
                      className={`group flex items-center gap-1 rounded-xl border transition ${selected ? "border-[#b9cf9f] bg-[#f1f7eb]" : "border-transparent hover:bg-[#f5f6f3]"}`}
                    >
                      <button
                        onClick={() => void selectVoice(voice)}
                        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                          style={{ background: voiceGradient(voice.id) }}
                        >
                          {voice.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{voice.name}</span>
                            {voice.provider === "voicebox" && (
                              <span className="shrink-0 rounded-full bg-[#ece8f6] px-1.5 py-0.5 text-[9px] font-semibold text-[#735a9b]">
                                {voice.presetEngine === "kokoro"
                                  ? "Kokoro"
                                  : voice.presetEngine === "qwen_custom_voice"
                                    ? "Qwen"
                                    : "Custom"}
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block truncate text-xs text-[#7c8079]">
                            {voice.detail}
                          </span>
                        </span>
                        {selected && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1d1f1c] text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => void previewVoice(voice)}
                        aria-label={`${playing ? "Stop" : "Preview"} ${voice.name}`}
                        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4f544d] transition hover:bg-white hover:shadow-sm"
                      >
                        {preparingId === voice.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : playing ? (
                          <Pause className="h-4 w-4 fill-current" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-52 flex-col items-center justify-center px-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1f2ef] text-[#777b74]">
                  <AudioLines className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold">No voices found</p>
                <p className="mt-1 text-xs leading-5 text-[#858981]">
                  Try another search or clear the language filter.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#ecece9] px-4 py-3 text-[11px] text-[#7c8079]">
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${voicebox.connected ? "bg-[#73a447]" : "bg-[#b8bbb5]"}`}
              />
              {libraryTab === "explore" && soul.voice.provider === "browser"
                ? `${deviceVoices.length} device voices ready`
                : voicebox.connected
                  ? "Voicebox connected"
                  : "Device voices ready"}
            </span>
            <button
              onClick={() => setCloneOpen(true)}
              disabled={!voicebox.connected}
              className="font-semibold text-[#4f544d] disabled:opacity-40"
            >
              + Clone voice
            </button>
          </div>
        </section>
      </div>
      {cloneOpen && (
        <CloneVoiceDialog
          onClose={() => setCloneOpen(false)}
          onCreated={(profile) => {
            update({
              provider: "voicebox",
              profileId: profile.id,
              profileName: profile.name,
              cloneConsentRecorded: true,
            });
            setVoicebox((current) => ({ ...current, profiles: [...current.profiles, profile] }));
            setCloneOpen(false);
            onNotice("Voice profile created.");
          }}
        />
      )}
    </Page>
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
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [chatOpen, setChatOpen] = useState(true);
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
  const accents = ["#b6ff60", "#8fbd5b", "#7dd3fc", "#c4b5fd", "#fda4af", "#fbbf24"];
  const frameWidth =
    device === "mobile" ? "max-w-[390px]" : device === "tablet" ? "max-w-[820px]" : "max-w-none";
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
    <div className="relative h-full min-h-[560px] overflow-hidden bg-[#e8eae5]">
      <section className="absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-[#e9ebe6]">
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-black/10 bg-white/92 px-2 py-1.5 shadow-md backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#30332f]">
              <span
                className={`h-2 w-2 rounded-full ${frameLoading ? "animate-pulse bg-[#e5a94b]" : "bg-[#6fa447]"}`}
              />
              {frameLoading ? "Loading website" : "Live website"}
            </span>
            <span className="hidden text-xs text-[#949890] sm:inline">
              · {safeHost(previewUrl)}
            </span>
          </div>
          <div className="flex rounded-full bg-[#f5f6f3] p-1">
            {(
              [
                { id: "desktop", label: "Desktop", icon: <Monitor className="h-3.5 w-3.5" /> },
                { id: "tablet", label: "Tablet", icon: <Tablet className="h-3.5 w-3.5" /> },
                { id: "mobile", label: "Mobile", icon: <Smartphone className="h-3.5 w-3.5" /> },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setDevice(option.id)}
                aria-label={`${option.label} preview`}
                title={`${option.label} preview`}
                className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition ${
                  device === option.id
                    ? "bg-[#1c1f1b] text-white shadow-sm"
                    : "text-[#858a82] hover:text-[#343832]"
                }`}
              >
                {option.icon}
                <span className="hidden xl:inline">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 flex items-stretch justify-center overflow-hidden p-0">
          <div
            className={`flex h-full min-h-[560px] w-full flex-col overflow-hidden bg-white transition-[max-width,border-radius] duration-300 ${frameWidth} ${device === "desktop" ? "" : "my-3 max-h-[calc(100%-24px)] rounded-2xl border border-black/15 shadow-[0_24px_70px_rgba(25,31,23,.2)]"}`}
          >
            <div className="hidden h-11 shrink-0 items-center gap-3 border-b border-[#e7e9e4] bg-[#f8f8f6] px-3">
              <div className="hidden gap-1.5 sm:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b61]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f2bd45]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#65c466]" />
              </div>
              <form onSubmit={openAddress} className="flex min-w-0 flex-1 items-center gap-2">
                <Globe2 className="h-3.5 w-3.5 shrink-0 text-[#90958d]" />
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  aria-label="Preview website URL"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#5f645c] outline-none"
                />
              </form>
              <button
                onClick={() => {
                  setFrameLoading(true);
                  setFrameKey((current) => current + 1);
                }}
                className="rounded-md p-1.5 text-[#747970] hover:bg-[#e9ebe6]"
                aria-label="Reload website preview"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${frameLoading ? "animate-spin" : ""}`} />
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md p-1.5 text-[#747970] hover:bg-[#e9ebe6]"
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
                className={`absolute bottom-[108px] z-20 w-[390px] max-w-[calc(100%-24px)] transition-all duration-300 ${
                  soul.appearance.position === "bottom-right"
                    ? "right-3 sm:right-5"
                    : "left-3 sm:left-5"
                } ${chatOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
                style={{ height: "min(580px, calc(100% - 136px))" }}
              >
                <SoulChat soul={soul} fill onMessagesChange={onMessagesChange} />
              </div>

              <button
                onClick={() => setChatOpen((current) => !current)}
                className={`absolute bottom-12 z-30 flex h-12 items-center justify-center gap-2 border border-black/10 bg-[#171a16] text-white shadow-[0_12px_35px_rgba(0,0,0,.3)] transition hover:-translate-y-0.5 ${
                  soul.appearance.position === "bottom-right"
                    ? "right-4 sm:right-5"
                    : "left-4 sm:left-5"
                } ${soul.appearance.launcher === "pill" ? "rounded-full px-4" : "w-12 rounded-full"}`}
                aria-expanded={chatOpen}
                aria-label={chatOpen ? "Close website guide" : soul.appearance.welcomeLabel}
              >
                {chatOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-[#171a16]"
                    style={{ backgroundColor: soul.appearance.accent }}
                  >
                    {soul.personality.name.charAt(0)}
                  </span>
                )}
                {soul.appearance.launcher === "pill" && (
                  <span className="max-w-36 truncate text-xs font-semibold">
                    {chatOpen ? "Close" : soul.appearance.welcomeLabel}
                  </span>
                )}
              </button>

              <div className="absolute inset-x-0 bottom-0 z-20 flex h-9 items-center justify-between border-t border-black/10 bg-white/95 px-4 text-[11px] text-[#747970] backdrop-blur-xl">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#72a648]" />
                  Live simulation · click the assistant to experience your website
                </span>
                <span className="hidden shrink-0 text-[#9a9e97] sm:inline">
                  {safeHost(previewUrl)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="absolute right-4 top-3 z-30 flex items-center gap-2">
        <button
          onClick={() => {
            setFrameLoading(true);
            setFrameKey((current) => current + 1);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/92 text-[#555a52] shadow-md backdrop-blur-xl hover:bg-white"
          aria-label="Reload website preview"
        >
          <RefreshCw className={`h-4 w-4 ${frameLoading ? "animate-spin" : ""}`} />
        </button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/92 text-[#555a52] shadow-md backdrop-blur-xl hover:bg-white sm:flex"
          aria-label="Open website in a new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={() => setCustomizeOpen(true)}
          className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#1c1f1b] px-4 text-xs font-semibold text-white shadow-md hover:bg-black"
        >
          <WandSparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Customize</span>
        </button>
      </div>

      {customizeOpen && (
        <button
          aria-label="Close customization drawer"
          onClick={() => setCustomizeOpen(false)}
          className="absolute inset-0 z-40 bg-black/12 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={`absolute inset-y-0 right-0 z-50 flex w-[330px] max-w-[calc(100%-28px)] flex-col overflow-hidden border-l border-[#dfe1dc] bg-white shadow-[-20px_0_55px_rgba(20,24,18,.16)] transition-transform duration-300 ${customizeOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="border-b border-[#eceee9] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Visitor experience</p>
              <p className="mt-1 text-xs leading-5 text-[#7d827a]">
                Tune it while using the real assistant.
              </p>
            </div>
            <span className="rounded-full bg-[#edf5e6] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#5d8438]">
              Live
            </span>
            <button
              onClick={() => setCustomizeOpen(false)}
              className="rounded-lg p-2 text-[#777c74] hover:bg-[#f0f2ed]"
              aria-label="Close customization drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {addressError && (
            <p className="mt-3 text-xs font-medium text-[#a34b3e]">{addressError}</p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <form onSubmit={openAddress}>
            <label className="text-xs font-semibold uppercase tracking-[.12em] text-[#8b9088]">
              Preview URL
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dde0da] px-3">
              <Globe2 className="h-4 w-4 shrink-0 text-[#92978f]" />
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button type="submit" className="text-xs font-semibold text-[#5e8738]">
                Go
              </button>
            </div>
          </form>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8b9088]">
              Chat style
            </p>
            <div className="mt-3 grid gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => updateAppearance({ theme: theme.id })}
                  className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                    soul.appearance.theme === theme.id
                      ? "border-[#8fbd5b] bg-[#f3f8ed]"
                      : "border-[#e4e6e1] hover:border-[#cfd3ca] hover:bg-[#fafbf8]"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{theme.label}</span>
                    <span className="mt-0.5 block text-xs text-[#81867e]">{theme.detail}</span>
                  </span>
                  {soul.appearance.theme === theme.id && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1d211b] text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8b9088]">
              Accent
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {accents.map((accent) => (
                <button
                  key={accent}
                  onClick={() => updateAppearance({ accent })}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition hover:scale-105 ${
                    soul.appearance.accent.toLowerCase() === accent.toLowerCase()
                      ? "border-[#22251f]"
                      : "border-transparent"
                  }`}
                  aria-label={`Use accent ${accent}`}
                >
                  <span
                    className="h-6 w-6 rounded-full shadow-inner"
                    style={{ backgroundColor: accent }}
                  />
                </button>
              ))}
              <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#dde0da] bg-[#f6f7f4] text-xs text-[#777c74] hover:bg-[#eef0eb]">
                +
                <input
                  type="color"
                  value={soul.appearance.accent}
                  onChange={(event) => updateAppearance({ accent: event.target.value })}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Launcher">
              <select
                value={soul.appearance.launcher}
                onChange={(event) =>
                  updateAppearance({
                    launcher: event.target.value as Soul["appearance"]["launcher"],
                  })
                }
                className="clean-input"
              >
                <option value="orb">Orb</option>
                <option value="pill">Label</option>
              </select>
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
                <option value="bottom-right">Right</option>
                <option value="bottom-left">Left</option>
              </select>
            </Field>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Launcher message</span>
            <input
              value={soul.appearance.welcomeLabel}
              maxLength={48}
              onChange={(event) => updateAppearance({ welcomeLabel: event.target.value })}
              className="clean-input mt-2"
            />
          </label>

          <div className="rounded-xl border border-[#e2e5de] bg-[#f8f9f6] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4 text-[#719d47]" /> Real conversation
            </div>
            <p className="mt-2 text-xs leading-5 text-[#777c74]">
              Messages here use the same knowledge, citations, personality, and selected voice as
              your installed widget.
            </p>
          </div>

          <button onClick={onIntegrate} className="primary-button w-full justify-center">
            Looks right — integrate it
            <ChevronRight className="h-4 w-4" />
          </button>

          <p className="text-center text-[11px] leading-4 text-[#92968f]">
            If a site blocks embedded previews, open it in a new tab. The installed widget is
            unaffected.
          </p>
        </div>
      </aside>

      <button
        onClick={() => setCustomizeOpen((current) => !current)}
        className={`absolute top-1/2 z-[55] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-black/10 bg-white text-[#5e635b] shadow-lg transition-[right] duration-300 hover:bg-[#f5f6f3] ${
          customizeOpen ? "right-[330px]" : "right-0"
        }`}
        aria-label={customizeOpen ? "Close customization drawer" : "Open customization drawer"}
      >
        {customizeOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </div>
  );
}

function DeployView({
  soul,
  onUpdate,
  onNotice,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"widget" | "webhook">("widget");
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "https://app.obseri.com" : window.location.origin;
  const widgetLabel = soul.appearance.welcomeLabel.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const code = `<script\n  src="${origin}/obseri-widget.js"\n  data-soul-id="${soul.id}"\n  data-position="${soul.appearance.position}"\n  data-accent="${soul.appearance.accent}"\n  data-launcher="${soul.appearance.launcher}"\n  data-label="${widgetLabel}"\n  async\n></script>`;
  const updateAppearance = (patch: Partial<Soul["appearance"]>) =>
    onUpdate((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
  const updateChannels = (patch: Partial<Soul["channels"]>) =>
    onUpdate((current) => ({ ...current, channels: { ...current.channels, ...patch } }));
  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    onNotice(message);
  }
  async function publish() {
    setBusy(true);
    try {
      const response = await fetch("/api/souls/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(soul),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Publishing failed.");
      onUpdate((current) => ({ ...current, status: "live" }));
      onNotice("Published. Your website widget is ready.");
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
      const response = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soulId: soul.id,
          url: soul.channels.webhookUrl,
          secret: soul.channels.webhookSecret,
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
      action={
        <button onClick={() => void publish()} disabled={busy} className="primary-button">
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : soul.status === "live" ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {soul.status === "live" ? "Publish changes" : "Publish soul"}
        </button>
      }
    >
      <div className="inline-flex rounded-xl border border-[#dfe0dc] bg-white p-1">
        <button
          onClick={() => setTab("widget")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "widget" ? "bg-[#efefed] text-[#171916]" : "text-[#70746d]"}`}
        >
          Website widget
        </button>
        <button
          onClick={() => setTab("webhook")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "webhook" ? "bg-[#efefed] text-[#171916]" : "text-[#70746d]"}`}
        >
          Webhooks
        </button>
      </div>
      {tab === "widget" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_410px]">
          <div className="space-y-5">
            <Card>
              <SectionHeading
                title="Install the widget"
                description="Paste this before the closing </body> tag."
              />
              <div className="relative mt-5 overflow-hidden rounded-xl bg-[#1b1d1a] p-5">
                <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[#dce8d4]">
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
                <Field label="Accent color">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={soul.appearance.accent}
                      onChange={(event) => updateAppearance({ accent: event.target.value })}
                      className="h-11 w-12 rounded-lg border border-[#dedfdb] bg-white p-1"
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
                <Field label="Launcher label">
                  <input
                    value={soul.appearance.welcomeLabel}
                    onChange={(event) => updateAppearance({ welcomeLabel: event.target.value })}
                    className="clean-input"
                  />
                </Field>
              </div>
            </Card>
          </div>
          <div className="xl:sticky xl:top-24 xl:h-fit">
            <div className="rounded-2xl border border-[#dedfdb] bg-[#ecece7] p-4">
              <div className="relative min-h-[610px] overflow-hidden rounded-xl bg-white">
                <div className="border-b border-[#ecece9] p-4">
                  <div className="h-3 w-24 rounded-full bg-[#e8e9e5]" />
                </div>
                <div className="p-6">
                  <div className="h-7 w-3/4 rounded-md bg-[#ecece8]" />
                  <div className="mt-3 h-3 w-full rounded bg-[#f1f1ee]" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-[#f1f1ee]" />
                </div>
                <div
                  className={`absolute bottom-4 ${soul.appearance.position === "bottom-right" ? "right-4" : "left-4"} w-[340px] max-w-[calc(100%-32px)]`}
                >
                  <SoulChat soul={soul} compact />
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-[#858981]">Live widget preview</p>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl">
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
                  className="rounded-xl border border-[#dfe0dc] px-3 hover:bg-[#f5f5f3]"
                >
                  <Clipboard className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <button
              onClick={() => void testWebhook()}
              disabled={!soul.channels.webhookUrl || busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#dfe0dc] px-4 py-2.5 text-sm font-semibold hover:bg-[#f5f5f3] disabled:opacity-40"
            >
              <Webhook className="h-4 w-4" />
              Send test event
            </button>
            <div className="mt-6 rounded-xl bg-[#f3f5f0] p-4 text-sm leading-6 text-[#62675f]">
              Events include a timestamp, unique event ID, idempotency key, and HMAC-SHA256
              signature.
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function ConversationsView({ soul, onTest }: { soul: Soul; onTest: () => void }) {
  const [selected, setSelected] = useState(soul.conversations[0]?.id ?? "");
  const conversation =
    soul.conversations.find((item) => item.id === selected) ?? soul.conversations[0];
  return (
    <Page
      title="Visitor conversations"
      description="Review questions, answer quality, and buying intent."
    >
      {soul.conversations.length ? (
        <div className="grid overflow-hidden rounded-2xl border border-[#dedfdb] bg-white lg:grid-cols-[330px_1fr]">
          <div className="border-b border-[#e7e8e4] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#ecece9] p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#92968f]" />
                <input placeholder="Search conversations" className="clean-input pl-9" />
              </div>
            </div>
            {soul.conversations.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item.id)}
                className={`w-full border-b border-[#f0f0ed] p-4 text-left ${conversation?.id === item.id ? "bg-[#f4f5f1]" : "hover:bg-[#fafaf8]"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{item.visitorLabel}</p>
                  <span className="text-xs text-[#858981]">{item.messages.length} msgs</span>
                </div>
                <p className="mt-2 truncate text-sm text-[#777b74]">
                  {item.messages.find((message) => message.role === "visitor")?.content}
                </p>
              </button>
            ))}
          </div>
          <div className="min-h-[560px] p-6">
            <div className="flex items-center justify-between border-b border-[#ecece9] pb-5">
              <div>
                <h3 className="font-semibold">{conversation?.visitorLabel}</h3>
                <p className="mt-1 text-sm text-[#777b74]">
                  {conversation?.channel} · {conversation?.leadIntent} intent
                </p>
              </div>
              <MoreHorizontal className="h-5 w-5 text-[#8c9089]" />
            </div>
            <div className="mx-auto mt-6 max-w-2xl space-y-5">
              {conversation?.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "visitor"
                      ? "ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#eeeeeb] p-4"
                      : "max-w-[86%]"
                  }
                >
                  <p className="text-sm leading-6 text-[#3e423d]">{message.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyPanel
            icon={<MessageCircle />}
            title="No conversations yet"
            detail="Preview your agent or publish the widget. Conversations will appear here."
            action={
              <button onClick={onTest} className="primary-button">
                Open Agent
              </button>
            }
          />
        </Card>
      )}
    </Page>
  );
}

function SettingsView({
  soul,
  workspace,
  onDelete,
}: {
  soul: Soul;
  workspace: SoulWorkspace;
  onDelete: () => void;
}) {
  return (
    <Page title="Profile and workspace" description="Local founder settings for this build.">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <SectionHeading
              title="Profile"
              description="OAuth account details will replace this local profile in production."
            />
            <div className="mt-6 flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#20221f] font-semibold text-white">
                BB
              </span>
              <div>
                <p className="font-semibold">Obseri Founder</p>
                <p className="mt-1 text-sm text-[#777b74]">Local founder mode</p>
              </div>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Display name">
                <input defaultValue="Obseri Founder" className="clean-input" />
              </Field>
              <Field label="Email">
                <input placeholder="you@company.com" className="clean-input" />
              </Field>
            </div>
          </Card>
          <Card>
            <SectionHeading
              title="Workspace"
              description="The shared home for your website souls."
            />
            <Field label="Workspace name" className="mt-5">
              <input defaultValue={workspace.name} className="clean-input" />
            </Field>
            <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f5f6f3] p-4">
              <div>
                <p className="text-sm font-semibold">Founder plan</p>
                <p className="mt-1 text-xs text-[#7b7f78]">Local build · billing not connected</p>
              </div>
              <span className="rounded-lg border border-[#dfe0dc] bg-white px-3 py-1.5 text-xs font-semibold">
                Active
              </span>
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <h3 className="font-semibold">Your data</h3>
            <p className="mt-2 text-sm leading-6 text-[#747870]">
              Export this Soul before clearing local browser storage.
            </p>
            <button
              onClick={() => exportSoul(soul)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#dfe0dc] px-4 py-2.5 text-sm font-semibold hover:bg-[#f5f5f3]"
            >
              <Download className="h-4 w-4" />
              Export Soul
            </button>
          </Card>
          <Card className="border-[#edd8d2]">
            <h3 className="font-semibold text-[#8b493a]">Delete website soul</h3>
            <p className="mt-2 text-sm leading-6 text-[#8a6a62]">
              This removes the local knowledge, settings, and conversations.
            </p>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${soul.name}?`)) onDelete();
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e8c8bf] px-4 py-2.5 text-sm font-semibold text-[#984c3b] hover:bg-[#fff7f4]"
            >
              <Trash2 className="h-4 w-4" />
              Delete Soul
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    await onCreate({ name, url });
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-lg rounded-2xl border border-[#dedfdb] bg-white p-6 shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-[#7d817a] hover:bg-[#f2f3f0]"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf4df] text-[#557d30]">
          <Globe2 className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Create a website soul</h2>
        <p className="mt-2 text-sm leading-6 text-[#747870]">
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
        <button
          disabled={!url.trim() || busy}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d1f1c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
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

function CloneVoiceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (profile: VoiceboxProfile) => void;
}) {
  const [name, setName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [rightsBasis, setRightsBasis] = useState("self");
  const [consent, setConsent] = useState(false);
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!audio || !consent) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("transcript", transcript);
      form.append("rightsBasis", rightsBasis);
      form.append("consent", String(consent));
      form.append("audio", audio);
      const response = await fetch("/api/voice/clone", { method: "POST", body: form });
      const payload = (await response.json()) as {
        profile?: VoiceboxProfile;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile)
        throw new Error(payload.error?.message || "Voice cloning failed.");
      onCreated(payload.profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice cloning failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <form
        onSubmit={submit}
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#dedfdb] bg-white p-6 shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 hover:bg-[#f2f3f0]"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-2xl font-semibold">Clone an authorized voice</h2>
        <p className="mt-2 text-sm leading-6 text-[#747870]">
          Use a clean sample with an exact transcript.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Voice name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="clean-input"
            />
          </Field>
          <Field label="Rights basis">
            <select
              value={rightsBasis}
              onChange={(event) => setRightsBasis(event.target.value)}
              className="clean-input"
            >
              <option value="self">My own voice</option>
              <option value="permission">Explicit permission</option>
              <option value="licensed">Commercially licensed</option>
            </select>
          </Field>
        </div>
        <Field label="Audio sample" className="mt-5">
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => setAudio(event.target.files?.[0] ?? null)}
            className="clean-input"
          />
        </Field>
        <Field label="Exact transcript" className="mt-5">
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={4}
            className="clean-input resize-none"
          />
        </Field>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-[#f5f6f3] p-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm leading-6 text-[#565a54]">
            I confirm that I own this voice or have explicit permission or a valid license to clone
            and use it.
          </span>
        </label>
        {error && (
          <p className="mt-4 rounded-xl bg-[#fff3ef] p-3 text-sm text-[#984c3b]">{error}</p>
        )}
        <button
          disabled={!audio || !name || !transcript || !consent || busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d1f1c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
          Create voice profile
        </button>
      </form>
    </div>
  );
}

function Page({
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {action && <div className="flex justify-end">{action}</div>}
      {children}
    </div>
  );
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-[#dedfdb] bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
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
        {hint && <span className="text-xs font-normal text-[#8a8e87]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[#777b74]">{description}</p>
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
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "live" ? "bg-[#eaf4df] text-[#4b7226]" : status === "learning" ? "bg-[#fff4d8] text-[#8b6721]" : "bg-[#f0f1ee] text-[#6f736d]"}`}
    >
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
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0f1ee] text-[#747870] [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#7a7e77]">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eaf4df] text-[#557d30]">
          <Globe2 className="h-6 w-6" />
        </span>
        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Start with your website</h2>
        <p className="mt-3 text-sm leading-6 text-[#747870]">
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
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-6 block">
      <span className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-[#777b74]">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-[#6f9845]"
      />
    </label>
  );
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[#6f9845]" : "bg-[#d7d9d4]"}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

const TONES: Array<{ id: Soul["personality"]["tone"]; detail: string }> = [
  { id: "warm", detail: "Friendly and welcoming" },
  { id: "precise", detail: "Direct and expert" },
  { id: "playful", detail: "Bright and expressive" },
  { id: "luxury", detail: "Refined and assured" },
  { id: "bold", detail: "Energetic and decisive" },
  { id: "calm", detail: "Patient and reassuring" },
];

function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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
          "Browser voices work immediately, while Voicebox adds profiles and consent-gated voice cloning.",
        hash: "3333333333333333333333333333333333333333333333333333333333333333",
        wordCount: 320,
        capturedAt: "2026-07-14T05:00:00.000Z",
        status: "ready",
        chunks: [
          {
            id: "demo-voice-0",
            pageUrl: "https://obseri.com/voice",
            pageTitle: "Voice and consent",
            text: "Obseri supports browser speech as a zero-setup fallback and Voicebox for managed profiles, speech generation, and consent-gated voice cloning.",
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
    escalationEmail: "hello@obseri.com",
  },
  voice: {
    enabled: true,
    provider: "browser",
    profileId: "",
    profileName: "Browser voice",
    browserVoiceName: "",
    language: "en",
    speed: 1,
    pitch: 1,
    cloneConsentRecorded: false,
  },
  appearance: {
    accent: "#8fbd5b",
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
    webhookSecret: "whsec_demo_only_replace_in_production",
  },
  conversations: [],
};

const DEMO_WORKSPACE: SoulWorkspace = {
  id: "local-workspace",
  name: "Obseri Workspace",
  souls: [DEMO_SOUL],
  activeSoulId: DEMO_SOUL.id,
};
