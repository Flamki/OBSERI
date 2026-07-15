import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ExternalLink,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { rankKnowledgeChunks, type ChatResponse } from "@/lib/conversation";
import type { KnowledgeChunk, Soul, SoulMessage } from "@/lib/soul";

export default function SoulChat({
  soul,
  compact = false,
  fill = false,
  voiceMode = false,
  onMessagesChange,
}: {
  soul: Soul;
  compact?: boolean;
  fill?: boolean;
  voiceMode?: boolean;
  onMessagesChange?: (messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) => void;
}) {
  const [messages, setMessages] = useState<SoulMessage[]>(() => [
    greetingMessage(soul.id, soul.personality.greeting),
  ]);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soul.voice.enabled);
  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "thinking" | "speaking">(
    "idle",
  );
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceCallActiveRef = useRef(false);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(false);
  const voiceRequestRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
    const greeting = [greetingMessage(soul.id, soul.personality.greeting)];
    messagesRef.current = greeting;
    setMessages(greeting);
    setSoundEnabled(soul.voice.enabled);
    stopVoiceCall();
  }, [soul.id, soul.personality.greeting, soul.voice.enabled]);

  useEffect(() => {
    if (!voiceMode) stopVoiceCall();
  }, [voiceMode]);

  useEffect(
    () => () => {
      voiceCallActiveRef.current = false;
      voiceRequestRef.current?.abort();
      recognitionRef.current?.abort();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text = value, continueVoiceCall = false) {
    const question = text.trim();
    if (!question || sendingRef.current) return;
    const visitor: SoulMessage = {
      id: crypto.randomUUID(),
      role: "visitor",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messagesRef.current, visitor];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setValue("");
    setError("");
    sendingRef.current = true;
    setSending(true);
    if (continueVoiceCall) setVoiceStatus("thinking");

    try {
      if (continueVoiceCall) {
        await streamVoiceMessage(nextMessages);
        return;
      }
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
      messagesRef.current = completed;
      setMessages(completed);
      onMessagesChange?.(completed, data.leadIntent);
      const shouldSpeak = soundEnabled;
      if (shouldSpeak) {
        setVoiceStatus("speaking");
        try {
          await speak(data.answer);
        } catch {
          setError("I couldn’t play the spoken answer. You can continue by voice.");
        }
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "The conversation was interrupted.");
      }
      if (continueVoiceCall) stopVoiceCall();
    } finally {
      voiceRequestRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function streamVoiceMessage(nextMessages: SoulMessage[]) {
    const requestController = new AbortController();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = requestController;
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        soulId: soul.id,
        personality: soul.personality,
        chunks: prepareVoiceChunks(nextMessages.at(-1)?.content ?? "", soul),
        messages: nextMessages.slice(-8).map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
      signal: requestController.signal,
    });
    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(payload?.error?.message || "The voice response was interrupted.");
    }

    const assistantId = crypto.randomUUID();
    const speaker = createStreamingSpeaker();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let citations: SoulMessage["citations"] = [];
    let leadIntent: ChatResponse["leadIntent"] = "none";

    const updateDraft = () => {
      const assistant: SoulMessage = {
        id: assistantId,
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
        citations,
      };
      const completed = [...nextMessages, assistant];
      messagesRef.current = completed;
      setMessages(completed);
      return completed;
    };

    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as VoiceStreamEvent;
          if (event.type === "meta") {
            citations = event.citations;
            leadIntent = event.leadIntent;
          } else if (event.type === "delta" && event.text) {
            if (!answer) setVoiceStatus("speaking");
            answer += event.text;
            speaker.push(event.text);
            updateDraft();
          } else if (event.type === "error") {
            throw new Error(event.message || "The voice stream was interrupted.");
          }
        }
        if (done) break;
      }
      answer = answer.trim();
      if (!answer) throw new Error("The voice response was empty.");
      const completed = updateDraft();
      onMessagesChange?.(completed, leadIntent);
      await speaker.finish();
      if (voiceCallActiveRef.current) window.setTimeout(() => startListening(true), 60);
    } finally {
      reader.releaseLock();
    }
  }

  async function speak(text: string) {
    if (soul.voice.provider === "voicebox" && soul.voice.profileId) {
      await playAudioBlob(await fetchVoiceboxAudio(text));
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      await speakBrowserSegment(text);
    }
  }

  function createStreamingSpeaker() {
    let pendingText = "";
    let playback = Promise.resolve();
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();

    const queue = (text: string) => {
      const segment = text.trim();
      if (!segment) return;
      if (soul.voice.provider === "voicebox" && soul.voice.profileId) {
        const audio = fetchVoiceboxAudio(segment, voiceRequestRef.current?.signal).catch(
          () => null,
        );
        playback = playback.then(async () => {
          if (!voiceCallActiveRef.current) return;
          const blob = await audio;
          if (blob) await playAudioBlob(blob);
          else await speakBrowserSegment(segment);
        });
      } else {
        playback = playback.then(() =>
          voiceCallActiveRef.current ? speakBrowserSegment(segment) : Promise.resolve(),
        );
      }
    };

    return {
      push(delta: string) {
        pendingText += delta;
        while (true) {
          const splitAt = findSpeechBoundary(pendingText);
          if (splitAt < 0) break;
          queue(pendingText.slice(0, splitAt));
          pendingText = pendingText.slice(splitAt);
        }
      },
      async finish() {
        queue(pendingText);
        pendingText = "";
        await playback;
      },
    };
  }

  async function fetchVoiceboxAudio(text: string, signal?: AbortSignal) {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        profileId: soul.voice.profileId,
        language: soul.voice.language,
      }),
      signal,
    });
    if (!response.ok) throw new Error("Voice generation failed.");
    return response.blob();
  }

  async function playAudioBlob(blob: Blob) {
    const href = URL.createObjectURL(blob);
    const audio = new Audio(href);
    audioRef.current = audio;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (playbackError?: Error) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(href);
        if (audioRef.current === audio) audioRef.current = null;
        if (playbackError) reject(playbackError);
        else resolve();
      };
      audio.onended = () => finish();
      audio.onpause = () => finish();
      audio.onerror = () => finish(new Error("Voice playback failed."));
      void audio
        .play()
        .catch((cause) =>
          finish(cause instanceof Error ? cause : new Error("Voice playback failed.")),
        );
    });
  }

  async function speakBrowserSegment(text: string) {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = soul.voice.language;
    utterance.rate = soul.voice.speed;
    utterance.pitch = soul.voice.pitch;
    const voice = window.speechSynthesis
      .getVoices()
      .find((candidate) => candidate.name === soul.voice.browserVoiceName);
    if (voice) utterance.voice = voice;
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  function startListening(autoSend: boolean) {
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
      if (autoSend) stopVoiceCall();
      return;
    }
    const recognition = new constructor();
    recognitionRef.current = recognition;
    recognition.lang = soul.voice.language;
    recognition.interimResults = autoSend;
    recognition.continuous = false;
    let transcript = "";
    let submitted = false;
    let endpointTimer: number | undefined;
    const submitTranscript = () => {
      if (submitted) return;
      const clean = transcript.trim();
      if (!clean) return;
      submitted = true;
      if (endpointTimer) window.clearTimeout(endpointTimer);
      setListening(false);
      recognitionRef.current = null;
      if (autoSend) void sendMessage(clean, true);
      else setValue(clean);
    };
    recognition.onresult = (event) => {
      let nextTranscript = "";
      let hasFinalResult = false;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        nextTranscript += `${result?.[0]?.transcript ?? ""} `;
        if (result?.isFinal) hasFinalResult = true;
      }
      transcript = nextTranscript.trim();
      if (!transcript) return;
      if (!autoSend || hasFinalResult) {
        submitTranscript();
        return;
      }
      if (endpointTimer) window.clearTimeout(endpointTimer);
      endpointTimer = window.setTimeout(() => recognition.stop(), 520);
    };
    recognition.onerror = (event) => {
      if (endpointTimer) window.clearTimeout(endpointTimer);
      setListening(false);
      recognitionRef.current = null;
      if (autoSend && event.error === "no-speech" && voiceCallActiveRef.current) {
        window.setTimeout(() => startListening(true), 160);
        return;
      }
      setError(
        event.error === "not-allowed"
          ? "Microphone access is required for a voice call."
          : "I couldn’t hear that clearly. Please try again.",
      );
      if (autoSend) stopVoiceCall();
    };
    recognition.onend = () => {
      if (endpointTimer) window.clearTimeout(endpointTimer);
      setListening(false);
      recognitionRef.current = null;
      if (!submitted && transcript) {
        submitTranscript();
        return;
      }
      if (autoSend && !submitted && voiceCallActiveRef.current) {
        window.setTimeout(() => startListening(true), 160);
      }
    };
    try {
      recognition.start();
      setListening(true);
      if (autoSend) setVoiceStatus("listening");
    } catch {
      setError("The microphone is already in use. Please try again.");
      if (autoSend) stopVoiceCall();
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    startListening(false);
  }

  function startVoiceCall() {
    setError("");
    setSoundEnabled(true);
    voiceCallActiveRef.current = true;
    setVoiceCallActive(true);
    startListening(true);
  }

  function stopVoiceCall() {
    voiceCallActiveRef.current = false;
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setListening(false);
    setVoiceCallActive(false);
    setVoiceStatus("idle");
  }

  function restart() {
    const greeting = [greetingMessage(soul.id, soul.personality.greeting)];
    messagesRef.current = greeting;
    setMessages(greeting);
    setError("");
    window.speechSynthesis?.cancel();
  }

  if (voiceMode) {
    const lastVisitor = [...messages].reverse().find((message) => message.role === "visitor");
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    const statusLabel =
      voiceStatus === "listening"
        ? "Listening…"
        : voiceStatus === "thinking"
          ? "Thinking…"
          : voiceStatus === "speaking"
            ? "Speaking…"
            : "Ready to talk";

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
              <p className={`mt-0.5 truncate text-xs ${mutedTone}`}>Voice conversation</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              voiceCallActive
                ? isDark
                  ? "bg-[#b6ff60]/15 text-[#c9ff8a]"
                  : "bg-[#edf6e5] text-[#557d31]"
                : isDark
                  ? "bg-white/8 text-white/48"
                  : "bg-[#f1f2ef] text-[#747971]"
            }`}
          >
            {voiceCallActive ? "Call active" : "Voice ready"}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="relative">
            {voiceCallActive && (
              <>
                <span
                  className="absolute inset-[-16px] animate-pulse rounded-full opacity-20"
                  style={{ backgroundColor: soul.appearance.accent }}
                />
                <span
                  className="absolute inset-[-8px] animate-pulse rounded-full opacity-25 [animation-delay:180ms]"
                  style={{ backgroundColor: soul.appearance.accent }}
                />
              </>
            )}
            <span
              className="relative flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold text-[#171a16] shadow-[0_18px_45px_rgba(0,0,0,.18)]"
              style={{ backgroundColor: soul.appearance.accent }}
            >
              {soul.personality.name.charAt(0)}
            </span>
          </div>

          <h3 className="mt-7 text-xl font-semibold">{statusLabel}</h3>
          <p className={`mt-2 max-w-xs text-sm leading-6 ${mutedTone}`}>
            {voiceCallActive
              ? "Speak naturally. I’ll answer, then listen again automatically."
              : `Start a hands-free conversation with ${soul.personality.name}.`}
          </p>

          <div className="mt-6 flex h-9 items-center justify-center gap-1.5" aria-hidden="true">
            {[14, 24, 32, 20, 28, 16, 22].map((height, index) => (
              <span
                key={`${height}-${index}`}
                className={`w-1.5 rounded-full transition-all ${voiceCallActive ? "animate-pulse" : "opacity-30"}`}
                style={{
                  height,
                  backgroundColor: soul.appearance.accent,
                  animationDelay: `${index * 90}ms`,
                }}
              />
            ))}
          </div>

          {(lastVisitor || lastAssistant) && (
            <div
              className={`mt-6 w-full max-w-sm rounded-2xl border p-4 text-left ${
                isDark ? "border-white/10 bg-white/5" : "border-[#e4e6e1] bg-[#fafbf9]"
              }`}
            >
              {lastVisitor && (
                <p className={`text-xs ${mutedTone}`}>
                  You:{" "}
                  <span className={isDark ? "text-white/75" : "text-[#3f433d]"}>
                    {lastVisitor.content}
                  </span>
                </p>
              )}
              {lastAssistant && (
                <p className={`mt-2 line-clamp-2 text-xs leading-5 ${mutedTone}`}>
                  {soul.personality.name}:{" "}
                  <span className={isDark ? "text-white/75" : "text-[#3f433d]"}>
                    {lastAssistant.content}
                  </span>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-5 w-full max-w-sm rounded-xl border border-[#eed5ce] bg-[#fff6f2] px-4 py-3 text-sm text-[#934b3a]">
              {error}
            </div>
          )}
        </div>

        <div className={`border-t p-5 ${dividerTone}`}>
          <button
            onClick={voiceCallActive ? stopVoiceCall : startVoiceCall}
            className={`mx-auto flex h-14 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 ${
              voiceCallActive
                ? "bg-[#b84c43] text-white hover:bg-[#a9433b]"
                : "bg-[#20231f] text-white hover:bg-black"
            }`}
            aria-label={voiceCallActive ? "End voice call" : "Start voice call"}
          >
            {voiceCallActive ? <PhoneOff className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            {voiceCallActive ? "End call" : "Start voice call"}
          </button>
          <p className={`mt-3 text-center text-xs ${isDark ? "text-white/34" : "text-[#969993]"}`}>
            Microphone access is used only during the call
          </p>
        </div>
      </div>
    );
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
  results: ArrayLike<{ [index: number]: { transcript: string }; isFinal: boolean }>;
};

type VoiceStreamEvent =
  | {
      type: "meta";
      citations: NonNullable<SoulMessage["citations"]>;
      followUp: string;
      leadIntent: ChatResponse["leadIntent"];
      mode: ChatResponse["mode"];
    }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message?: string };

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function findSpeechBoundary(text: string) {
  if (text.length < 24) return -1;
  const sentence = text.match(/^[\s\S]{24,}?[.!?](?:["')\]]*)\s/);
  if (sentence) return sentence[0].length;
  if (text.length < 110) return -1;
  const comma = text.slice(45, 100).lastIndexOf(", ");
  if (comma >= 0) return 45 + comma + 2;
  const space = text.lastIndexOf(" ", 92);
  return space >= 45 ? space + 1 : -1;
}

function prepareVoiceChunks(question: string, soul: Soul): KnowledgeChunk[] {
  const chunks = soul.knowledge.pages.flatMap((page) => page.chunks);
  const ranked = rankKnowledgeChunks(question, chunks);
  return (ranked.length ? ranked.slice(0, 48) : chunks.slice(0, 48)).map((chunk) => ({
    id: chunk.id,
    pageUrl: chunk.pageUrl,
    pageTitle: chunk.pageTitle,
    text: chunk.text,
    order: chunk.order,
    tokenEstimate: chunk.tokenEstimate,
  }));
}

function greetingMessage(soulId: string, greeting: string): SoulMessage {
  return {
    id: `greeting-${soulId}`,
    role: "assistant",
    content: greeting,
    createdAt: new Date().toISOString(),
  };
}
