import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from "./gemini";

export async function getSystemPrompt(): Promise<string> {
  try {
    const docRef = doc(db, "settings", "system_prompt");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists() && docSnap.data().prompt) {
      return docSnap.data().prompt;
    } else {
      // Initialize with default if it doesn't exist
      await setDoc(docRef, { prompt: DEFAULT_SYSTEM_PROMPT });
      return DEFAULT_SYSTEM_PROMPT;
    }
  } catch (error) {
    console.error("Error fetching system prompt from Firestore:", error);
    return DEFAULT_SYSTEM_PROMPT; // Fallback to hardcoded prompt
  }
}

export async function updateSystemPrompt(newPrompt: string): Promise<void> {
  try {
    const docRef = doc(db, "settings", "system_prompt");
    await setDoc(docRef, { prompt: newPrompt }, { merge: true });
  } catch (error) {
    console.error("Error updating system prompt:", error);
    throw new Error("Failed to update system prompt in database.");
  }
}
