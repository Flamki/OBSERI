import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ExternalLink,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ChatResponse } from "@/lib/conversation";
import type { Soul, SoulMessage } from "@/lib/soul";

export default function SoulChat({
  soul,
  compact = false,
  fill = false,
  onMessagesChange,
}: {
  soul: Soul;
  compact?: boolean;
  fill?: boolean;
  onMessagesChange?: (messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) => void;
}) {
  const [messages, setMessages] = useState<SoulMessage[]>(() => [
    greetingMessage(soul.id, soul.personality.greeting),
  ]);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soul.voice.enabled);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = soul.appearance.theme ?? "light";
  const isDark = theme === "dark";
  const isGlass = theme === "glass";
  const shellTone = isDark
    ? "border-white/10 bg-[#111410] text-[#f7f8f5] shadow-[0_18px_60px_rgba(0,0,0,.38)]"
    : isGlass
      ? "border-white/60 bg-white/80 text-[#20221f] shadow-[0_18px_60px_rgba(31,40,26,.18)] backdrop-blur-2xl"
      : "border-[#dfe0dc] bg-white text-[#20221f] shadow-[0_12px_36px_rgba(0,0,0,.08)]";
  const dividerTone = isDark ? "border-white/10" : "border-[#ecece9]";
  const mutedTone = isDark ? "text-white/48" : "text-[#7b7f78]";
  const quietButtonTone = isDark
    ? "text-white/55 hover:bg-white/10 hover:text-white"
    : "text-[#777b74] hover:bg-[#f2f3f0] hover:text-[#252824]";

  useEffect(() => {
    setMessages([greetingMessage(soul.id, soul.personality.greeting)]);
    setSoundEnabled(soul.voice.enabled);
  }, [soul.id, soul.personality.greeting, soul.voice.enabled]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text = value) {
    const question = text.trim();
    if (!question || sending) return;
    const visitor: SoulMessage = {
      id: crypto.randomUUID(),
      role: "visitor",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, visitor];
    setMessages(nextMessages);
    setValue("");
    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          soulId: soul.id,
          personality: soul.personality,
          chunks: soul.knowledge.pages.flatMap((page) => page.chunks).slice(0, 250),
          messages: nextMessages.slice(-12).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const data = (await response.json()) as ChatResponse | { error?: { message?: string } };
      if (!response.ok || !("answer" in data)) {
        throw new Error(
          "error" in data ? data.error?.message : "The conversation was interrupted.",
        );
      }
      const assistant: SoulMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        createdAt: new Date().toISOString(),
        citations: data.citations,
      };
      const completed = [...nextMessages, assistant];
      setMessages(completed);
      onMessagesChange?.(completed, data.leadIntent);
      if (soundEnabled) await speak(data.answer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The conversation was interrupted.");
    } finally {
      setSending(false);
    }
  }

  async function speak(text: string) {
    if (soul.voice.provider === "voicebox" && soul.voice.profileId) {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          profileId: soul.voice.profileId,
          language: soul.voice.language,
        }),
      });
      if (response.ok) {
        const href = URL.createObjectURL(await response.blob());
        const audio = new Audio(href);
        audio.onended = () => URL.revokeObjectURL(href);
        await audio.play();
        return;
      }
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = soul.voice.language;
      utterance.rate = soul.voice.speed;
      utterance.pitch = soul.voice.pitch;
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.name === soul.voice.browserVoiceName);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    }
  }

  function toggleListening() {
    if (listening) {
      setListening(false);
      return;
    }
    const constructor =
      (
        window as typeof window & {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).SpeechRecognition ??
      (
        window as typeof window & {
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).webkitSpeechRecognition;
    if (!constructor) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new constructor();
    recognition.lang = soul.voice.language;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setValue(event.results[0]?.[0]?.transcript ?? "");
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("I couldn’t hear that clearly. Please try again.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  }

  function restart() {
    setMessages([greetingMessage(soul.id, soul.personality.greeting)]);
    setError("");
    window.speechSynthesis?.cancel();
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border ${shellTone} ${
        fill ? "h-full min-h-[420px]" : compact ? "h-[560px]" : "h-[650px]"
      }`}
    >
      <div className={`flex items-center justify-between border-b px-5 py-4 ${dividerTone}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#20221f]"
            style={{ backgroundColor: soul.appearance.accent }}
          >
            {soul.personality.name.charAt(0)}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#55a65a]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{soul.personality.name}</p>
            <p className={`mt-0.5 truncate text-xs ${mutedTone}`}>{soul.personality.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={restart}
            className={`rounded-lg p-2 ${quietButtonTone}`}
            aria-label="Restart conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setSoundEnabled((current) => !current);
              window.speechSynthesis?.cancel();
            }}
            className={`rounded-lg p-2 ${quietButtonTone}`}
            aria-label="Toggle spoken answers"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "visitor" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] ${
                message.role === "visitor"
                  ? "rounded-2xl rounded-br-md bg-[#20221f] px-4 py-3 text-white"
                  : isDark
                    ? "text-white/82"
                    : "text-[#333732]"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              {!!message.citations?.length && (
                <div className="mt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[#73776f]">
                    <BookOpen className="h-3.5 w-3.5" /> Sources
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {message.citations.map((citation, index) => (
                      <a
                        key={`${citation.chunkId}-${index}`}
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                          isDark
                            ? "border-white/12 bg-white/6 text-white/60 hover:bg-white/10 hover:text-white"
                            : "border-[#dfe0dc] bg-[#fafaf8] text-[#646861] hover:border-[#bdc0b9] hover:text-[#20221f]"
                        }`}
                      >
                        {index + 1}. {citation.title.slice(0, 30)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className={`flex items-center gap-2 text-sm ${mutedTone}`}>
            <LoaderCircle className="h-4 w-4 animate-spin" /> {soul.personality.name} is thinking…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-[#eed5ce] bg-[#fff6f2] px-4 py-3 text-sm text-[#934b3a]">
            {error}
          </div>
        )}
      </div>

      <div className={`border-t p-4 ${dividerTone}`}>
        {messages.length === 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {["What do you offer?", "How does it work?", "Which option fits me?"].map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendMessage(prompt)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  isDark
                    ? "border-white/12 bg-white/6 text-white/58 hover:bg-white/10 hover:text-white"
                    : "border-[#dfe0dc] bg-white text-[#676b64] hover:bg-[#f4f5f2]"
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div
          className={`flex items-end gap-2 rounded-xl border p-2 ${
            isDark
              ? "border-white/12 bg-black/20 focus-within:border-white/25 focus-within:bg-black/30"
              : "border-[#d9dbd6] bg-[#fafaf8] focus-within:border-[#aeb4a8] focus-within:bg-white"
          }`}
        >
          <button
            onClick={toggleListening}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              listening
                ? "bg-[#a84c3e] text-white"
                : isDark
                  ? "text-white/52 hover:bg-white/10 hover:text-white"
                  : "text-[#747870] hover:bg-[#eceee9]"
            }`}
            aria-label="Voice input"
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder={`Ask ${soul.personality.name} anything`}
            className={`max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none ${
              isDark ? "placeholder:text-white/30" : "placeholder:text-[#9a9d97]"
            }`}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!value.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#20221f] text-white hover:bg-black disabled:opacity-30"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className={`mt-2 text-center text-xs ${isDark ? "text-white/34" : "text-[#969993]"}`}>
          Answers use your website knowledge
        </p>
      </div>
    </div>
  );
}

type SpeechRecognitionResultEvent = {
  results: ArrayLike<{ [index: number]: { transcript: string } }>;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function greetingMessage(soulId: string, greeting: string): SoulMessage {
  return {
    id: `greeting-${soulId}`,
    role: "assistant",
    content: greeting,
    createdAt: new Date().toISOString(),
  };
}
