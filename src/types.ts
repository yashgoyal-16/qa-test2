export interface CallDetails {
  agentName: string;
  callId: string;
  date: string;
  file: File | null;
}

export interface QAResult {
  call_type?: string;
  confidence?: string;
  agent_evaluated: boolean;
  overall_result: string;
  weighted_score: number;
  fatal_fail: boolean;
  fatal_fail_params: number[];
  scores: Record<string, number | "NA">;
  remarks: Record<string, string>;
  summary: string;
  strengths: string[];
  improvements: string[];
}

export interface ParameterDef {
  id: number;
  name: string;
  weight: number;
  isFatal: boolean;
}

export const QA_PARAMETERS: ParameterDef[] = [
  {
    id: 1,
    name: "Opening / Closing / Further Assistance",
    weight: 3,
    isFatal: false,
  },
  {
    id: 2,
    name: "Customer Identification / Verification",
    weight: 8,
    isFatal: true,
  },
  { id: 3, name: "Hold / Escalation Guidelines", weight: 3, isFatal: false },
  { id: 4, name: "Courtesy and Professionalism", weight: 3, isFatal: true },
  { id: 5, name: "Attentiveness and Patience", weight: 5, isFatal: false },
  { id: 6, name: "Enthusiasm and Confidence", weight: 3, isFatal: false },
  { id: 7, name: "Rapport Building", weight: 10, isFatal: false },
  { id: 8, name: "Communication Skills", weight: 3, isFatal: false },
  { id: 9, name: "Complete Probing", weight: 9, isFatal: false },
  { id: 10, name: "Correct and Complete Research", weight: 20, isFatal: true },
  {
    id: 11,
    name: "Correct and Complete Resolution",
    weight: 30,
    isFatal: true,
  },
  {
    id: 12,
    name: "Providing Alternate / Additional Information",
    weight: 3,
    isFatal: false,
  },
];
