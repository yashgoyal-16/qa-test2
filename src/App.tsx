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
import { auth, db, logout } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user document exists
        try {
          await setDoc(doc(db, "users", currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            role: "user", // Default role
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Error creating user profile:", err);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
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

      // Save report to Firestore
      try {
        const reportId = crypto.randomUUID();
        await setDoc(doc(db, "reports", reportId), {
          userId: user.uid,
          agentName: details.agentName || "Unknown Agent",
          callId: details.callId || "Unknown Call",
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
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error saving report to Firestore:", err);
        // We don't fail the whole process if saving fails, just log it
      }

      setAppState("report");
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
              {user.photoURL && (
                <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              )}
              <span className="text-sm font-medium text-slate-700 hidden sm:block">{user.displayName || user.email}</span>
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

          {appState === "chat" && (
            <RefinementChat />
          )}

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
