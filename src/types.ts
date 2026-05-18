import { z } from "zod";

export const SceneKind = z.enum([
  "avatar",
  "screen_capture",
  "broll",
  "title_card",
]);
export type SceneKind = z.infer<typeof SceneKind>;

export const Scene = z.object({
  id: z.string(),
  kind: SceneKind,
  narration: z.string().min(1),
  onScreenText: z.string().optional(),
  assetPath: z.string().optional(),
  durationHintSec: z.number().positive().optional(),
});
export type Scene = z.infer<typeof Scene>;

export const Script = z.object({
  title: z.string(),
  audience: z.string(),
  learningObjectives: z.array(z.string()),
  scenes: z.array(Scene).min(1),
});
export type Script = z.infer<typeof Script>;

export const Outline = z.object({
  title: z.string(),
  audience: z.string(),
  learningObjectives: z.array(z.string()).min(1),
  durationMinutes: z.number().positive().default(3),
  notes: z.string().optional(),
});
export type Outline = z.infer<typeof Outline>;

export interface RenderedSegment {
  sceneId: string;
  videoPath: string;
  audioPath?: string;
}
