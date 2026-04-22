export async function transcribeAudio(file: File): Promise<string> {
  const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_DEEPGRAM_API_KEY is missing. Please add it to your environment variables.",
    );
  }

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.append("model", "nova-3");
  url.searchParams.append("language", "multi");
  url.searchParams.append("punctuate", "true");
  url.searchParams.append("diarize", "true");
  url.searchParams.append("utterances", "true");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": file.type || "audio/wav",
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Format transcript from utterances
  const utterances = data.results?.utterances;
  if (!utterances || utterances.length === 0) {
    return "No speech detected in the audio.";
  }

  // Map Speaker 0 to Agent, Speaker 1 to Customer (assuming Agent speaks first)
  let agentSpeakerId = utterances[0].speaker;

  const formattedTranscript = utterances
    .map((u: any) => {
      const speakerLabel = u.speaker === agentSpeakerId ? "Agent" : "Customer";
      
      // Format start time into [MM:SS]
      const startSeconds = Math.floor(u.start);
      const mins = Math.floor(startSeconds / 60).toString().padStart(2, '0');
      const secs = (startSeconds % 60).toString().padStart(2, '0');
      const timeString = `[${mins}:${secs}]`;

      return `${timeString} ${speakerLabel}: ${u.transcript}`;
    })
    .join("\n");

  return formattedTranscript;
}
