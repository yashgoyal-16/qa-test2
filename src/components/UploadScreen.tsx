import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileAudio, X, BarChart3 } from "lucide-react";
import { CallDetails } from "../types";
import { supabase } from "../supabase";

interface UploadScreenProps {
  onAnalyze: (details: CallDetails) => void;
}

export default function UploadScreen({ onAnalyze }: UploadScreenProps) {
  const [agentName, setAgentName] = useState("");
  const [callId, setCallId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [file, setFile] = useState<File | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchTodayStats = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const { count, error } = await supabase
          .from("reports")
          .select("*", { count: "exact", head: true })
          .eq("date", today);
        if (!error) setTodayCount(count ?? 0);
      } catch (err) {
        console.error("Error fetching today's stats:", err);
      }
    };
    fetchTodayStats();
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];
        setFile(selectedFile);
        if (!callId) {
          const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
          setCallId(nameWithoutExt);
        }
      }
    },
    [callId],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".wav", ".mp3", ".m4a", ".ogg"],
    },
    maxFiles: 1,
    multiple: false,
  } as any);

  const handleAnalyze = () => {
    if (!file) return;
    onAnalyze({ agentName, callId, date, file });
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Comway QA Analyst
          </h1>
          <p className="text-slate-500">
            Upload a call recording to generate an AI-powered QA report.
          </p>
        </div>

        {todayCount !== null && (
          <div className="mb-8 bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-lg shadow-sm text-indigo-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-900">Today's Activity</p>
                <p className="text-xs text-indigo-600">Calls processed so far</p>
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-700">
              {todayCount}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Agent Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Call Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Call ID
            </label>
            <input
              type="text"
              value={callId}
              onChange={(e) => setCallId(e.target.value)}
              placeholder="e.g. CMW-2023-10-01-001"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Call Recording
          </label>
          {!file ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 font-medium mb-1">
                {isDragActive
                  ? "Drop the audio file here..."
                  : "Drag & drop an audio file here"}
              </p>
              <p className="text-slate-400 text-sm">
                or click to browse (WAV, MP3, M4A)
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-4">
                <div className="bg-indigo-100 p-3 rounded-lg text-indigo-600">
                  <FileAudio className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                    {file.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!file}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center"
        >
          Analyze Call
        </button>
      </div>
    </div>
  );
}
