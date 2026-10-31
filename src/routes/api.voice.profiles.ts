import { createFileRoute } from "@tanstack/react-router";
import { requireWorkspaceUser as requireUser } from "@/lib/server/team-store";
import { supertonicVoices } from "@/lib/voice-catalog";

export const Route = createFileRoute("/api/voice/profiles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUser(request, { section: "voice", write: false });
        } catch (error) {
          return Response.json(
            { error: { message: error instanceof Error ? error.message : "Access denied." } },
            {
              status:
                typeof error === "object" && error && "status" in error
                  ? Number(error.status)
                  : 500,
            },
          );
        }
        return Response.json({ provider: "supertonic", profiles: supertonicVoices });
      },
      POST: async () =>
        Response.json(
          { error: { message: "Choose one of the 10 Neural voices in the voice library." } },
          { status: 410 },
        ),
    },
  },
});
