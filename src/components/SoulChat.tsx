import { activeKnowledgeChunks } from "@/lib/knowledge-content";
import { launcherMode } from "@/lib/launcher";
import { chatAppearance, glassSurface } from "@/lib/chat-appearance";
import { findSpeechBoundary } from "@/lib/speech-segments";
import { NEURAL_QUALITY_STEPS, neuralVoice } from "@/lib/voice-catalog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  BookOpen,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { readChatResponse } from "@/lib/chat-stream";
import { selectRequestChunks, type ChatResponse } from "@/lib/conversation";
import type { Soul, SoulMessage } from "@/lib/soul";
import {
  fetchSupertonicAudio,
  playSupertonicAudio,
  speakSupertonic,
  stopSupertonic,
} from "@/lib/supertonic";
import { authFetch } from "@/lib/auth-client";

export default function SoulChat({
  soul,
  compact = false,
  fill = false,
  voiceMode = false,
  initialPanelMode = "voice",
  onClose,
  onMessagesChange,
  sessionToken,
  contactAction,
}: {
  soul: Soul;
  compact?: boolean;
  fill?: boolean;
  voiceMode?: boolean;
  initialPanelMode?: "voice" | "chat";
  onClose?: () => void;
  onMessagesChange?: (messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) => void;
  sessionToken?: string;
  contactAction?: ReactNode;
}) {
  const mode = launcherMode(soul.appearance);
  const openingView = mode === "both" ? initialPanelMode : mode;
  const [messages, setMessages] = useState<SoulMessage[]>(() => [
    greetingMessage(soul.id, soul.personality.greeting),
  ]);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soul.voice.enabled && openingView === "voice");
  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "thinking" | "speaking">(
    "idle",
  );
  const [panelView, setVoicePanelView] = useState<"voice" | "chat">(openingView);
  const voicePanelView = mode === "both" ? panelView : mode;
  const callLanguage = soul.voice.language || "en-US";
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceCallActiveRef = useRef(false);
  const messagesRef = useRef(messages);
  const sendingRef = useRef(false);
  const voiceRequestRef = useRef<AbortController | null>(null);
  const greetingAudioRef = useRef<Promise<Blob> | null>(null);
  const appearanceStyle = chatAppearance(soul.appearance);
  const brandStyle = { backgroundColor: "var(--chat-accent)", color: "var(--chat-on-accent)" };
  const theme = soul.appearance.theme ?? "light";
  const isDark = theme === "dark";
  const isGlass = theme === "glass";
  const shellTone = isDark
    ? "border-white/10 bg-[#131211] text-[#f7f7f6] shadow-[0_18px_60px_rgba(0,0,0,.38)]"
    : isGlass
      ? "border-white/60 text-[#212120]"
      : "border-[#e0dfdc] bg-white text-[#212120] shadow-[0_12px_36px_rgba(0,0,0,.08)]";
  const dividerTone = isDark ? "border-white/10" : "border-[#ecebe9]";
  const mutedTone = isDark ? "text-white/48" : isGlass ? "text-[#50545b]" : "text-[#7f7d78]";
  const quietButtonTone = isDark
    ? "text-white/55 hover:bg-white/10 hover:text-white"
    : "text-[#7b7974] hover:bg-[#f2f2f1] hover:text-[#272725]";

  useEffect(() => {
    const greeting = [greetingMessage(soul.id, soul.personality.greeting)];
    messagesRef.current = greeting;
    setMessages(greeting);
    stopVoiceCall();
  }, [
    soul.id,
    soul.personality.greeting,
    soul.voice.enabled,
    soul.voice.language,
    initialPanelMode,
  ]);

  useEffect(() => {
    setVoicePanelView(openingView);
    setSoundEnabled(soul.voice.enabled && openingView === "voice");
    if (openingView === "chat") stopVoiceCall();
  }, [openingView, soul.voice.enabled]);

  useEffect(() => {
    if (!voiceMode) stopVoiceCall();
  }, [voiceMode]);

  useEffect(
    () => () => {
      voiceCallActiveRef.current = false;
      voiceRequestRef.current?.abort();
      recognitionRef.current?.abort();
      stopSupertonic();
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!voiceMode || voicePanelView !== "voice") return;
    // Generate the predictable opening line while the visitor is looking at
    // the call panel. Clicking Call can then begin with human speech instead
    // of a cold HTTP + inference pause.
    const audio = fetchSupertonicAudio(soul.personality.greeting, {
      voice: neuralVoice(soul.voice.provider === "supertonic" ? soul.voice.profileId : undefined)
        .id,
      language: callLanguage,
      speed: soul.voice.speed,
      qualitySteps: NEURAL_QUALITY_STEPS,
      soulId: soul.id,
      sessionToken,
    });
    greetingAudioRef.current = audio;
    void audio.catch(() => {
      if (greetingAudioRef.current === audio) greetingAudioRef.current = null;
    });
    return () => {
      greetingAudioRef.current = null;
    };
  }, [
    voiceMode,
    voicePanelView,
    sessionToken,
    soul.voice.provider,
    soul.voice.profileId,
    soul.voice.speed,
    soul.personality.greeting,
    soul.id,
    callLanguage,
  ]);

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
    const requestController = new AbortController();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = requestController;

    try {
      if (continueVoiceCall) {
        await streamVoiceMessage(nextMessages, requestController);
        return;
      }
      const assistantId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const response = await authFetch("/api/chat", {
        signal: requestController.signal,
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          stream: true,
          soulId: soul.id,
          personality: soul.personality,
          chunks: sessionToken
            ? []
            : selectRequestChunks(nextMessages, activeKnowledgeChunks(soul.knowledge)),
          messages: nextMessages.slice(-12).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const data = await readChatResponse(response, (answer) => {
        requestController.signal.throwIfAborted();
        setMessages([
          ...nextMessages,
          {
            id: assistantId,
            role: "assistant",
            content: answer,
            createdAt,
            citations: [],
          },
        ]);
      });
      requestController.signal.throwIfAborted();
      const assistant: SoulMessage = {
        id: assistantId,
        role: "assistant",
        content: data.answer,
        createdAt,
        citations: data.citations,
      };
      const completed = [...nextMessages, assistant];
      messagesRef.current = completed;
      setMessages(completed);
      onMessagesChange?.(completed, data.leadIntent);
      const shouldSpeak = !voiceMode && soundEnabled;
      if (shouldSpeak) {
        setVoiceStatus("speaking");
        try {
          await speak(data.answer);
        } catch {
          setError("The selected voice is temporarily unavailable. The text answer is still here.");
        }
      }
    } catch (cause) {
      if (requestController.signal.aborted) return;
      requestController.abort();
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "The conversation was interrupted.");
      }
      if (continueVoiceCall) stopVoiceCall();
    } finally {
      if (voiceRequestRef.current === requestController) {
        voiceRequestRef.current = null;
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  async function streamVoiceMessage(
    nextMessages: SoulMessage[],
    requestController: AbortController,
  ) {
    const response = await authFetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({
        soulId: soul.id,
        personality: soul.personality,
        chunks: sessionToken
          ? []
          : selectRequestChunks(nextMessages, activeKnowledgeChunks(soul.knowledge)),
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
    const speaker = createStreamingSpeaker(requestController.signal);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let speechFinished: Promise<void> | undefined;
    let textFinished = false;
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
        requestController.signal.throwIfAborted();
        buffer += decoder.decode(chunk, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as VoiceStreamEvent;
          if (event.type === "meta") {
            citations = event.citations;
            leadIntent = event.leadIntent;
          } else if (event.type === "delta" && event.text && !textFinished) {
            answer += event.text;
            speaker.push(event.text);
            updateDraft();
          } else if (event.type === "done" && !textFinished) {
            textFinished = true;
            // Flush the last sentence now, while the server settles usage.
            speechFinished = speaker.finish();
            void speechFinished.catch(() => undefined);
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
      await (speechFinished ?? speaker.finish());
      if (voiceCallActiveRef.current)
        window.setTimeout(() => {
          if (!requestController.signal.aborted) startListening(true);
        }, 60);
    } catch (error) {
      if (!requestController.signal.aborted) stopSupertonic();
      throw error;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  async function speak(text: string) {
    await speakSupertonic(text, {
      voice: neuralVoice(soul.voice.provider === "supertonic" ? soul.voice.profileId : undefined)
        .id,
      language: callLanguage,
      speed: soul.voice.speed,
      qualitySteps: NEURAL_QUALITY_STEPS,
      soulId: soul.id,
      sessionToken,
    });
  }

  function createStreamingSpeaker(signal: AbortSignal) {
    let pendingText = "";
    let synthesis = Promise.resolve();
    let playback = Promise.resolve();

    const queue = (text: string) => {
      const segment = text.trim();
      if (!segment) return;
      // Keep inference serialized on the small voice host, but start the
      // next synthesis while the previous phrase is playing. This removes
      // the dead-air gap between phrases without stampeding the model.
      const audio = synthesis.then(() => {
        signal.throwIfAborted();
        return fetchSupertonicAudio(segment, {
          signal,
          voice: neuralVoice(
            soul.voice.provider === "supertonic" ? soul.voice.profileId : undefined,
          ).id,
          language: callLanguage,
          speed: soul.voice.speed,
          qualitySteps: NEURAL_QUALITY_STEPS,
          soulId: soul.id,
          sessionToken,
        });
      });
      synthesis = audio.then(
        () => undefined,
        () => undefined,
      );
      playback = playback.then(async () => {
        if (signal.aborted || !voiceCallActiveRef.current) return;
        const blob = await audio;
        if (signal.aborted || !voiceCallActiveRef.current) return;
        await playSupertonicAudio(blob, () => setVoiceStatus("speaking"));
      });
      // Observe failures immediately while the text stream is still arriving.
      // finish() still propagates the original failure to the call UI.
      void playback.catch(() => undefined);
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
    recognition.lang = callLanguage;
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
      endpointTimer = window.setTimeout(() => recognition.stop(), 320);
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
    const greeting = soul.personality.greeting.trim();
    setVoiceStatus("thinking");
    const controller = new AbortController();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = controller;
    const opening = (async () => {
      const audio = await (greetingAudioRef.current ??
        fetchSupertonicAudio(greeting, {
          voice: neuralVoice(soul.voice.profileId).id,
          language: callLanguage,
          speed: soul.voice.speed,
          qualitySteps: NEURAL_QUALITY_STEPS,
          soulId: soul.id,
          sessionToken,
          signal: controller.signal,
        }));
      controller.signal.throwIfAborted();
      await playSupertonicAudio(audio, () => setVoiceStatus("speaking"));
      controller.signal.throwIfAborted();
    })();
    void opening
      .then(() => {
        if (voiceCallActiveRef.current) startListening(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("The selected voice is temporarily unavailable. Please try again shortly.");
        stopVoiceCall();
      });
  }

  function stopVoiceCall() {
    voiceCallActiveRef.current = false;
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    sendingRef.current = false;
    setSending(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopSupertonic();
    setListening(false);
    setVoiceCallActive(false);
    setVoiceStatus("idle");
  }

  function restart() {
    stopVoiceCall();
    const greeting = [greetingMessage(soul.id, soul.personality.greeting)];
    messagesRef.current = greeting;
    setMessages(greeting);
    setError("");
    stopSupertonic();
  }

  function showPanelView(view: "voice" | "chat") {
    setVoicePanelView(view);
    if (view === "chat") stopVoiceCall();
  }

  if (voiceMode) {
    const statusLabel =
      voiceStatus === "listening"
        ? "Listening..."
        : voiceStatus === "thinking"
          ? "Thinking..."
          : voiceStatus === "speaking"
            ? `${soul.personality.name} is speaking...`
            : `Talk with ${soul.personality.name}`;

    return (
      <div
        data-chat-theme={theme}
        style={{ ...appearanceStyle, ...(isGlass ? glassSurface : {}) }}
        className={`relative flex flex-col overflow-hidden rounded-[30px] border ${shellTone} ${fill ? "h-full min-h-0" : compact ? "h-[620px]" : "h-[680px]"}`}
      >
        <div
          className={`relative z-20 flex h-[64px] shrink-0 items-center justify-between gap-3 border-b px-4 ${dividerTone}`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{soul.personality.name}</p>
            <p className={`text-xs ${mutedTone}`}>
              {voicePanelView === "voice" ? "Voice conversation" : "Chat with us"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {mode === "both" && (
              <button
                onClick={() => showPanelView(voicePanelView === "voice" ? "chat" : "voice")}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${quietButtonTone}`}
                aria-label={voicePanelView === "voice" ? "Open text chat" : "Open voice chat"}
              >
                {voicePanelView === "voice" ? (
                  <MessageCircle className="h-[19px] w-[19px]" />
                ) : (
                  <Phone className="h-[18px] w-[18px]" />
                )}
              </button>
            )}
            {onClose && (
              <button
                onClick={() => {
                  stopVoiceCall();
                  onClose();
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${quietButtonTone}`}
                aria-label="Close conversation"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {voicePanelView === "voice" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-7 pb-4 pt-2 text-center">
            <div className="relative flex h-[190px] w-[190px] shrink-0 items-center justify-center">
              <div
                className={`absolute inset-0 rounded-full ${voiceCallActive ? "animate-[spin_10s_linear_infinite]" : ""}`}
                style={{
                  background:
                    "radial-gradient(circle at 28% 24%,rgba(255,229,76,.95),transparent 31%),radial-gradient(circle at 74% 70%,rgba(47,180,255,.95),transparent 35%),radial-gradient(circle at 24% 78%,rgba(75,205,224,.9),transparent 33%),radial-gradient(circle at 75% 20%,rgba(106,211,237,.85),transparent 31%),#88c8d4",
                  filter: "saturate(.9)",
                  boxShadow:
                    "inset 0 0 30px rgba(255,255,255,.28),0 20px 48px rgba(61,143,164,.22)",
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-full opacity-35 mix-blend-overlay"
                style={{
                  backgroundImage:
                    "repeating-radial-gradient(circle at 40% 45%,rgba(255,255,255,.65) 0 1px,transparent 1px 3px)",
                }}
              />
              {voiceCallActive && (
                <span className="absolute -inset-3 animate-pulse rounded-full border border-[#66c5d5]/35" />
              )}
              <button
                onClick={voiceCallActive ? stopVoiceCall : startVoiceCall}
                style={voiceCallActive ? undefined : brandStyle}
                className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#121110] shadow-[0_8px_28px_rgba(25,35,28,.2)] transition hover:scale-105 ${
                  voiceCallActive ? "text-[#b34b43]" : ""
                }`}
                aria-label={voiceCallActive ? "End voice call" : "Start voice call"}
              >
                {voiceCallActive ? (
                  <PhoneOff className="h-5 w-5" />
                ) : (
                  <Phone className="h-5 w-5 fill-current" />
                )}
              </button>
            </div>
            <h3 className="mt-6 text-[17px] font-semibold">{statusLabel}</h3>
            <p className={`mt-2 max-w-[300px] text-sm leading-5 ${mutedTone}`}>
              {voiceCallActive
                ? "Speak naturally. The conversation keeps listening after every reply."
                : mode === "voice"
                  ? "Ask about this website by voice."
                  : "Ask about this website by voice or message."}
            </p>
            {error && (
              <div className="mt-4 w-full max-w-sm rounded-xl border border-[#eed5ce] bg-[#fff6f2] px-4 py-3 text-sm text-[#934b3a]">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "visitor" ? "justify-end" : "justify-start"}`}
              >
                <div
                  style={message.role === "visitor" ? brandStyle : undefined}
                  className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6 ${
                    message.role === "visitor"
                      ? "rounded-br-md shadow-sm"
                      : isDark
                        ? "rounded-bl-md bg-white/8 text-white/90"
                        : "rounded-bl-md bg-black/5 text-[#32312f]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {!!message.citations?.length && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {message.citations.map((citation, index) => (
                        <a
                          key={`${citation.chunkId}-${index}`}
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${isDark ? "border-white/15 bg-white/5 text-white/80" : "border-black/10 bg-white/70 text-[#64635f]"}`}
                        >
                          {citation.title.slice(0, 26)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && messages.at(-1)?.role !== "assistant" && (
              <div className={`flex items-center gap-2 text-sm ${mutedTone}`}>
                <LoaderCircle className="h-4 w-4 animate-spin" /> {soul.personality.name} is
                thinking...
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-[#eed5ce] bg-[#fff6f2] px-4 py-3 text-sm text-[#934b3a]">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 px-4 pb-4 pt-2">
          {contactAction}
          {mode !== "voice" && (
            <div
              className={`flex items-end gap-2 rounded-full border p-1.5 pl-5 focus-within:border-[var(--chat-accent)] ${isDark ? "border-white/20 bg-white/5" : "border-black/15 bg-white/70"}`}
            >
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                    if (voicePanelView === "voice") showPanelView("chat");
                  }
                }}
                rows={1}
                placeholder="Ask this website..."
                className="max-h-24 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-[#a7a49d]"
              />
              <button
                onClick={() => {
                  void sendMessage();
                  if (voicePanelView === "voice") showPanelView("chat");
                }}
                disabled={!value.trim() || sending}
                style={brandStyle}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:brightness-95 disabled:opacity-30"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          )}
          {mode !== "chat" && (
            <p className={`mt-2 text-center text-[10px] ${mutedTone}`}>
              Voice uses your microphone only while the call is active
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-chat-theme={theme}
      style={{ ...appearanceStyle, ...(isGlass ? glassSurface : {}) }}
      className={`flex flex-col overflow-hidden rounded-2xl border ${shellTone} ${
        fill ? "h-full min-h-[420px]" : compact ? "h-[560px]" : "h-[650px]"
      }`}
    >
      <div className={`flex items-center justify-between border-b px-5 py-4 ${dividerTone}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#212120]"
            style={brandStyle}
          >
            {soul.personality.name.charAt(0)}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22c55e]" />
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
              stopSupertonic();
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
              style={message.role === "visitor" ? brandStyle : undefined}
              className={`max-w-[88%] ${
                message.role === "visitor"
                  ? "rounded-2xl rounded-br-md bg-[#212120] px-4 py-3 text-white"
                  : isDark
                    ? "text-white/82"
                    : "text-[#363533]"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              {!!message.citations?.length && (
                <div className="mt-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[#767570]">
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
                            : "border-[#e0dfdc] bg-[#f9f9f9] text-[#686661] hover:border-[#c0beb9] hover:text-[#212120]"
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
        {sending && messages.at(-1)?.role !== "assistant" && (
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
        {contactAction}
        {messages.length === 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {["What do you offer?", "How does it work?", "Which option fits me?"].map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendMessage(prompt)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  isDark
                    ? "border-white/12 bg-white/6 text-white/58 hover:bg-white/10 hover:text-white"
                    : "border-[#e0dfdc] bg-white text-[#6b6964] hover:bg-[#f4f4f3]"
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
              : "border-[#dad9d7] bg-[#f9f9f9] focus-within:border-[#b2b0aa] focus-within:bg-white"
          }`}
        >
          <button
            onClick={toggleListening}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              listening
                ? "bg-[#a84c3e] text-white"
                : isDark
                  ? "text-white/52 hover:bg-white/10 hover:text-white"
                  : "text-[#777671] hover:bg-[#ececeb]"
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
              isDark ? "placeholder:text-white/30" : "placeholder:text-[#9f9d95]"
            }`}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!value.trim() || sending}
            style={brandStyle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:brightness-95 disabled:opacity-30"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className={`mt-2 text-center text-xs ${isDark ? "text-white/34" : "text-[#9b9991]"}`}>
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

function greetingMessage(soulId: string, greeting: string): SoulMessage {
  return {
    id: `greeting-${soulId}`,
    role: "assistant",
    content: greeting,
    createdAt: new Date().toISOString(),
  };
}
