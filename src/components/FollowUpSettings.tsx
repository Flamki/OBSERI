import { ArrowUpRight, CalendarDays, MessageSquareText } from "lucide-react";
import type { Soul } from "@/lib/soul";
import {
  BOOKING_PROVIDERS,
  DEFAULT_FOLLOW_UP,
  bookingUrl,
  followUpError,
  followUpLabel,
  type FollowUpConfig,
} from "@/lib/follow-up";
import FollowUpAction from "./FollowUpAction";

export default function FollowUpSettings({
  soul,
  onUpdate,
}: {
  soul: Soul;
  onUpdate: (updater: (soul: Soul) => Soul) => void;
}) {
  const config = { ...DEFAULT_FOLLOW_UP, ...soul.personality.followUp };
  const enabled = soul.personality.leadCapture;
  const update = (patch: Partial<FollowUpConfig>) =>
    onUpdate((current) => ({
      ...current,
      personality: {
        ...current.personality,
        followUp: { ...DEFAULT_FOLLOW_UP, ...current.personality.followUp, ...patch },
      },
    }));
  const provider = BOOKING_PROVIDERS[config.provider];
  const url = bookingUrl(config.url, config.provider);
  const issue = followUpError(soul.personality);
  const input =
    "mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-50";
  return (
    <div className="grid gap-8 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Follow-up button</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-neutral-500">
              Give visitors a way to contact you or book a meeting, directly from your assistant.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Show follow-up button"
            aria-checked={enabled}
            onClick={() =>
              onUpdate((current) => ({
                ...current,
                personality: {
                  ...current.personality,
                  leadCapture: !current.personality.leadCapture,
                },
              }))
            }
            className={`mt-1 flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${enabled ? "bg-neutral-900" : "bg-neutral-200"}`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
        {!enabled && (
          <p
            role="status"
            className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600"
          >
            The follow-up button is off. Publish changes to hide it on your website. Your settings
            are kept for when you turn it back on.
          </p>
        )}
        <fieldset disabled={!enabled} className="space-y-6 disabled:opacity-50">
          <legend className="mb-3 text-sm font-medium">When visitors click</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  mode: "contact",
                  title: "Contact form",
                  detail: "Collect a name, email and request.",
                  Icon: MessageSquareText,
                },
                {
                  mode: "booking",
                  title: "Book a meeting",
                  detail: "Open your public scheduling page.",
                  Icon: CalendarDays,
                },
              ] as const
            ).map(({ mode, title, detail, Icon }) => (
              <label
                key={mode}
                className={`cursor-pointer rounded-xl border p-4 ${config.mode === mode ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{title}</span>
                  <input
                    className="ml-auto accent-black"
                    type="radio"
                    name="follow-up-mode"
                    value={mode}
                    checked={config.mode === mode}
                    onChange={() => update({ mode })}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">{detail}</p>
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium">
            Button text
            <input
              aria-label="Follow-up button text"
              maxLength={60}
              value={config.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder={followUpLabel({ ...config, label: "" })}
              className={input}
            />
            <span className="mt-1 block text-xs font-normal text-neutral-400">
              {config.label.length}/60 · Leave empty to use the default.
            </span>
          </label>
          {config.mode === "booking" ? (
            <div className="space-y-5 rounded-2xl border border-neutral-200 p-5">
              <label className="block text-sm font-medium">
                Scheduling provider
                <select
                  aria-label="Scheduling provider"
                  value={config.provider}
                  onChange={(e) =>
                    update({ provider: e.target.value as FollowUpConfig["provider"] })
                  }
                  className={input}
                >
                  {Object.entries(BOOKING_PROVIDERS).map(([id, item]) => (
                    <option key={id} value={id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Public booking link
                <input
                  aria-label="Public booking link"
                  type="url"
                  maxLength={2048}
                  value={config.url}
                  onChange={(e) => update({ url: e.target.value })}
                  placeholder={provider.placeholder}
                  aria-invalid={Boolean(config.url && !url)}
                  aria-describedby="booking-help"
                  className={input}
                />
              </label>
              <p id="booking-help" className="text-xs leading-5 text-neutral-500">
                {provider.help}{" "}
                {provider.docs && (
                  <a
                    href={provider.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Setup guide ↗
                  </a>
                )}
              </p>
              {config.url && issue && (
                <p role="alert" className="text-sm text-red-700">
                  {issue}
                </p>
              )}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  Test booking link <ArrowUpRight className="h-4 w-4" />
                </a>
              )}
              <p className="border-t pt-4 text-xs leading-5 text-neutral-500">
                Visitors choose a time on your provider’s booking page. Availability, confirmations
                and calendar events are managed there. Obseri does not access your calendar or count
                a click as a completed booking.
              </p>
            </div>
          ) : (
            <div className="space-y-5 rounded-2xl border border-neutral-200 p-5">
              <label className="block text-sm font-medium">
                Form title
                <input
                  aria-label="Follow-up form title"
                  value={config.title}
                  onChange={(e) => update({ title: e.target.value })}
                  maxLength={100}
                  placeholder="Let’s keep the conversation going."
                  className={input}
                />
              </label>
              <label className="block text-sm font-medium">
                Form description
                <textarea
                  aria-label="Follow-up form description"
                  value={config.description}
                  onChange={(e) => update({ description: e.target.value })}
                  maxLength={240}
                  rows={3}
                  placeholder={`Send your question to ${soul.name} with a way to reach you.`}
                  className={input}
                />
              </label>
              <p className="text-xs leading-5 text-neutral-500">
                Requests are saved in Analytics → Conversions with permission to follow up. Name,
                email and request are required.
              </p>
            </div>
          )}
        </fieldset>
        <p className="text-xs leading-5 text-neutral-500">
          Publish changes to update your live widget. These settings do not require replacing your
          embed code.
        </p>
      </div>
      <aside className="min-w-0 self-start rounded-2xl border border-neutral-200 bg-neutral-50 p-5 xl:sticky xl:top-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Button preview</h3>
          <span className="text-xs text-neutral-400">{enabled ? "On" : "Off"}</span>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-12 rounded-xl bg-neutral-100 p-4 text-sm leading-6">
            {soul.personality.greeting}
          </div>
          {enabled && !issue ? (
            <FollowUpAction soul={soul} preview />
          ) : (
            <div className="mb-3 rounded-xl border border-dashed p-4 text-center text-xs text-neutral-400">
              {enabled ? "Add a valid booking link to preview the button." : "No follow-up button"}
            </div>
          )}
          <div className="rounded-full border px-4 py-3 text-xs text-neutral-400">
            Ask this website…
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-neutral-500">
          {!enabled
            ? "Turn on follow-up to preview your button."
            : config.mode === "booking"
              ? "The button opens your booking page in a new tab."
              : "Try the button to preview your form. Preview requests are never submitted."}
        </p>
      </aside>
    </div>
  );
}
