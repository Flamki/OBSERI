import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnvironment } from "@/lib/runtime-env";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/voice/clone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > MAX_AUDIO_BYTES + 100_000) return jsonError("Audio sample is too large.", 413);
        const form = await request.formData();
        const audio = form.get("audio");
        const name = String(form.get("name") ?? "").trim();
        const transcript = String(form.get("transcript") ?? "").trim();
        const consent = String(form.get("consent") ?? "") === "true";
        const rightsBasis = String(form.get("rightsBasis") ?? "");
        if (!consent || !["self", "permission", "licensed"].includes(rightsBasis)) {
          return jsonError("Voice ownership or explicit permission must be confirmed.", 400);
        }
        if (
          !(audio instanceof File) ||
          !audio.type.startsWith("audio/") ||
          audio.size > MAX_AUDIO_BYTES
        ) {
          return jsonError("Upload a supported audio sample up to 20 MB.", 400);
        }
        if (!name || !transcript || transcript.length > 1_000) {
          return jsonError("Voice name and an accurate sample transcript are required.", 400);
        }
        const baseUrl = getRuntimeEnvironment().OBSERI_VOICEBOX_URL?.replace(/\/$/, "");
        if (!baseUrl) return jsonError("Voicebox is not configured.", 503);

        let profileId = "";
        try {
          const profileResponse = await fetch(`${baseUrl}/profiles`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name,
              description: `Created through Obseri with ${rightsBasis} consent recorded.`,
              language: "en",
              voice_type: "cloned",
              default_engine: "qwen",
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!profileResponse.ok) throw new Error(await profileResponse.text());
          const profile = (await profileResponse.json()) as { id: string };
          profileId = profile.id;

          const sampleForm = new FormData();
          sampleForm.append("file", audio, audio.name || "voice-sample.webm");
          sampleForm.append("reference_text", transcript);
          const sampleResponse = await fetch(`${baseUrl}/profiles/${profileId}/samples`, {
            method: "POST",
            body: sampleForm,
            signal: AbortSignal.timeout(120_000),
          });
          if (!sampleResponse.ok) throw new Error(await sampleResponse.text());
          return Response.json({
            profile: { ...profile, name },
            consent: { rightsBasis, recordedAt: new Date().toISOString() },
          });
        } catch (error) {
          if (profileId) {
            await fetch(`${baseUrl}/profiles/${profileId}`, { method: "DELETE" }).catch(
              () => undefined,
            );
          }
          return jsonError(error instanceof Error ? error.message : "Voice cloning failed.", 502);
        }
      },
    },
  },
});

function jsonError(message: string, status: number) {
  return Response.json(
    { error: { message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
