import { supabase } from "../supabase";
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "./gemini";

// Cache prompt for 5 minutes to avoid repeated Supabase calls
let cachedPrompt: string | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSystemPrompt(): Promise<string> {
  // Return cached version if fresh
  if (cachedPrompt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPrompt;
  }

  try {
    const result = await Promise.race([
      supabase
        .from("settings")
        .select("value")
        .eq("key", "system_prompt")
        .single(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase timeout")), 3000)
      ),
    ]);

    const { data, error } = result as any;
    if (error || !data) {
      // Cache default to avoid repeated timeout attempts
      cachedPrompt = DEFAULT_SYSTEM_PROMPT;
      cachedAt = Date.now();
      return DEFAULT_SYSTEM_PROMPT;
    }
    cachedPrompt = data.value;
    cachedAt = Date.now();
    return data.value;
  } catch (error) {
    console.warn("Using default system prompt:", (error as Error).message);
    cachedPrompt = DEFAULT_SYSTEM_PROMPT;
    cachedAt = Date.now();
    return DEFAULT_SYSTEM_PROMPT;
  }
}

export async function updateSystemPrompt(newPrompt: string): Promise<void> {
  const { error } = await supabase.from("settings").upsert({
    key: "system_prompt",
    value: newPrompt,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Error updating system prompt:", error);
    throw new Error("Failed to update system prompt in database.");
  }
}
