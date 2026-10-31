import { ArrowUpRight } from "lucide-react";
import ContactCapture from "./ContactCapture";
import { bookingUrl, followUpLabel, resolveFollowUp } from "@/lib/follow-up";
import type { Soul } from "@/lib/soul";

export default function FollowUpAction({
  soul,
  conversationId = "preview",
  sessionToken = "",
  sessionId,
  path = "/",
  preview = false,
}: {
  soul: Soul;
  conversationId?: string;
  sessionToken?: string;
  sessionId?: string;
  path?: string;
  preview?: boolean;
}) {
  const config = resolveFollowUp(soul.personality);
  if (!config) return null;
  if (config.mode === "booking")
    return (
      <a
        href={bookingUrl(config.url, config.provider)!}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3f0fb] px-3 py-2 text-xs font-medium text-[#6751a8] hover:bg-[#ebe4fb]"
      >
        {followUpLabel(config)}
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only"> (opens booking page in a new tab)</span>
      </a>
    );
  return (
    <ContactCapture
      soulId={soul.id}
      conversationId={conversationId}
      sessionToken={sessionToken}
      sessionId={sessionId}
      path={path}
      businessName={soul.name}
      config={config}
      preview={preview}
    />
  );
}
