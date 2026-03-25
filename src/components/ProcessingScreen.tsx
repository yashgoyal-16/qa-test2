import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, CheckCircle2, Mic, Brain, FileText } from "lucide-react";

interface ProcessingScreenProps {
  status: "transcribing" | "evaluating" | "generating" | "error";
  errorMsg?: string;
  onRetry?: () => void;
}

export default function ProcessingScreen({
  status,
  errorMsg,
  onRetry,
}: ProcessingScreenProps) {
  const steps = [
    { id: "transcribing", label: "Transcribing audio...", icon: Mic },
    {
      id: "evaluating",
      label: "Evaluating against QA parameters...",
      icon: Brain,
    },
    { id: "generating", label: "Generating report...", icon: FileText },
  ];

  const getCurrentStepIndex = () => {
    if (status === "error") return -1;
    return steps.findIndex((s) => s.id === status);
  };

  const currentIndex = getCurrentStepIndex();

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-[60vh] flex flex-col items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 w-full">
        <h2 className="text-2xl font-semibold text-slate-900 text-center mb-10">
          {status === "error" ? "Analysis Failed" : "Analyzing Call"}
        </h2>

        {status === "error" ? (
          <div className="text-center">
            <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6">
              <p className="font-medium">
                {errorMsg || "An unexpected error occurred."}
              </p>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {steps.map((step, index) => {
              const isCompleted = currentIndex > index;
              const isCurrent = currentIndex === index;
              const isPending = currentIndex < index;

              const Icon = step.icon;

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isPending ? 0.4 : 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className={`flex items-center space-x-4 ${isCurrent ? "text-indigo-600" : isCompleted ? "text-emerald-600" : "text-slate-400"}`}
                >
                  <div
                    className={`p-3 rounded-full flex-shrink-0 ${
                      isCurrent
                        ? "bg-indigo-50"
                        : isCompleted
                          ? "bg-emerald-50"
                          : "bg-slate-50"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : isCurrent ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-lg font-medium ${isCurrent ? "text-slate-900" : isCompleted ? "text-slate-700" : "text-slate-400"}`}
                    >
                      {step.label}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
