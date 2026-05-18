import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const Env = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  SYNTHESIA_API_KEY: z.string().min(1).optional(),
  SYNTHESIA_DEFAULT_AVATAR: z.string().default("anna_costume1_cameraA"),
  SYNTHESIA_DEFAULT_BACKGROUND: z.string().default("off_white"),
  SYNTHESIA_TEST_MODE: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),

  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),

  BOX_DEVELOPER_TOKEN: z.string().optional(),
  BOX_DESTINATION_FOLDER_ID: z.string().default("0"),

  WORK_DIR: z.string().default("./work"),
  OUTPUT_DIR: z.string().default("./output"),
});

export type AppConfig = z.infer<typeof Env>;

export const config: AppConfig = Env.parse(process.env);

export function requireKey(name: keyof AppConfig): string {
  const value = config[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env (see .env.example).`,
    );
  }
  return value;
}
