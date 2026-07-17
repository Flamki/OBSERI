import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { rankKnowledgeChunks, type ChatResponse } from "@/lib/conversation";
import type { KnowledgeChunk, Soul, SoulMessage } from "@/lib/soul";
import {
  fetchSupertonicAudio,
  playSupertonicAudio,
  speakSupertonic,
  stopSupertonic,
  type SupertonicVoiceId,
} from "@/lib/supertonic";

const VOICE_LANGUAGES = [
  { code: "en-US", name: "English", flag: "US" },
  { code: "hi-IN", name: "Hindi", flag: "IN" },
  { code: "es-ES", name: "Spanish", flag: "ES" },
  { code: "fr-FR", name: "French", flag: "FR" },
  { code: "de-DE", name: "German", flag: "DE" },
  { code: "pt-BR", name: "Portuguese", flag: "BR" },
  { code: "ar-SA", name: "Arabic", flag: "SA" },
] as const;

function countryFlag(countryCode: string) {
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((character) => 127397 + character.charCodeAt(0)),
  );
}

export default function SoulChat({
  soul,
  compact = false,
  fill = false,
  voiceMode = false,
  initialPanelMode = "voice",
  onClose,
  onMessagesChange,
}: {
  soul: Soul;
  compact?: boolean;
  fill?: boolean;
  voiceMode?: boolean;
  initialPanelMode?: "voice" | "chat";
  onClose?: () => void;
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
  const [voicePanelView, setVoicePanelView] = useState<"voice" | "chat">(initialPanelMode);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [callLanguage, setCallLanguage] = useState(soul.voice.language || "en-US");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
    setCallLanguage(soul.voice.language || "en-US");
    setVoicePanelView(initialPanelMode);
    stopVoiceCall();
  }, [
    soul.id,
    soul.personality.greeting,
    soul.voice.enabled,
    soul.voice.language,
    initialPanelMode,
  ]);

  useEffect(() => {
    if (!voiceMode) stopVoiceCall();
  }, [voiceMode]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(
    () => () => {
      voiceCallActiveRef.current = false;
      voiceRequestRef.current?.abort();
      recognitionRef.current?.abort();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      stopSupertonic();
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!voiceMode || soul.voice.provider !== "supertonic") return;
    // Generate the predictable opening line while the visitor is looking at
    // the call panel. Clicking Call can then begin with human speech instead
    // of a cold HTTP + inference pause.
    void fetchSupertonicAudio(soul.personality.greeting, {
      voice: (soul.voice.profileId || "F1") as SupertonicVoiceId,
      language: callLanguage,
      speed: soul.voice.speed,
      qualitySteps: 4,
    }).catch(() => undefined);
  }, [
    voiceMode,
    soul.voice.provider,
    soul.voice.profileId,
    soul.voice.speed,
    soul.personality.greeting,
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
      const shouldSpeak = !voiceMode && soundEnabled;
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

    if (soul.voice.provider === "supertonic") {
      await speakSupertonic(text, {
        voice: (soul.voice.profileId || "F1") as SupertonicVoiceId,
        language: callLanguage,
        speed: soul.voice.speed,
        qualitySteps: 2,
      });
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      await speakBrowserSegment(text);
    }
  }

  function createStreamingSpeaker() {
    let pendingText = "";
    let synthesis = Promise.resolve();
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
      } else if (soul.voice.provider === "supertonic") {
        // Keep inference serialized on the small voice host, but start the
        // next synthesis while the previous phrase is playing. This removes
        // the dead-air gap between phrases without stampeding the model.
        const audio = synthesis.then(() =>
          fetchSupertonicAudio(segment, {
            voice: (soul.voice.profileId || "F1") as SupertonicVoiceId,
            language: callLanguage,
            speed: soul.voice.speed,
            qualitySteps: 2,
          }).catch(() => null),
        );
        synthesis = audio.then(() => undefined);
        playback = playback.then(async () => {
          if (!voiceCallActiveRef.current) return;
          const blob = await audio;
          if (blob) await playSupertonicAudio(blob);
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
        language: callLanguage,
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
    utterance.lang = callLanguage;
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
    setVoiceStatus("speaking");
    const opening =
      soul.voice.provider === "supertonic"
        ? fetchSupertonicAudio(greeting, {
            voice: (soul.voice.profileId || "F1") as SupertonicVoiceId,
            language: callLanguage,
            speed: soul.voice.speed,
            qualitySteps: 4,
          }).then(playSupertonicAudio)
        : speak(greeting);
    void opening
      .catch(() => speakBrowserSegment(greeting))
      .then(() => {
        if (voiceCallActiveRef.current) startListening(true);
      });
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
    stopSupertonic();
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
    stopSupertonic();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === panelRef.current) {
        await document.exitFullscreen();
      } else {
        await panelRef.current?.requestFullscreen();
      }
    } catch {
      setError("Fullscreen is not available in this browser.");
    }
  }

  function showPanelView(view: "voice" | "chat") {
    setVoicePanelView(view);
    setLanguageOpen(false);
    if (view === "chat") stopVoiceCall();
  }

  if (voiceMode) {
    const selectedLanguage =
      VOICE_LANGUAGES.find((language) => language.code === callLanguage) ?? VOICE_LANGUAGES[0];
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
        ref={panelRef}
        className={`relative flex flex-col overflow-hidden border bg-white text-[#1f211e] shadow-[0_24px_80px_rgba(20,24,18,.16)] ${
          isFullscreen
            ? "h-screen rounded-none"
            : `rounded-[30px] ${fill ? "h-full min-h-[440px]" : compact ? "h-[620px]" : "h-[680px]"}`
        }`}
      >
        <div className="relative z-20 flex h-[72px] shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => showPanelView(voicePanelView === "voice" ? "chat" : "voice")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f3f0] text-[#5b5d57] transition hover:bg-[#ebeae6] hover:text-[#20221f]"
              aria-label={voicePanelView === "voice" ? "Open text chat" : "Open voice chat"}
            >
              {voicePanelView === "voice" ? (
                <MessageCircle className="h-[19px] w-[19px]" />
              ) : (
                <Phone className="h-[18px] w-[18px]" />
              )}
            </button>
            {onClose && (
              <button
                onClick={() => {
                  stopVoiceCall();
                  onClose();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#999b95] transition hover:bg-[#f4f3f0] hover:text-[#20221f]"
                aria-label="Close conversation"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={() => setLanguageOpen((current) => !current)}
              className="flex h-11 items-center gap-2 rounded-full border border-[#e6e5e1] bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-[#fafaf8]"
              aria-expanded={languageOpen}
            >
              <span className="text-base" aria-hidden="true">
                {countryFlag(selectedLanguage.flag)}
              </span>
              <span>{selectedLanguage.name}</span>
              <ChevronDown className="h-4 w-4 text-[#858881]" />
            </button>
            {languageOpen && (
              <div className="absolute left-1/2 top-[50px] z-30 max-h-64 w-52 -translate-x-1/2 overflow-y-auto rounded-2xl border border-[#e3e2de] bg-white p-2 shadow-[0_18px_50px_rgba(25,28,22,.16)]">
                {VOICE_LANGUAGES.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => {
                      stopVoiceCall();
                      setCallLanguage(language.code);
                      setLanguageOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[#f4f3f0] ${
                      language.code === callLanguage ? "bg-[#f4f3f0] font-semibold" : ""
                    }`}
                  >
                    <span className="text-base">{countryFlag(language.flag)}</span>
                    <span>{language.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => void toggleFullscreen()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f3f0] text-[#5b5d57] transition hover:bg-[#ebeae6] hover:text-[#20221f]"
            aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-[18px] w-[18px]" />
            ) : (
              <Maximize2 className="h-[18px] w-[18px]" />
            )}
          </button>
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
                className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#11130f] shadow-[0_8px_28px_rgba(25,35,28,.2)] transition hover:scale-105 ${
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
            <p className="mt-2 max-w-[300px] text-sm leading-5 text-[#777a74]">
              {voiceCallActive
                ? "Speak naturally. The conversation keeps listening after every reply."
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
                  className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6 ${
                    message.role === "visitor"
                      ? "rounded-br-md border border-[#e1e0dc] bg-white text-[#22241f] shadow-sm"
                      : "rounded-bl-md bg-[#f2f1ee] text-[#31332e]"
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
                          className="inline-flex items-center gap-1 rounded-full border border-[#dcded8] bg-white px-2.5 py-1 text-[11px] text-[#61655e]"
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
            {sending && (
              <div className="flex items-center gap-2 text-sm text-[#777a74]">
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
          <div className="flex items-end gap-2 rounded-full border border-[#dededa] bg-white p-1.5 pl-5 shadow-[0_4px_16px_rgba(25,29,22,.06)] focus-within:border-[#b9bdb4]">
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
              className="max-h-24 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-[#a3a59f]"
            />
            <button
              onClick={() => {
                void sendMessage();
                if (voicePanelView === "voice") showPanelView("chat");
              }}
              disabled={!value.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22241f] text-white transition hover:bg-black disabled:bg-[#eeede9] disabled:text-[#aaaca6]"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#a0a29c]">
            Voice uses your microphone only while the call is active
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
  if (text.length < 16) return -1;
  const sentence = text.match(/^[\s\S]{16,}?[.!?](?:["')\]]*)\s/);
  if (sentence) return sentence[0].length;
  if (text.length < 76) return -1;
  const comma = text.slice(30, 72).lastIndexOf(", ");
  if (comma >= 0) return 30 + comma + 2;
  const space = text.lastIndexOf(" ", 68);
  return space >= 30 ? space + 1 : -1;
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
