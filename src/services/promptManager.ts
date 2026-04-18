import { supabase } from "../supabase";
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "./gemini";

export async function getSystemPrompt(): Promise<string> {
  try {
    const result = await Promise.race([
      supabase
        .from("settings")
        .select("value")
        .eq("key", "system_prompt")
        .single(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase timeout")), 10000)
      ),
    ]);

    const { data, error } = result as any;
    if (error || !data) return DEFAULT_SYSTEM_PROMPT;
    return data.value;
  } catch (error) {
    console.error("Error fetching system prompt, using default:", error);
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
