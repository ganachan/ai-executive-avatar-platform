import type { AvatarProfile, SynthesisJob, ScriptSynthesisRequest } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAvatars(): Promise<AvatarProfile[]> {
  const res = await fetch(`${API}/api/avatars`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch avatars");
  return res.json();
}

export async function fetchAvatar(id: string): Promise<AvatarProfile> {
  const res = await fetch(`${API}/api/avatars/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Avatar ${id} not found`);
  return res.json();
}

export async function fetchBatchJob(jobId: string): Promise<SynthesisJob> {
  const res = await fetch(`${API}/api/synthesis/batch/${jobId}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch job ${jobId}`);
  }
  return res.json();
}

export async function createBatchJob(payload: ScriptSynthesisRequest): Promise<SynthesisJob> {
  const res = await fetch(`${API}/api/synthesis/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create synthesis job");
  }
  return res.json();
}

export async function fetchSpeechToken(): Promise<{ token: string; region: string }> {
  const res = await fetch(`${API}/api/speech/token`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to get speech token");
  return res.json();
}

export async function fetchIceToken(): Promise<{ Urls: string[]; Username: string; Password: string }> {
  const res = await fetch(`${API}/api/speech/ice-token`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to get ICE token");
  return res.json();
}

export async function sendChatMessage(
  avatarId: string,
  message: string,
  history: { role: string; content: string }[]
): Promise<{ response: string; conversation_history: { role: string; content: string }[] }> {
  const res = await fetch(`${API}/api/speech/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatar_id: avatarId, message, conversation_history: history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Chat request failed");
  }
  return res.json();
}
