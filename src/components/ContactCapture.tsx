import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle, X } from "lucide-react";
import type { ContactRequest } from "@/lib/analytics";

export default function ContactCapture({
  soulId,
  conversationId,
  sessionToken,
  sessionId,
  path,
  businessName,
}: {
  soulId: string;
  conversationId: string;
  sessionToken: string;
  sessionId?: string;
  path: string;
  businessName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    if (data.get("consent") !== "on") {
      setError("Please agree to be contacted about your request.");
      return;
    }
    const contact: ContactRequest = {
      id: requestId.current,
      conversationId,
      sessionId,
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
      consent: true,
      path,
    };
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/souls/${encodeURIComponent(soulId)}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify(contact),
      });
      const result = await response.json();
      if (!response.ok || !result.accepted)
        throw new Error(
          result.error?.message || "Your request could not be saved. Please try again.",
        );
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3f0fb] px-3 py-2 text-xs font-medium text-[#6751a8] hover:bg-[#ebe4fb]"
      >
        {saved ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" /> Request received
          </>
        ) : (
          <>
            Want a personal follow-up? <ArrowUpRight className="h-3.5 w-3.5" />
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="m-auto max-h-[90vh] w-[calc(100%-24px)] max-w-sm overflow-y-auto rounded-2xl border border-[#e5e0ed] bg-white p-5 text-[#25212d] shadow-xl backdrop:bg-black/30"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {saved ? "You’re on their radar." : "Let’s keep the conversation going."}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close contact form"
            className="rounded-full p-2 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {saved ? (
          <div role="status">
            <CheckCircle2 className="mb-3 h-8 w-8 text-[#6751a8]" />
            <p className="text-sm leading-6">
              Your request is saved for {businessName}. They can follow up using the email you
              provided.
            </p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="mt-5 w-full rounded-xl bg-[#25212d] px-4 py-3 text-sm text-white"
            >
              Back to conversation
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm leading-6 text-[#77717e]">
              Send your question to {businessName} with a way to reach you.
            </p>
            <label className="block text-sm font-medium">
              Name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                className="mt-1 block w-full rounded-xl border border-[#ded9e4] p-3 font-normal outline-none focus:border-[#8b71c2]"
              />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                className="mt-1 block w-full rounded-xl border border-[#ded9e4] p-3 font-normal outline-none focus:border-[#8b71c2]"
              />
            </label>
            <label className="block text-sm font-medium">
              What would you like help with?
              <textarea
                name="message"
                required
                maxLength={2000}
                rows={3}
                className="mt-1 block w-full rounded-xl border border-[#ded9e4] p-3 font-normal outline-none focus:border-[#8b71c2]"
              />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5 text-[#77717e]">
              <input name="consent" type="checkbox" required className="mt-1" />I agree to share
              these details with {businessName} so they can contact me about my request.
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25212d] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {saving ? "Sending…" : "Send my request"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
