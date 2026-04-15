import React, { useRef } from "react";
import {
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { CallDetails, QAResult, QA_PARAMETERS } from "../types";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

interface ReportScreenProps {
  details: CallDetails;
  result: QAResult;
  onReset: () => void;
}

export default function ReportScreen({
  details,
  result,
  onReset,
}: ReportScreenProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;

    try {
      // Convert oklch colors to rgb for html2canvas compatibility
      const el = reportRef.current;
      const allElements = el.querySelectorAll("*");
      allElements.forEach((node: Element) => {
        const computed = getComputedStyle(node);
        const htmlNode = node as HTMLElement;
        if (computed.color) htmlNode.style.color = computed.color;
        if (computed.backgroundColor && computed.backgroundColor !== "rgba(0, 0, 0, 0)")
          htmlNode.style.backgroundColor = computed.backgroundColor;
        if (computed.borderColor) htmlNode.style.borderColor = computed.borderColor;
      });

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`QA_Report_${details.callId || "Call"}.pdf`);
    } catch (error) {
      console.error("Failed to generate PDF", error);
      // Fallback to browser print
      window.print();
    }
  };

  const getScoreColor = (score: number | "NA" | undefined) => {
    if (score === "NA" || score === undefined) return "text-slate-500 bg-slate-100";
    if (score >= 90) return "text-emerald-700 bg-emerald-100";
    if (score >= 75) return "text-blue-700 bg-blue-100";
    if (score >= 50) return "text-amber-700 bg-amber-100";
    return "text-red-700 bg-red-100";
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case "Excellent":
        return "bg-emerald-500";
      case "Good":
        return "bg-blue-500";
      case "Average":
        return "bg-amber-500";
      case "Below Average":
        return "bg-orange-500";
      case "Poor":
        return "bg-red-500";
      case "FAIL":
        return "bg-red-600";
      default:
        return "bg-slate-500";
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">QA Report</h1>
        <div className="flex space-x-3">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center space-x-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
          <button
            onClick={onReset}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Evaluate Another</span>
          </button>
        </div>
      </div>

      <div
        ref={reportRef}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
      >
        {/* Header Section */}
        <div className="p-6 sm:p-8 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {details.agentName || "Unknown Agent"}
            </h2>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="flex items-center">
                <span className="font-semibold mr-1">Call ID:</span>{" "}
                {details.callId || "N/A"}
              </span>
              <span className="flex items-center">
                <span className="font-semibold mr-1">Date:</span>{" "}
                {details.date || "N/A"}
              </span>
              {result.call_type && (
                <span className="flex items-center">
                  <span className="font-semibold mr-1">Type:</span>{" "}
                  <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md text-xs font-bold">{result.call_type}</span>
                </span>
              )}
              {result.confidence && (
                <span className="flex items-center">
                  <span className="font-semibold mr-1">Confidence:</span>{" "}
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                    result.confidence === 'high' ? 'bg-emerald-100 text-emerald-800' :
                    result.confidence === 'medium' ? 'bg-amber-100 text-amber-800' :
                    'bg-red-100 text-red-800'
                  }`}>{result.confidence.toUpperCase()}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-6 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Final Score
              </p>
              <p className="text-4xl font-bold text-slate-900">
                {result.weighted_score.toFixed(1)}%
              </p>
            </div>
            <div className="h-12 w-px bg-slate-200"></div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Grade
              </p>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold text-white ${getGradeColor(result.overall_result)}`}
              >
                {result.overall_result}
              </span>
            </div>
          </div>
        </div>

        {/* Fatal Fail Warning */}
        {result.fatal_fail && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 m-6 rounded-r-lg flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-bold text-lg">FATAL FAIL</h3>
              <p className="text-red-700 mt-1">
                This call failed automatically due to zero scores in one or more
                fatal parameters:
                <span className="font-semibold ml-1">
                  {result.fatal_fail_params
                    .map((id) => QA_PARAMETERS.find((p) => p.id === id)?.name)
                    .join(", ")}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Summary Section */}
        <div className="p-6 sm:p-8 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-3">AI Summary</h3>
          <p className="text-slate-700 leading-relaxed">{result.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100">
              <h4 className="font-bold text-emerald-800 flex items-center mb-3">
                <CheckCircle className="w-5 h-5 mr-2" /> Strengths
              </h4>
              <ul className="space-y-2">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-emerald-500 mr-2">•</span>
                    <span className="text-slate-700 text-sm">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-5 border border-orange-100">
              <h4 className="font-bold text-orange-800 flex items-center mb-3">
                <AlertTriangle className="w-5 h-5 mr-2" /> Areas to Improve
              </h4>
              <ul className="space-y-2">
                {result.improvements.map((s, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-orange-500 mr-2">•</span>
                    <span className="text-slate-700 text-sm">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Scorecard Table */}
        <div className="p-6 sm:p-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            Detailed Scorecard
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="p-4 w-12">#</th>
                  <th className="p-4">Parameter</th>
                  <th className="p-4 w-24 text-center">Weight</th>
                  <th className="p-4 w-24 text-center">Score</th>
                  <th className="p-4 w-24 text-center">Earned</th>
                  <th className="p-4 min-w-[250px]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {QA_PARAMETERS.map((param) => {
                  const score = result.scores[param.id.toString()];
                  const earned =
                    score === "NA"
                      ? "NA"
                      : score === undefined
                        ? "0.0"
                        : (((score as number) / 100) * param.weight).toFixed(1);
                  const remark = result.remarks[param.id.toString()] || "-";
                  const isFatalFail = param.isFatal && score === 0;

                  return (
                    <tr
                      key={param.id}
                      className={`hover:bg-slate-50 transition-colors ${isFatalFail ? "bg-red-50/30" : ""}`}
                    >
                      <td className="p-4 text-slate-500 font-medium">
                        {param.id}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-slate-900">
                          {param.name}
                        </div>
                        {param.isFatal && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                            FATAL
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center text-slate-600">
                        {param.weight}%
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(score)}`}
                        >
                          {score}
                        </span>
                      </td>
                      <td className="p-4 text-center font-semibold text-slate-700">
                        {earned}
                        {earned !== "NA" && "%"}
                      </td>
                      <td className="p-4 text-sm text-slate-600 leading-relaxed">
                        {remark || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
