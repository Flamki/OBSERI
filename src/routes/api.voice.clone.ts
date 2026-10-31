import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice/clone")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          {
            error: {
              message:
                "Custom voices are no longer available. Choose a Neural voice from the library.",
            },
          },
          { status: 410 },
        ),
    },
  },
});
