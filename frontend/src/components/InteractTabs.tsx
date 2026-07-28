"use client";

import { useState } from "react";
import { Radio, Video } from "lucide-react";
import LiveAvatarSession from "./LiveAvatarSession";
import VoiceLiveSession from "./VoiceLiveSession";
import type { AvatarProfile } from "@/lib/types";

interface Props {
  avatar: AvatarProfile;
}

type Tab = "tts" | "voicelive";

export default function InteractTabs({ avatar }: Props) {
  const [tab, setTab] = useState<Tab>("voicelive");

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-surface p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("voicelive")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "voicelive"
              ? "bg-indigo-600 text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Radio className="w-4 h-4" />
          Voice Live
          <span className="text-xs opacity-70 ml-0.5">✦ New</span>
        </button>
        <button
          onClick={() => setTab("tts")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "tts"
              ? "bg-msblue text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Video className="w-4 h-4" />
          Scripted Avatar
        </button>
      </div>

      {/* Mode description */}
      {tab === "voicelive" ? (
        <p className="text-gray-500 text-xs mb-4">
          Real-time voice conversation — speak freely and the avatar responds with lip-sync
          and natural turn detection. Powered by Azure Voice Live API.
        </p>
      ) : (
        <p className="text-gray-500 text-xs mb-4">
          Scripted avatar — generate a professional video message from a script,
          rendered with the avatar’s paired in-sync voice model.
        </p>
      )}

      {/* Session panel */}
      {tab === "voicelive" ? (
        <VoiceLiveSession
          avatarId={avatar.id}
          avatarName={avatar.name}
          avatarCharacter={avatar.avatar_character}
          avatarStyle={avatar.avatar_style}
        />
      ) : (
        <LiveAvatarSession
          avatarId={avatar.id}
          avatarName={avatar.name}
          voiceName={avatar.voice_name}
          avatarCharacter={avatar.avatar_character}
          avatarStyle={avatar.avatar_style}
          avatarType={avatar.avatar_type}
          photoUrl={avatar.photo_url}
          customized={avatar.customized}
          useBuiltInVoice={avatar.use_built_in_voice}
        />
      )}
    </div>
  );
}
