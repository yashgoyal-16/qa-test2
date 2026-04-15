import { supabase } from "../supabase";
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "./gemini";

export async function getSystemPrompt(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "system_prompt")
      .single();

    if (error || !data) {
      return DEFAULT_SYSTEM_PROMPT;
    }

    return data.value;
  } catch (error) {
    console.error("Error fetching system prompt:", error);
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
