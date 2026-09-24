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
  setSupertonicAudioTap,
  speakSupertonic,
  stopSupertonic,
  type SupertonicVoiceId,
} from "@/lib/supertonic";
import { authFetch } from "@/lib/auth-client";
import VoiceOrb from "@/components/voice/VoiceOrb";
import { cleanForSpeech, contrastText, orbPalette } from "@/lib/voice-appearance";
import {
  inputLevel,
  micMeterActive,
  outputLevel,
  playCue,
  resumeAudio,
  startMicMeter,
  stopMicMeter,
  tapOutput,
} from "@/lib/voice-meter";

type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking";

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
  sessionToken,
}: {
  soul: Soul;
  compact?: boolean;
  fill?: boolean;
  voiceMode?: boolean;
  initialPanelMode?: "voice" | "chat";
  onClose?: () => void;
  onMessagesChange?: (messages: SoulMessage[], leadIntent: ChatResponse["leadIntent"]) => void;
  sessionToken?: string;
}) {
  const [messages, setMessages] = useState<SoulMessage[]>(() => [
    greetingMessage(soul.id, soul.personality.greeting),
  ]);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soul.voice.enabled);
  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const [voiceStatus, setVoiceStatusState] = useState<VoiceStatus>("idle");
  const voiceStatusRef = useRef<VoiceStatus>("idle");
  const setVoiceStatus = (next: VoiceStatus) => {
    voiceStatusRef.current = next;
    setVoiceStatusState(next);
  };
  const [visitorCaption, setVisitorCaption] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [, setClockTick] = useState(0);
  // Every visitor turn and every interruption gets a new id, so late callbacks from an
  // abandoned reply can never restart listening or end the call.
  const turnRef = useRef(0);
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
    ? "border-white/10 bg-[#131211] text-[#f7f7f6] shadow-[0_18px_60px_rgba(0,0,0,.38)]"
    : isGlass
      ? "border-white/60 bg-white/80 text-[#212120] shadow-[0_18px_60px_rgba(31,40,26,.18)] backdrop-blur-2xl"
      : "border-[#e0dfdc] bg-white text-[#212120] shadow-[0_12px_36px_rgba(0,0,0,.08)]";
  const dividerTone = isDark ? "border-white/10" : "border-[#ecebe9]";
  const mutedTone = isDark ? "text-white/48" : "text-[#7f7d78]";
  const quietButtonTone = isDark
    ? "text-white/55 hover:bg-white/10 hover:text-white"
    : "text-[#7b7974] hover:bg-[#f2f2f1] hover:text-[#272725]";

  useEffect(() => {
    const greeting = [greetingMessage(soul.id, soul.personality.greeting)];
    messagesRef.current = greeting;
    setMessages(greeting);
    setSoundEnabled(soul.voice.enabled);
    setCallLanguage(soul.voice.language || "en-US");
    setVoicePanelView(initialPanelMode);
    stopVoiceCall();
    // Reset only when the identity or voice settings change; stopVoiceCall reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    soul.id,
    soul.personality.greeting,
    soul.voice.enabled,
    soul.voice.language,
    initialPanelMode,
  ]);

  useEffect(() => {
    if (!voiceMode) stopVoiceCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    setSupertonicAudioTap((audio) => void tapOutput(audio));
    return () => {
      setSupertonicAudioTap(null);
      voiceCallActiveRef.current = false;
      voiceRequestRef.current?.abort();
      recognitionRef.current?.abort();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      stopSupertonic();
      stopMicMeter();
    };
  }, []);

  useEffect(() => {
    if (!callStartedAt) return;
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callStartedAt]);

  // Talk-over detection: sustained speech well above the room's noise floor while the agent
  // is talking interrupts it, like a real conversation. Echo-cancelled mic input only.
  useEffect(() => {
    if (!voiceCallActive || soul.voice.interruptions === false) return;
    let frame = 0;
    let floor = 0.03;
    let loudSince = 0;
    const loop = (now: number) => {
      frame = window.requestAnimationFrame(loop);
      if (!micMeterActive() || micMutedRef.current) return;
      const level = inputLevel();
      const status = voiceStatusRef.current;
      if (status === "listening") {
        floor = floor * 0.98 + Math.min(level, 0.2) * 0.02;
        loudSince = 0;
        return;
      }
      if (status !== "speaking") {
        loudSince = 0;
        return;
      }
      const threshold = Math.max(0.22, floor * 4);
      if (level > threshold) {
        loudSince ||= now;
        if (now - loudSince > 320) {
          loudSince = 0;
          interruptAgent();
        }
      } else {
        loudSince = 0;
      }
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
    // interruptAgent only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceCallActive, soul.voice.interruptions]);

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
      soulId: soul.id,
    }).catch(() => undefined);
  }, [
    voiceMode,
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
    const turn = continueVoiceCall ? ++turnRef.current : turnRef.current;
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
        await streamVoiceMessage(nextMessages, turn);
        return;
      }
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        },
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
          setError("The selected voice is temporarily unavailable. The text answer is still here.");
        }
      }
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      // An interrupted reply is expected; the call carries on listening.
      if (continueVoiceCall && (aborted || turn !== turnRef.current)) return;
      if (!aborted) {
        setError(cause instanceof Error ? cause.message : "The conversation was interrupted.");
      }
      if (continueVoiceCall) stopVoiceCall();
    } finally {
      voiceRequestRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function streamVoiceMessage(nextMessages: SoulMessage[], turn: number) {
    const requestController = new AbortController();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = requestController;
    const response = await authFetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      },
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
    const speaker = createStreamingSpeaker(turn);
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
            if (turn !== turnRef.current) break;
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
      if (voiceCallActiveRef.current && turn === turnRef.current) {
        window.setTimeout(() => startListening(true), 60);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function speak(raw: string) {
    const text = cleanForSpeech(raw);
    if (!text) return;
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

  function createStreamingSpeaker(turn: number) {
    const live = () => voiceCallActiveRef.current && turn === turnRef.current;
    let pendingText = "";
    let synthesis = Promise.resolve();
    let playback = Promise.resolve();
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();

    const queue = (text: string) => {
      const segment = cleanForSpeech(text);
      if (!segment || !live()) return;
      if (soul.voice.provider === "voicebox" && soul.voice.profileId) {
        const audio = fetchVoiceboxAudio(segment, voiceRequestRef.current?.signal);
        playback = playback.then(async () => {
          if (!live()) return;
          await playAudioBlob(await audio);
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
            soulId: soul.id,
          }),
        );
        synthesis = audio.then(
          () => undefined,
          () => undefined,
        );
        playback = playback.then(async () => {
          if (!live()) return;
          await playSupertonicAudio(await audio);
        });
      } else {
        playback = playback.then(() => (live() ? speakBrowserSegment(segment) : Promise.resolve()));
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
    const response = await authFetch("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        soulId: soul.id,
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
    tapOutput(audio);
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
      setError("Voice input is not supported in this browser. You can still type below.");
      if (autoSend) stopVoiceCall();
      return;
    }
    if (autoSend && (micMutedRef.current || !voiceCallActiveRef.current)) return;
    if (recognitionRef.current) return;
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
      if (autoSend) setVisitorCaption(transcript);
      if (!autoSend || hasFinalResult) {
        submitTranscript();
        return;
      }
      // Give short fragments ("um, so…") more time; end longer sentences quickly.
      const words = transcript.split(/\s+/).length;
      if (endpointTimer) window.clearTimeout(endpointTimer);
      endpointTimer = window.setTimeout(() => recognition.stop(), words <= 2 ? 750 : 450);
    };
    recognition.onerror = (event) => {
      if (endpointTimer) window.clearTimeout(endpointTimer);
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      // Aborted by us (mute, end call): nothing to report.
      if (event.error === "aborted") return;
      // Some phones cannot share the microphone with the level meter; give it up and retry.
      if (autoSend && event.error === "audio-capture" && micMeterActive()) {
        stopMicMeter();
        window.setTimeout(() => startListening(true), 160);
        return;
      }
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
      if (recognitionRef.current === recognition) recognitionRef.current = null;
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
      if (autoSend) {
        setVisitorCaption("");
        setVoiceStatus("listening");
      }
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
    // Resume audio synchronously inside the click so browsers allow playback.
    void resumeAudio();
    setError("");
    setSoundEnabled(true);
    voiceCallActiveRef.current = true;
    setVoiceCallActive(true);
    micMutedRef.current = false;
    setMicMuted(false);
    setVisitorCaption("");
    setCallStartedAt(Date.now());
    setVoiceStatus("connecting");
    const turn = ++turnRef.current;
    void startMicMeter();
    window.setTimeout(() => playCue("connect"), 60);
    const greeting = soul.personality.greeting.trim();
    const opening =
      soul.voice.provider === "supertonic"
        ? fetchSupertonicAudio(cleanForSpeech(greeting), {
            voice: (soul.voice.profileId || "F1") as SupertonicVoiceId,
            language: callLanguage,
            speed: soul.voice.speed,
            qualitySteps: 4,
            soulId: soul.id,
          }).then((blob) => {
            if (!voiceCallActiveRef.current || turn !== turnRef.current) return;
            setVoiceStatus("speaking");
            return playSupertonicAudio(blob);
          })
        : (setVoiceStatus("speaking"), speak(greeting));
    void opening
      .then(() => {
        if (voiceCallActiveRef.current && turn === turnRef.current) startListening(true);
      })
      .catch(() => {
        if (turn !== turnRef.current) return;
        setError("The selected voice is temporarily unavailable. Please try again shortly.");
        stopVoiceCall();
      });
  }

  function stopVoiceCall() {
    const wasActive = voiceCallActiveRef.current;
    voiceCallActiveRef.current = false;
    turnRef.current += 1;
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    stopSupertonic();
    if (wasActive) playCue("disconnect");
    stopMicMeter();
    setListening(false);
    setVoiceCallActive(false);
    setCallStartedAt(null);
    setVisitorCaption("");
    setVoiceStatus("idle");
  }

  /** Stop the agent mid-reply and hand the floor back to the visitor. */
  function interruptAgent() {
    if (!voiceCallActiveRef.current) return;
    const status = voiceStatusRef.current;
    if (status !== "speaking" && status !== "thinking") return;
    turnRef.current += 1;
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    stopSupertonic();
    sendingRef.current = false;
    setSending(false);
    if (micMutedRef.current) {
      setVoiceStatus("listening");
      return;
    }
    startListening(true);
  }

  function toggleMute() {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
    if (next) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    if (voiceCallActiveRef.current && voiceStatusRef.current === "listening") {
      startListening(true);
    }
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
    const agentName = soul.personality.name || "Assistant";
    const accent = /^#[0-9a-f]{3,8}$/i.test(soul.appearance.accent)
      ? soul.appearance.accent
      : "#0b0b0c";
    const accentText = contrastText(accent);
    const palette = orbPalette(soul.appearance.orbStyle, accent);
    const isDarkPanel = theme === "dark";
    const orbState =
      voiceCallActive && !(micMuted && voiceStatus === "listening") ? voiceStatus : "idle";
    const statusLabel = !voiceCallActive
      ? `Talk to ${agentName}`
      : voiceStatus === "connecting"
        ? "Connecting…"
        : voiceStatus === "listening"
          ? micMuted
            ? "You’re muted"
            : "Listening…"
          : voiceStatus === "thinking"
            ? "Thinking…"
            : voiceStatus === "speaking"
              ? `${agentName} is speaking`
              : "Your turn";
    const statusHint = !voiceCallActive
      ? soul.appearance.welcomeLabel || "Ask anything about this website, out loud."
      : voiceStatus === "speaking"
        ? soul.voice.interruptions === false
          ? "Tap the orb to interrupt."
          : "Just start talking to interrupt."
        : voiceStatus === "listening"
          ? micMuted
            ? "Unmute to keep talking."
            : "Go ahead, I’m listening."
          : voiceStatus === "thinking"
            ? "Finding the answer on this website."
            : "";
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    const suggestions = soul.knowledge.pages
      .slice(1)
      .map((page) => page.title.split(/[|–—]/)[0]?.trim())
      .filter((title): title is string => Boolean(title) && title.length <= 40)
      .slice(0, 3);
    const prompts: Array<{ label: string; text: string }> = suggestions.length
      ? suggestions.map((title) => ({ label: title, text: `Tell me about ${title.toLowerCase()}` }))
      : ["What do you offer?", "How does it work?", "How much does it cost?"].map((text) => ({
          label: text,
          text,
        }));
    const elapsed = callStartedAt
      ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
      : 0;
    const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

    const panelTone = isDarkPanel
      ? "border-white/10 bg-[#0f0f11] text-white"
      : isGlass
        ? "border-white/60 bg-white/85 text-[#0b0b0c] backdrop-blur-2xl"
        : "border-[#ebebe8] bg-white text-[#0b0b0c]";
    const surface = isDarkPanel ? "bg-white/[0.07]" : "bg-[#f4f4f2]";
    const muted = isDarkPanel ? "text-white/55" : "text-[#6f6e69]";
    const iconButton = `flex h-10 w-10 items-center justify-center rounded-full transition ${
      isDarkPanel
        ? "text-white/70 hover:bg-white/10 hover:text-white"
        : "text-[#5f5e5a] hover:bg-[#f1f1ef] hover:text-[#0b0b0c]"
    }`;
    const chip = `shrink-0 rounded-full border px-3.5 py-2 text-[13px] transition ${
      isDarkPanel
        ? "border-white/12 text-white/75 hover:bg-white/10"
        : "border-[#e7e7e4] bg-white text-[#3d3d3a] hover:border-[#d6d6d2] hover:bg-[#fafaf9]"
    }`;

    const sendText = (text: string) => {
      if (voicePanelView === "voice") showPanelView("chat");
      void sendMessage(text);
    };

    return (
      <div
        ref={panelRef}
        className={`relative flex flex-col overflow-hidden border shadow-[0_24px_80px_-12px_rgba(0,0,0,.28)] ${panelTone} ${
          isFullscreen
            ? "h-screen rounded-none"
            : `rounded-[28px] ${fill ? "h-full min-h-[440px]" : compact ? "h-[620px]" : "h-[680px]"}`
        }`}
      >
        <header className="relative z-20 flex h-16 shrink-0 items-center gap-2 px-3">
          <span
            aria-hidden="true"
            className="ml-1 h-8 w-8 shrink-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${palette[2]} 0%, transparent 45%), radial-gradient(circle at 72% 72%, ${palette[1]} 0%, transparent 60%), ${palette[0]}`,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-5">{agentName}</p>
            <p className={`flex items-center gap-1.5 truncate text-xs ${muted}`}>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${voiceCallActive ? "animate-pulse bg-[#22c55e]" : "bg-[#22c55e]"}`}
              />
              {voiceCallActive ? `On a call · ${clock}` : soul.personality.role || "Online"}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setLanguageOpen((current) => !current)}
              className={`${iconButton} w-auto gap-1 px-2.5 text-xs font-medium`}
              aria-expanded={languageOpen}
              aria-label={`Language: ${selectedLanguage.name}`}
            >
              <span className="text-base" aria-hidden="true">
                {countryFlag(selectedLanguage.flag)}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {languageOpen && (
              <div
                className={`absolute right-0 top-11 z-30 max-h-64 w-48 overflow-y-auto rounded-2xl border p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.18)] ${
                  isDarkPanel ? "border-white/10 bg-[#18181b]" : "border-[#ebebe8] bg-white"
                }`}
              >
                {VOICE_LANGUAGES.map((language) => (
                  <button
                    key={language.code}
                    onClick={() => {
                      stopVoiceCall();
                      setCallLanguage(language.code);
                      setLanguageOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                      language.code === callLanguage
                        ? isDarkPanel
                          ? "bg-white/10 font-semibold"
                          : "bg-[#f4f4f2] font-semibold"
                        : isDarkPanel
                          ? "hover:bg-white/5"
                          : "hover:bg-[#fafaf9]"
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
            className={iconButton}
            aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-[17px] w-[17px]" />
            ) : (
              <Maximize2 className="h-[17px] w-[17px]" />
            )}
          </button>
          {onClose && (
            <button
              onClick={() => {
                stopVoiceCall();
                onClose();
              }}
              className={iconButton}
              aria-label="Close conversation"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </header>

        <div className="relative z-10 flex shrink-0 justify-center pb-1">
          <div className={`flex rounded-full p-1 ${surface}`} role="tablist">
            {(["voice", "chat"] as const).map((view) => (
              <button
                key={view}
                role="tab"
                aria-selected={voicePanelView === view}
                onClick={() => showPanelView(view)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition ${
                  voicePanelView === view
                    ? isDarkPanel
                      ? "bg-white text-[#0b0b0c]"
                      : "bg-white text-[#0b0b0c] shadow-[0_1px_3px_rgba(0,0,0,.1)]"
                    : muted
                }`}
              >
                {view === "voice" ? (
                  <Phone className="h-3.5 w-3.5" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                {view === "voice" ? "Call" : "Chat"}
              </button>
            ))}
          </div>
        </div>

        {voicePanelView === "voice" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 text-center">
            <div className="flex min-h-[250px] flex-1 flex-col items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  if (!voiceCallActive) startVoiceCall();
                  else if (voiceStatus === "speaking" || voiceStatus === "thinking")
                    interruptAgent();
                }}
                className="relative rounded-full outline-none transition-transform duration-500 focus-visible:ring-4 focus-visible:ring-black/10 active:scale-[0.97]"
                aria-label={
                  voiceCallActive
                    ? voiceStatus === "speaking"
                      ? "Interrupt"
                      : statusLabel
                    : `Start a voice call with ${agentName}`
                }
              >
                <VoiceOrb
                  palette={palette}
                  state={orbState}
                  size={isFullscreen ? 280 : 220}
                  getLevel={() =>
                    voiceStatusRef.current === "listening"
                      ? micMutedRef.current
                        ? 0
                        : inputLevel()
                      : voiceStatusRef.current === "speaking"
                        ? outputLevel()
                        : 0
                  }
                />
                {!voiceCallActive && (
                  <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0b0b0c] shadow-[0_10px_30px_rgba(0,0,0,.18)] backdrop-blur transition hover:scale-105">
                    <Phone className="h-5 w-5 fill-current" />
                  </span>
                )}
              </button>
              <h3
                key={statusLabel}
                className="mt-2 animate-in fade-in text-[17px] font-semibold tracking-[-0.01em] duration-300"
              >
                {statusLabel}
              </h3>
              {statusHint && (
                <p className={`mt-1 max-w-[280px] text-[13px] leading-5 ${muted}`}>{statusHint}</p>
              )}
            </div>

            {voiceCallActive ? (
              <div className="mb-3 w-full max-w-[340px] space-y-2 text-left" aria-live="polite">
                {visitorCaption && (
                  <p
                    className={`animate-in fade-in line-clamp-2 text-[13px] leading-5 duration-200 ${muted}`}
                  >
                    <span className="font-semibold">You · </span>
                    {visitorCaption}
                  </p>
                )}
                {lastAssistant && voiceStatus !== "listening" && (
                  <p
                    key={lastAssistant.id}
                    className={`animate-in fade-in slide-in-from-bottom-1 line-clamp-3 rounded-2xl px-4 py-3 text-[14px] leading-6 duration-300 ${surface}`}
                  >
                    {lastAssistant.content || "…"}
                  </p>
                )}
                {error && (
                  <p className="rounded-xl bg-[#fff1f4] px-3 py-2 text-xs text-[#b3263f]">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div className="mb-3 w-full">
                {error && (
                  <p className="mb-3 rounded-xl bg-[#fff1f4] px-3 py-2 text-xs text-[#b3263f]">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2 px-1">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => sendText(prompt.text)}
                      className={chip}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex animate-in fade-in slide-in-from-bottom-1 duration-300 ${message.role === "visitor" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[86%]">
                  <div
                    className={`rounded-[20px] px-4 py-2.5 text-[14px] leading-6 ${
                      message.role === "visitor" ? "rounded-br-md" : `rounded-bl-md ${surface}`
                    }`}
                    style={
                      message.role === "visitor"
                        ? { background: accent, color: accentText }
                        : undefined
                    }
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {!!message.citations?.length && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {message.citations.slice(0, 3).map((citation, index) => (
                        <a
                          key={`${citation.chunkId}-${index}`}
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border px-2.5 py-1 text-[11px] transition ${
                            isDarkPanel
                              ? "border-white/12 text-white/60 hover:text-white"
                              : "border-[#e7e7e4] bg-white text-[#6f6e69] hover:text-[#0b0b0c]"
                          }`}
                        >
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span className="truncate">{citation.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex animate-in fade-in justify-start duration-200">
                <div
                  className={`flex items-center gap-1 rounded-[20px] rounded-bl-md px-4 py-3.5 ${surface}`}
                  aria-label={`${agentName} is typing`}
                >
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className={`h-1.5 w-1.5 animate-bounce rounded-full ${isDarkPanel ? "bg-white/60" : "bg-[#8a8a8f]"}`}
                      style={{ animationDelay: `${dot * 140}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {messages.length === 1 && !sending && (
              <div className="flex flex-wrap gap-2 pt-1">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => sendText(prompt.text)}
                    className={chip}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p className="rounded-xl bg-[#fff1f4] px-3 py-2 text-xs text-[#b3263f]">{error}</p>
            )}
          </div>
        )}

        <div className="shrink-0 px-4 pb-4 pt-2">
          {voiceCallActive && voicePanelView === "voice" ? (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={micMuted}
                aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                  micMuted
                    ? "bg-[#0b0b0c] text-white"
                    : isDarkPanel
                      ? "bg-white/10 text-white hover:bg-white/15"
                      : "bg-[#f1f1ef] text-[#0b0b0c] hover:bg-[#e9e9e6]"
                }`}
              >
                {micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={stopVoiceCall}
                className="inline-flex h-12 min-w-[132px] items-center justify-center gap-2 rounded-full bg-[#e5484d] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(229,72,77,.6)] transition hover:bg-[#d93d42]"
              >
                <PhoneOff className="h-4 w-4" /> End call
              </button>
              <button
                type="button"
                onClick={() => showPanelView("chat")}
                aria-label="Switch to text chat"
                className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                  isDarkPanel
                    ? "bg-white/10 text-white hover:bg-white/15"
                    : "bg-[#f1f1ef] text-[#0b0b0c] hover:bg-[#e9e9e6]"
                }`}
              >
                <MessageCircle className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              {voicePanelView === "voice" && (
                <button
                  type="button"
                  onClick={startVoiceCall}
                  className="mb-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-[0_10px_24px_-10px_rgba(0,0,0,.35)] transition hover:brightness-105 active:scale-[0.99]"
                  style={{ background: accent, color: accentText }}
                >
                  <Phone className="h-4 w-4 fill-current" /> Start voice call
                </button>
              )}
              <div
                className={`flex items-end gap-1.5 rounded-[22px] border p-1.5 pl-4 transition focus-within:ring-4 ${
                  isDarkPanel
                    ? "border-white/12 bg-white/[0.04] focus-within:ring-white/5"
                    : "border-[#e2e2df] bg-white focus-within:border-[#cfcfcb] focus-within:ring-black/[0.04]"
                }`}
              >
                <textarea
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (value.trim()) sendText(value);
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${agentName}…`}
                  className={`max-h-24 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none ${
                    isDarkPanel ? "placeholder:text-white/35" : "placeholder:text-[#9a9a9e]"
                  }`}
                />
                {voicePanelView === "chat" && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    aria-label={listening ? "Stop dictation" : "Dictate a message"}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                      listening
                        ? "animate-pulse bg-[#e5484d] text-white"
                        : isDarkPanel
                          ? "text-white/60 hover:bg-white/10"
                          : "text-[#6f6e69] hover:bg-[#f1f1ef]"
                    }`}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={() => value.trim() && sendText(value)}
                  disabled={!value.trim() || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-30"
                  style={{ background: accent, color: accentText }}
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
          <p
            className={`mt-2 text-center text-[10px] ${isDarkPanel ? "text-white/35" : "text-[#a3a29d]"}`}
          >
            {voiceCallActive
              ? "Your microphone is only used during the call"
              : "Answers come from this website’s own pages"}
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
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-[#212120]"
            style={{ backgroundColor: soul.appearance.accent }}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#212120] text-white hover:bg-black disabled:opacity-30"
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
