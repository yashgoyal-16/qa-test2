import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { CallDetails, QAResult } from "../types";
import { Clock, Search, FileText, ChevronRight, AlertCircle } from "lucide-react";

interface HistoryScreenProps {
  onSelectReport: (details: CallDetails, result: QAResult) => void;
}

interface HistoryItem {
  id: string;
  agent_name: string;
  call_id: string;
  date: string;
  overall_result: string;
  weighted_score: number;
  fatal_fail: boolean;
  scores: Record<string, number | "NA">;
  remarks: Record<string, string>;
  summary: string;
  fatal_fail_params: number[];
  call_type?: string;
  confidence?: string;
  strengths?: string[];
  improvements?: string[];
  created_at: string;
}

export default function HistoryScreen({ onSelectReport }: HistoryScreenProps) {
  const [reports, setReports] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;

    const tryFetch = async (userId: string, timeoutMs: number): Promise<any[]> => {
      // Select only columns needed for list view - EXCLUDES transcript (huge) to avoid timeouts
      const query = supabase
        .from("reports")
        .select("id, agent_name, call_id, date, overall_result, weighted_score, fatal_fail, fatal_fail_params, scores, remarks, summary, call_type, confidence, strengths, improvements, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      const result = await Promise.race([
        query,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Query timeout")), timeoutMs),
        ),
      ]);

      const { data, error: fetchError } = result as any;
      if (fetchError) throw fetchError;
      return data ?? [];
    };

    const fetchHistory = async () => {
      setLoading(true);
      try {
        // Read user ID directly from localStorage to avoid lock hangs
        let userId: string | null = null;
        try {
          const raw = localStorage.getItem("sb-dbxhsozwdzcuofdqxsgc-auth-token");
          if (raw) {
            const parsed = JSON.parse(raw);
            const session = parsed?.currentSession ?? parsed;
            userId = session?.user?.id ?? null;
          }
        } catch {}

        console.log("[History] User from storage:", userId ?? "none");

        if (!userId) {
          if (!cancelled) setError("Not logged in. Please sign in to view history.");
          return;
        }

        // Try up to 2 times with increasing timeout
        let data: any[] = [];
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[History] Attempt ${attempt}...`);
            data = await tryFetch(userId, attempt === 1 ? 20000 : 30000);
            lastErr = null;
            break;
          } catch (err: any) {
            console.warn(`[History] Attempt ${attempt} failed:`, err.message);
            lastErr = err;
          }
        }

        if (cancelled) return;
        if (lastErr) throw lastErr;

        console.log("[History] Loaded", data.length, "reports");
        setReports(data);
        setError(null);
      } catch (err: any) {
        console.error("[History] Final error:", err);
        if (!cancelled) setError(err.message || "Failed to load audit history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (item: HistoryItem) => {
    const details: CallDetails = {
      agentName: item.agent_name,
      callId: item.call_id,
      date: item.date,
      file: null,
    };

    const result: QAResult = {
      agent_evaluated: true,
      overall_result: item.overall_result,
      weighted_score: item.weighted_score,
      fatal_fail: item.fatal_fail,
      scores: item.scores || {},
      remarks: item.remarks || {},
      summary: item.summary || "",
      fatal_fail_params: item.fatal_fail_params || [],
      call_type: item.call_type,
      confidence: item.confidence,
      strengths: item.strengths || [],
      improvements: item.improvements || [],
    };

    onSelectReport(details, result);
  };

  const filteredReports = reports.filter(
    (report) =>
      report.agent_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.call_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
        <p>Loading audit history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading History</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Clock className="w-6 h-6 text-indigo-600" />
            Audit History
          </h2>
          <p className="text-gray-500 text-sm mt-1">Review your past QA evaluations</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agent or call ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-lg font-medium text-gray-600">No reports found</p>
          <p className="text-sm mt-1">
            {searchTerm ? "Try a different search term." : "You haven't generated any QA reports yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Agent</th>
                <th className="px-6 py-4 font-medium">Call ID</th>
                <th className="px-6 py-4 font-medium">Score</th>
                <th className="px-6 py-4 font-medium">Result</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  onClick={() => handleSelect(report)}
                  className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {report.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{report.agent_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {report.call_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {(report.weighted_score ?? 0).toFixed(1)}%
                      </span>
                      {report.fatal_fail && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          Fatal
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      report.overall_result === 'FAIL'
                        ? 'bg-red-100 text-red-700'
                        : report.overall_result === 'Poor' || report.overall_result === 'Below Average'
                        ? 'bg-orange-100 text-orange-700'
                        : report.overall_result === 'Average'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {report.overall_result}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end w-full">
                      View <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
