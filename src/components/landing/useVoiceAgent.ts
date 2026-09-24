import { useEffect, useRef, useState } from "react";
import { speakSupertonic, stopSupertonic, type SupertonicVoiceId } from "@/lib/supertonic";

export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

export type VoiceAgent = {
  id: string;
  name: string;
  role: string;
  tone: string;
  greeting: string;
  colors: [string, string, string];
  rate: number;
  pitch: number;
  voiceHints: string[];
  fallback: string;
  neuralVoice: SupertonicVoiceId;
};

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type VoiceRecognitionEvent = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

type LandingVoiceMessage = {
  role: "visitor" | "assistant";
  content: string;
};

function chooseHumanBrowserVoice(agent: VoiceAgent, voices: SpeechSynthesisVoice[]) {
  const sharedNaturalVoices = [
    "aria",
    "jenny",
    "guy",
    "ava",
    "andrew",
    "emma",
    "brian",
    "roger",
    "michelle",
    "sonia",
    "samantha",
  ];
  const preferredNames = [...agent.voiceHints, ...sharedNaturalVoices];
  const legacyVoices = ["david", "zira", "mark", "hazel", "desktop", "espeak"];

  return voices
    .map((voice) => {
      const name = voice.name.toLowerCase();
      const preferredIndex = preferredNames.findIndex((candidate) => name.includes(candidate));
      let score = preferredIndex >= 0 ? 180 - preferredIndex * 8 : 0;
      if (/natural|neural|online|premium|enhanced/.test(name)) score += 90;
      if (/google|microsoft|apple/.test(name)) score += 12;
      if (!voice.localService) score += 18;
      if (legacyVoices.some((legacy) => name.includes(legacy))) score -= 140;
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.voice;
}

export const VOICE_AGENTS: VoiceAgent[] = [
  {
    id: "ona",
    name: "Ona",
    role: "Lead qualification",
    tone: "Warm · persuasive",
    greeting: "Hi, I’m Ona from Obseri. What are you hoping to improve on your website today?",
    colors: ["#ff6f91", "#b39cff", "#ffd3dc"],
    rate: 0.98,
    pitch: 1,
    voiceHints: ["aria", "ava", "emma", "samantha"],
    fallback:
      "I can learn what a visitor needs, recommend the right next step, and capture a qualified lead.",
    neuralVoice: "F1",
  },
  {
    id: "arlo",
    name: "Arlo",
    role: "Product guidance",
    tone: "Clear · confident",
    greeting: "Hi, I’m Arlo. Tell me what you’re looking for and I’ll help you find it.",
    colors: ["#ff8a62", "#ffc178", "#e98594"],
    rate: 0.96,
    pitch: 1,
    voiceHints: ["guy", "andrew", "brian", "roger", "eric"],
    fallback:
      "Tell me what you are trying to accomplish and I will guide you to the most relevant product information.",
    neuralVoice: "M1",
  },
  {
    id: "mira",
    name: "Mira",
    role: "Customer support",
    tone: "Calm · helpful",
    greeting: "Hi, I’m Mira. How can I help you today?",
    colors: ["#8d7bd1", "#d6b4ec", "#ffb7c8"],
    rate: 0.94,
    pitch: 1,
    voiceHints: ["jenny", "michelle", "sonia", "aria", "ava"],
    fallback:
      "I can answer common support questions, cite the right documentation, and escalate when human help is needed.",
    neuralVoice: "F3",
  },
];

/** Drives a live browser voice call with one of the landing-page agents. */
export function useVoiceAgent() {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState(
    "Choose a voice and ask about pricing, product, or support.",
  );
  const [reply, setReply] = useState("Every voice answers from the same website knowledge.");
  const [notice, setNotice] = useState("Live browser voice · nothing is uploaded");
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const conversationActiveRef = useRef(false);
  const speechTurnRef = useRef(0);
  const voiceMessagesRef = useRef<LandingVoiceMessage[]>([]);
  const voiceRequestRef = useRef<AbortController | null>(null);
  const browserVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      browserVoicesRef.current = window.speechSynthesis?.getVoices() ?? [];
    };
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);

    return () => {
      conversationActiveRef.current = false;
      voiceRequestRef.current?.abort();
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const buildAnswer = (agent: VoiceAgent, spoken: string) => {
    const question = spoken.toLowerCase();

    if (question.includes("price") || question.includes("plan") || question.includes("cost")) {
      return agent.id === "ona"
        ? "I can compare the plans, qualify what your team needs, and guide you to the right option."
        : "The pricing page is the best source. I can explain each plan and cite the exact details.";
    }

    if (
      question.includes("demo") ||
      question.includes("book") ||
      question.includes("call") ||
      question.includes("contact")
    ) {
      return "Absolutely. I can collect the visitor's details and send a signed lead event to your sales workflow.";
    }

    if (question.includes("secure") || question.includes("privacy") || question.includes("data")) {
      return "Answers stay grounded in approved sources, workspace access is scoped, and integration events are signed.";
    }

    return agent.fallback;
  };

  const requestAnswer = async (agent: VoiceAgent, spoken: string) => {
    const visitorMessage: LandingVoiceMessage = { role: "visitor", content: spoken };
    const nextMessages = [...voiceMessagesRef.current, visitorMessage].slice(-10);
    voiceMessagesRef.current = nextMessages;
    const controller = new AbortController();
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          soulId: "obseri-landing-voice-demo",
          personality: {
            name: agent.name,
            role: agent.role + " voice agent for Obseri",
            purpose:
              "Help website owners understand Obseri and move toward the most useful next step.",
            tone: agent.id === "mira" ? "calm" : agent.id === "arlo" ? "precise" : "warm",
            traits: agent.id === "ona" ? ["curious", "concise", "helpful"] : ["clear", "concise"],
            greeting: agent.greeting,
            instructions:
              "Speak naturally. Answer directly, remember the conversation, and ask one short follow-up question when it helps.",
            guardrails: [
              "Do not invent product capabilities or pricing.",
              "Do not claim a lead was submitted unless the visitor explicitly provided details.",
            ],
            unknownResponse:
              "I don’t have that detail in this demo, but I can help you understand how Obseri works.",
            leadCapture: true,
            escalationEmail: "flamki@obseri.com",
          },
          chunks: [
            {
              id: "landing-product",
              pageUrl: "https://obseri.com/",
              pageTitle: "Obseri voice and chat agents",
              text: "Obseri turns a website into a voice and chat agent trained on the website’s approved content. It helps visitors get answers, understand products, qualify their needs, and become leads without searching page by page.",
              order: 0,
              tokenEstimate: 44,
            },
            {
              id: "landing-knowledge",
              pageUrl: "https://obseri.com/ai-chatbot-trained-on-your-website",
              pageTitle: "Grounded website knowledge",
              text: "Obseri crawls website pages, keeps visible source citations, detects content changes, refreshes knowledge, and lets teams test retrieval before publishing. Answers stay grounded in sources the workspace controls.",
              order: 1,
              tokenEstimate: 42,
            },
            {
              id: "landing-voice",
              pageUrl: "https://obseri.com/ai-voice-agent-for-website",
              pageTitle: "Website voice agent",
              text: "Visitors can speak naturally or use text chat. The agent can answer product questions, identify buying intent, collect contact details with consent, and hand conversations to a human when needed.",
              order: 2,
              tokenEstimate: 38,
            },
            {
              id: "landing-integrations",
              pageUrl: "https://obseri.com/#trust",
              pageTitle: "Integration and trust",
              text: "Each website has a scoped workspace and publish key. Obseri supports signed webhook events for approved integrations. It does not promise a specific price in this demo; plan details should be confirmed with the Obseri team at flamki@obseri.com.",
              order: 3,
              tokenEstimate: 47,
            },
          ],
          messages: nextMessages,
        }),
      });
      const data = (await response.json()) as { answer?: string };
      if (!response.ok || !data.answer) throw new Error("Conversation request failed");

      const answer = data.answer.trim();
      voiceMessagesRef.current = [
        ...nextMessages,
        { role: "assistant", content: answer } as LandingVoiceMessage,
      ].slice(-10);
      return answer;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const fallback = buildAnswer(agent, spoken);
      voiceMessagesRef.current = [
        ...nextMessages,
        { role: "assistant", content: fallback } as LandingVoiceMessage,
      ].slice(-10);
      return fallback;
    } finally {
      if (voiceRequestRef.current === controller) voiceRequestRef.current = null;
    }
  };

  const speakReply = (
    agent: VoiceAgent,
    answer: string,
    resumeListening = true,
    speakingNotice = agent.name + " is answering",
  ) => {
    const speechTurn = ++speechTurnRef.current;
    const finishTurn = () => {
      if (speechTurn !== speechTurnRef.current) return;
      if (resumeListening && conversationActiveRef.current) {
        setNotice("Your turn — speak naturally");
        window.setTimeout(() => beginListening(agent), 140);
        return;
      }
      setVoiceStatus("idle");
      setNotice("Call ended");
    };

    setVoiceStatus("speaking");
    setNotice(speakingNotice);
    void speakSupertonic(answer, {
      voice: agent.neuralVoice,
      language: "en",
      speed: agent.rate,
      qualitySteps: 4,
    })
      .then(finishTurn)
      .catch(() => speakBrowserReply());

    function speakBrowserReply() {
      if (!("speechSynthesis" in window)) {
        conversationActiveRef.current = false;
        setVoiceStatus("error");
        setNotice("Voice playback is not available in this browser.");
        return;
      }

      const utterance = new SpeechSynthesisUtterance(answer);
      const availableVoices = (
        browserVoicesRef.current.length
          ? browserVoicesRef.current
          : window.speechSynthesis.getVoices()
      ).filter((voice) => voice.lang.toLowerCase().startsWith("en"));
      const preferredVoice = chooseHumanBrowserVoice(agent, availableVoices);

      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      }
      utterance.rate = agent.rate;
      utterance.pitch = agent.pitch;
      utterance.onstart = () => {
        setVoiceStatus("speaking");
        setNotice(speakingNotice);
      };
      utterance.onend = () => {
        finishTurn();
      };
      utterance.onerror = () => {
        if (speechTurn !== speechTurnRef.current) return;
        conversationActiveRef.current = false;
        setVoiceStatus("error");
        setNotice("Voice playback stopped. Try again.");
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  function beginListening(agent: VoiceAgent) {
    if (!conversationActiveRef.current) return;

    const recognitionWindow = window as typeof window & {
      SpeechRecognition?: BrowserRecognitionConstructor;
      webkitSpeechRecognition?: BrowserRecognitionConstructor;
    };
    const Recognition =
      recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;

    if (!Recognition) {
      conversationActiveRef.current = false;
      setVoiceStatus("error");
      setNotice("Live microphone conversation is not available in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    let receivedResult = false;
    let fatalError = false;

    setVoiceStatus("listening");
    setTranscript("Listening…");
    setNotice("Your turn — speak naturally");

    recognition.onresult = async (event) => {
      if (!conversationActiveRef.current) return;

      receivedResult = true;
      const spoken = event.results[0]?.[0]?.transcript?.trim();

      if (!spoken) {
        setNotice("I didn’t catch that — keep talking.");
        return;
      }

      setTranscript(spoken);
      setVoiceStatus("thinking");
      setNotice("Finding the best grounded answer");

      try {
        const answer = await requestAnswer(agent, spoken);
        if (!conversationActiveRef.current) return;
        setReply(answer);
        speakReply(agent, answer);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          conversationActiveRef.current = false;
          setVoiceStatus("error");
          setNotice("The conversation paused. Tap to reconnect.");
        }
      }
    };

    recognition.onerror = (event) => {
      if (!conversationActiveRef.current) return;

      if (event.error === "no-speech") {
        setVoiceStatus("listening");
        setNotice("Still listening — ask anything.");
        return;
      }

      fatalError = true;
      conversationActiveRef.current = false;
      setVoiceStatus("error");
      setNotice(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Allow microphone access to start talking."
          : "The microphone stopped. Tap to reconnect.",
      );
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;

      if (!receivedResult && !fatalError && conversationActiveRef.current) {
        window.setTimeout(() => beginListening(agent), 300);
      }
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      conversationActiveRef.current = false;
      setVoiceStatus("error");
      setNotice("The microphone could not start. Tap and try again.");
    }
  }

  const stopConversation = () => {
    conversationActiveRef.current = false;
    speechTurnRef.current += 1;
    voiceRequestRef.current?.abort();
    voiceRequestRef.current = null;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    stopSupertonic();
    setVoiceStatus("idle");
    setNotice("Conversation stopped");
  };

  const startConversation = (agent: VoiceAgent) => {
    if (activeAgent === agent.id && conversationActiveRef.current) {
      stopConversation();
      return;
    }

    conversationActiveRef.current = false;
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    stopSupertonic();
    setActiveAgent(agent.id);
    setVoiceStatus("thinking");
    setTranscript("Call connected");
    setReply(agent.greeting);
    setNotice("Connecting to " + agent.name);
    voiceMessagesRef.current = [{ role: "assistant", content: agent.greeting }];
    conversationActiveRef.current = true;
    speakReply(agent, agent.greeting, true, agent.name + " is greeting you");
  };

  const selectedAgent = VOICE_AGENTS.find((agent) => agent.id === activeAgent);

  return {
    activeAgent,
    selectedAgent,
    voiceStatus,
    transcript,
    reply,
    notice,
    startConversation,
    stopConversation,
  };
}
