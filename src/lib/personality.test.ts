import { expect, it } from "vitest";
import { createSoul, normalizeWorkspace } from "./soul";
import { personalitySchema, conversationStyleInstructions } from "./personality";

it("accepts existing assistants and retains new preferences through workspace and API validation", () => {
  const soul = createSoul("https://merchant.example");
  expect(personalitySchema.safeParse(soul.personality).success).toBe(true);
  expect(conversationStyleInstructions(undefined)).toEqual([]);
  soul.personality.conversationStyle = {
    length: "brief",
    language: "hi",
    emojis: "none",
    nextStep: "direct",
  };
  const workspace = normalizeWorkspace({
    id: soul.workspaceId,
    name: "Test",
    activeSoulId: soul.id,
    souls: [soul],
  });
  expect(personalitySchema.parse(workspace.souls[0].personality).conversationStyle).toEqual(
    soul.personality.conversationStyle,
  );
  expect(
    personalitySchema.safeParse({ ...soul.personality, conversationStyle: { language: "made-up" } })
      .success,
  ).toBe(false);
});
