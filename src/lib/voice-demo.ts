import { NEURAL_QUALITY_STEPS } from "./voice-catalog";

// Public marketing demos have a separate, bounded allowance; customer voice
// calls still require an account or a signed widget session and plan allowance.
export function isPublicVoiceDemo(
  request: Request,
  input: { soulId?: string; text: string; qualitySteps?: number },
) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin);
  const allowed =
    origin === "https://obseri.com" ||
    origin === "https://www.obseri.com" ||
    (local && origin === requestOrigin);
  return (
    allowed &&
    input.soulId === "obseri-landing-voice-demo" &&
    input.text.length <= 400 &&
    (input.qualitySteps ?? NEURAL_QUALITY_STEPS) <= NEURAL_QUALITY_STEPS
  );
}
