import { GoogleGenAI, Type, FunctionDeclaration, Content } from "@google/genai";
import { supabase } from "../supabase";
import { getSystemPrompt, updateSystemPrompt } from "./promptManager";

const apiKey = process.env.GEMINI_API_KEY;
const apiKey2 = process.env.GEMINI_API_KEY2;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const ai2 = apiKey2 ? new GoogleGenAI({ apiKey: apiKey2 }) : null;

const CHAT_MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// Tool declarations
const getReportAndPromptTool: FunctionDeclaration = {
  name: "getReportAndPrompt",
  description: "Fetch a QA report by Call ID to get the transcript, QA result, and the current system prompt.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      callId: {
        type: Type.STRING,
        description: "The Call ID to fetch the report for.",
      },
    },
    required: ["callId"],
  },
};

const updateSystemPromptTool: FunctionDeclaration = {
  name: "updateSystemPrompt",
  description: "Update the main system prompt with new rules or refinements.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      newPrompt: {
        type: Type.STRING,
        description: "The complete, updated system prompt.",
      },
    },
    required: ["newPrompt"],
  },
};

const getTodayStatsTool: FunctionDeclaration = {
  name: "getTodayStats",
  description: "Get the number of calls processed today.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const SYSTEM_INSTRUCTION = `You are a QA grading assistant.

## When the user asks about today's stats or activity
1. Use the 'getTodayStats' tool to fetch the number of calls processed today.
2. Report the number to the user.

## When the user gives you a Call ID

1. Use the 'getReportAndPrompt' tool to pull up the call transcript, the score, and the grading rules.
2. Read everything carefully.
3. Ask the user: "I've reviewed the call and the score — how can I help?"

Do not explain the grading. Do not flag issues. Do not suggest what might be wrong. Just wait.

## When the user asks a question or points something out

Answer only what they asked. If they ask why a parameter scored a certain way, explain it. If they ask to see the transcript, show it. Follow their lead.

## When the user asks to change a rule

1. Find the exact rule responsible — quote it word for word.
2. Rewrite only that rule to reflect what the user wants — leave everything else exactly as it is.
3. Show the before and after with a one-line explanation of what changed.
4. Wait for approval before saving.
5. Once approved, use the 'updateSystemPrompt' tool to save.

## Always

- Never lead the user toward a problem they didn't mention.
- Only change what the user explicitly asks to change.
- Never save without clear approval.
- When something is unclear, ask — don't guess.`

let chatHistory: Content[] = [];

export function clearChatHistory() {
  chatHistory = [];
}

async function callChatWithFallback(
  contents: Content[],
  config: any,
): Promise<any> {
  const clients = [ai, ai2].filter(Boolean) as GoogleGenAI[];

  for (const client of clients) {
    for (const model of CHAT_MODELS) {
      try {
        console.log(`[Chat] Trying ${model}...`);
        const response = await client.models.generateContent({
          model,
          contents,
          config,
        });
        console.log(`[Chat] ${model} succeeded.`);
        return response;
      } catch (err) {
        console.warn(`[Chat] ${model} failed:`, err);
      }
    }
  }
  throw new Error("All chat models failed.");
}

export async function sendMessage(message: string, onUpdate: (msg: ChatMessage) => void): Promise<void> {
  if (!ai) throw new Error("GEMINI_API_KEY is missing.");

  chatHistory.push({ role: "user", parts: [{ text: message }] });

  const chatConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: [{ functionDeclarations: [getReportAndPromptTool, updateSystemPromptTool, getTodayStatsTool] }],
    temperature: 0.2,
  };

  try {
    let response = await callChatWithFallback(chatHistory, chatConfig);

    // Handle function calls
    while (response.functionCalls && response.functionCalls.length > 0) {
      const content = response.candidates?.[0]?.content;
      if (!content) break;

      chatHistory.push(content);

      const functionResponses = [];

      for (const call of response.functionCalls) {
        if (call.name === "getReportAndPrompt") {
          const callId = call.args.callId as string;
          onUpdate({ role: "model", text: `*Fetching report for Call ID: ${callId}...*` });

          const { data } = await supabase
            .from("reports")
            .select("*")
            .eq("call_id", callId)
            .limit(1)
            .single();

          const currentPrompt = await getSystemPrompt();

          const toolResult = {
            reportFound: !!data,
            transcript: data?.transcript || "No transcript found",
            qaResult: data ? {
              overall_result: data.overall_result,
              weighted_score: data.weighted_score,
              scores: data.scores,
              remarks: data.remarks,
            } : null,
            currentSystemPrompt: currentPrompt,
          };

          functionResponses.push({
            functionResponse: { name: call.name, response: toolResult },
          });

        } else if (call.name === "updateSystemPrompt") {
          const newPrompt = call.args.newPrompt as string;
          onUpdate({ role: "model", text: `*Updating system prompt in database...*` });

          await updateSystemPrompt(newPrompt);

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { success: true, message: "System prompt updated successfully." },
            },
          });

        } else if (call.name === "getTodayStats") {
          onUpdate({ role: "model", text: `*Fetching today's stats...*` });
          const today = new Date().toISOString().split("T")[0];
          const { count } = await supabase
            .from("reports")
            .select("*", { count: "exact", head: true })
            .eq("date", today);

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { count: count ?? 0 },
            },
          });
        }
      }

      if (functionResponses.length > 0) {
        chatHistory.push({ role: "user", parts: functionResponses });
        response = await callChatWithFallback(chatHistory, chatConfig);
      } else {
        break;
      }
    }

    if (response.text) {
      const content = response.candidates?.[0]?.content;
      if (content) chatHistory.push(content);
      onUpdate({ role: "model", text: response.text });
    }
  } catch (error) {
    console.error("Chat error:", error);
    onUpdate({ role: "model", text: "Sorry, I encountered an error processing your request." });
  }
}
