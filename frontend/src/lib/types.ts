export interface AvatarProfile {
  id: string;
  name: string;
  title: string;
  department: string;
  avatar_type: "stock" | "photo" | "custom";
  avatar_character: string;
  avatar_style: string;
  voice_name: string;
  system_prompt: string;
  photo_url?: string | null;
  custom_avatar_id?: string | null;
  customized?: boolean;
  use_built_in_voice?: boolean;
  created_at?: string | null;
}

export interface AvatarCreate {
  name: string;
  title: string;
  department: string;
  avatar_type: "stock" | "photo";
  avatar_character: string;
  avatar_style: string;
  voice_name: string;
  system_prompt: string;
  photo_url?: string | null;
  custom_avatar_id?: string | null;
}

export interface SynthesisJob {
  job_id: string;
  avatar_id: string;
  avatar_name: string;
  script_preview: string;
  status: string;
  video_url?: string | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ScriptSynthesisRequest {
  avatar_id: string;
  script: string;
  background_color?: string;
  subtitles?: boolean;
}
