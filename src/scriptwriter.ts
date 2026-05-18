import Anthropic from "@anthropic-ai/sdk";
import { config, requireKey } from "./config.js";
import { Outline, Script, type Script as ScriptT } from "./types.js";

const SYSTEM = `You are an instructional designer who writes training-video scripts.
Output a JSON object matching this TypeScript type exactly — no prose, no markdown fence:

type Script = {
  title: string;
  audience: string;
  learningObjectives: string[];
  scenes: Array<{
    id: string;                                  // kebab-case, unique
    kind: "avatar" | "screen_capture" | "broll" | "title_card";
    narration: string;                           // spoken text, 1-3 sentences per scene
    onScreenText?: string;                       // optional caption/lower-third
    durationHintSec?: number;                    // 8-25s typical
  }>;
};

Rules:
- Open with a title_card or avatar intro that hooks the learner.
- Use avatar scenes for explanations of concepts.
- Use screen_capture scenes when the learner needs to see software/UI — the user records these separately, you just write narration that pairs with them.
- Use broll scenes sparingly to break monotony.
- End with an avatar recap covering the learning objectives.
- Narration must be conversational, not academic. Read it aloud — if it sounds stiff, rewrite.`;

export async function writeScript(outline: Outline): Promise<ScriptT> {
  const parsed = Outline.parse(outline);
  const client = new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") });

  const userPrompt = `Write a ~${parsed.durationMinutes}-minute training video script.

Title: ${parsed.title}
Audience: ${parsed.audience}
Learning objectives:
${parsed.learningObjectives.map((o) => `- ${o}`).join("\n")}
${parsed.notes ? `\nAdditional notes:\n${parsed.notes}` : ""}

Return JSON only.`;

  const response = await client.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const raw = stripCodeFence(textBlock.text);
  const json = JSON.parse(raw);
  return Script.parse(json);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*\n?/, "");
    return withoutOpen.replace(/\n?```\s*$/, "");
  }
  return trimmed;
}
