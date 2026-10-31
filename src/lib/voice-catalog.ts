export const supertonicVoices = [
  { id: "F1", name: "Aster", description: "Warm, polished and conversational", gender: "Female" },
  { id: "F2", name: "Luma", description: "Bright, clear and welcoming", gender: "Female" },
  { id: "F3", name: "Nora", description: "Calm, grounded and helpful", gender: "Female" },
  { id: "F4", name: "Sora", description: "Confident, expressive and modern", gender: "Female" },
  { id: "F5", name: "Mira", description: "Soft, thoughtful and reassuring", gender: "Female" },
  { id: "M1", name: "Arlo", description: "Natural, composed and articulate", gender: "Male" },
  { id: "M2", name: "Kian", description: "Friendly, direct and energetic", gender: "Male" },
  { id: "M3", name: "Theo", description: "Deep, steady and authoritative", gender: "Male" },
  { id: "M4", name: "Noah", description: "Relaxed, warm and approachable", gender: "Male" },
  { id: "M5", name: "Ravi", description: "Clear, lively and confident", gender: "Male" },
] as const;

export type SupertonicVoiceId = (typeof supertonicVoices)[number]["id"];

export function neuralVoice(profileId: unknown) {
  return supertonicVoices.find((voice) => voice.id === profileId) ?? supertonicVoices[0];
}
