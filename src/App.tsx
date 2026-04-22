import React, { useState, useEffect } from "react";
import UploadScreen from "./components/UploadScreen";
import ProcessingScreen from "./components/ProcessingScreen";
import ReportScreen from "./components/ReportScreen";
import HistoryScreen from "./components/HistoryScreen";
import RefinementChat from "./components/RefinementChat";
import { LoginScreen } from "./components/LoginScreen";
import { CallDetails, QAResult } from "./types";
import { transcribeAudio } from "./services/deepgram";
import { evaluateTranscript } from "./services/gemini";
import { supabase, logout } from "./supabase";
import type { User } from "@supabase/supabase-js";
import { LogOut, PlusCircle, History, MessageSquareText } from "lucide-react";

type AppState = "upload" | "processing" | "report" | "history" | "chat";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [appState, setAppState] = useState<AppState>("upload");
  const [processingStatus, setProcessingStatus] = useState<
    "transcribing" | "evaluating" | "generating" | "error"
  >("transcribing");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null);
  const [qaResult, setQaResult] = useState<QAResult | null>(null);

  useEffect(() => {
    let mounted = true;

    // Read session directly from localStorage as a fast primary path
    // Supabase stores the session at the storageKey we configured
    const readStoredSession = () => {
      try {
        const raw = localStorage.getItem("sb-dbxhsozwdzcuofdqxsgc-auth-token");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const session = parsed?.currentSession ?? parsed;
        if (session?.user && session?.access_token) {
          // Check expiry
          const expiresAt = session.expires_at;
          if (expiresAt && expiresAt * 1000 > Date.now()) {
            return session.user as User;
          }
        }
        return null;
      } catch {
        return null;
      }
    };

    // Synchronously restore user from localStorage for instant UI
    const storedUser = readStoredSession();
    if (storedUser) {
      console.log("[Auth] Restored from storage:", storedUser.id);
      setUser(storedUser);
      setIsAuthReady(true);
    }

    // Also listen for async auth state changes (login/logout/refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setIsAuthReady(true);
        console.log("[Auth] State change:", event, currentUser?.id ?? "no user");

        if (currentUser && event === "SIGNED_IN") {
          const upsertedKey = `profile-upserted:${currentUser.id}`;
          if (sessionStorage.getItem(upsertedKey)) return;
          sessionStorage.setItem(upsertedKey, "1");

          setTimeout(() => {
            supabase
              .from("users")
              .upsert(
                {
                  uid: currentUser.id,
                  email: currentUser.email,
                  display_name: currentUser.user_metadata?.full_name ?? null,
                  role: "user",
                },
                { onConflict: "uid" }
              )
              .then(({ error }) => {
                if (error) {
                  sessionStorage.removeItem(upsertedKey);
                  console.error("[Auth] Error creating user profile:", error);
                }
              });
          }, 0);
        }
      }
    );

    // Fallback timeout: if nothing fired after 2s, mark ready anyway
    const timeout = setTimeout(() => {
      if (mounted && !isAuthReady) {
        console.warn("[Auth] Timeout — forcing auth ready");
        setIsAuthReady(true);
      }
    }, 2000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async (details: CallDetails) => {
    if (!user) return;
    setCallDetails(details);
    setAppState("processing");
    setProcessingStatus("transcribing");
    setErrorMsg(undefined);

    try {
      // Step 1: Transcribe
      const transcript = await transcribeAudio(details.file!);

      // Step 2: Evaluate
      setProcessingStatus("evaluating");
      const result = await evaluateTranscript(transcript);

      // Step 3: Generate Report
      setProcessingStatus("generating");

      // Recalculate score to ensure accuracy (LLMs can be bad at math)
      const weights: Record<string, number> = {
        "1": 3,
        "2": 8,
        "3": 3,
        "4": 3,
        "5": 5,
        "6": 3,
        "7": 10,
        "8": 3,
        "9": 9,
        "10": 20,
        "11": 30,
        "12": 3,
      };
      const fatals = [2, 4, 10, 11];

      let earned = 0,
        possible = 0,
        fatalFail = false;
      const fatalFailParams: number[] = [];

      Object.entries(result.scores).forEach(([id, score]) => {
        if (score === "NA") return;
        const weight = weights[id];
        if (weight) {
          possible += weight;
          earned += ((score as number) / 100) * weight;
        }
        if (fatals.includes(Number(id)) && score === 0) {
          fatalFail = true;
          fatalFailParams.push(Number(id));
        }
      });

      const calculatedScore = possible > 0 ? (earned / possible) * 100 : 0;
      result.weighted_score = calculatedScore;
      result.fatal_fail = fatalFail;
      result.fatal_fail_params = fatalFailParams;

      if (fatalFail) {
        result.overall_result = "FAIL";
      } else {
        if (calculatedScore >= 90) result.overall_result = "Excellent";
        else if (calculatedScore >= 75) result.overall_result = "Good";
        else if (calculatedScore >= 60) result.overall_result = "Average";
        else if (calculatedScore >= 40) result.overall_result = "Below Average";
        else result.overall_result = "Poor";
      }

      setQaResult(result);

      // Show report immediately, save to Supabase in background
      setAppState("report");

      // Save report to Supabase (non-blocking)
      const saveReport = async () => {
        try {
          const { error } = await supabase.from("reports").insert({
            user_id: user.id,
            agent_name: details.agentName || "Unknown Agent",
            call_id: details.callId || "Unknown Call",
            date: details.date || new Date().toISOString().split("T")[0],
            transcript: transcript,
            overall_result: result.overall_result || "Unknown",
            weighted_score: result.weighted_score || 0,
            fatal_fail: result.fatal_fail || false,
            scores: result.scores || {},
            remarks: result.remarks || {},
            summary: result.summary || "",
            fatal_fail_params: result.fatal_fail_params || [],
            call_type: result.call_type || null,
            confidence: result.confidence || null,
            strengths: result.strengths || [],
            improvements: result.improvements || [],
          });
          if (error) {
            console.error("[SaveReport] Error:", error.message, error.code, error.details);
          } else {
            console.log("[SaveReport] Report saved successfully for user:", user.id);
          }
        } catch (err) {
          console.error("[SaveReport] Exception:", err);
        }
      };
      saveReport();
    } catch (error: any) {
      console.error("Analysis failed:", error);
      setProcessingStatus("error");
      setErrorMsg(
        error.message || "An unexpected error occurred during analysis.",
      );
    }
  };

  const handleReset = () => {
    setAppState("upload");
    setCallDetails(null);
    setQaResult(null);
    setErrorMsg(undefined);
  };

  const handleSelectHistoryReport = (details: CallDetails, result: QAResult) => {
    setCallDetails(details);
    setQaResult(result);
    setAppState("report");
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg leading-none">
                  C
                </span>
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900">
                Comway QA
              </span>
            </div>

            <nav className="hidden md:flex items-center space-x-1">
              <button
                onClick={() => setAppState("upload")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  appState === "upload" || appState === "processing"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                New Audit
              </button>
              <button
                onClick={() => setAppState("history")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  appState === "history" || (appState === "report" && !callDetails?.file)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <History className="w-4 h-4" />
                Audit History
              </button>
              <button
                onClick={() => setAppState("chat")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  appState === "chat"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <MessageSquareText className="w-4 h-4" />
                Rule Refiner
              </button>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {user.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-sm font-medium text-slate-700 hidden sm:block">
                {user.user_metadata?.full_name || user.email}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile Navigation */}
          <div className="md:hidden flex space-x-2 mb-6 bg-white p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setAppState("upload")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                appState === "upload" || appState === "processing"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              New
            </button>
            <button
              onClick={() => setAppState("history")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                appState === "history" || (appState === "report" && !callDetails?.file)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <History className="w-4 h-4" />
              History
            </button>
            <button
              onClick={() => setAppState("chat")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                appState === "chat"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <MessageSquareText className="w-4 h-4" />
              Refiner
            </button>
          </div>

          {appState === "upload" && <UploadScreen onAnalyze={handleAnalyze} />}

          {appState === "history" && (
            <HistoryScreen onSelectReport={handleSelectHistoryReport} />
          )}

          {appState === "chat" && <RefinementChat />}

          {appState === "processing" && (
            <ProcessingScreen
              status={processingStatus}
              errorMsg={errorMsg}
              onRetry={() => handleAnalyze(callDetails!)}
            />
          )}

          {appState === "report" && qaResult && callDetails && (
            <ReportScreen
              details={callDetails}
              result={qaResult}
              onReset={handleReset}
            />
          )}
        </div>
      </main>
    </div>
  );
}
