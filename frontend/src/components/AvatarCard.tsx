import Link from "next/link";
import Image from "next/image";
import type { AvatarProfile } from "@/lib/types";
import { Video, Zap, User, Camera } from "lucide-react";

interface Props {
  avatar: AvatarProfile;
}

export default function AvatarCard({ avatar }: Props) {
  // Deterministic gradient per avatar_character for visual differentiation
  const gradients: Record<string, string> = {
    harry:   "from-blue-900/40 to-slate-900",
    lisa:    "from-violet-900/40 to-slate-900",
    lori:    "from-purple-900/40 to-slate-900",
    meg:     "from-pink-900/40 to-slate-900",
    max:     "from-cyan-900/40 to-slate-900",
    rowan:   "from-emerald-900/40 to-slate-900",
    celine:  "from-rose-900/40 to-slate-900",
    nia:     "from-teal-900/40 to-slate-900",
    malik:   "from-orange-900/40 to-slate-900",
    // talking heads
    marcus:    "from-sky-900/40 to-slate-900",
    darius:    "from-lime-900/40 to-slate-900",
    isabella:  "from-fuchsia-900/40 to-slate-900",
    bianca:    "from-yellow-900/40 to-slate-900",
    custom:  "from-amber-900/40 to-slate-900",
    "binaka-half": "from-emerald-900/40 to-slate-900",
  };
  const gradient = gradients[avatar.avatar_character] ?? "from-blue-900/40 to-slate-900";
  const isPhoto = avatar.avatar_type === "photo";
  const isCustom = avatar.avatar_type === "custom";

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden hover:border-msblue/50 transition-all duration-200 group">
      {/* Card header */}
      <div className={`bg-gradient-to-br ${gradient} px-6 py-8 flex flex-col items-center text-center relative`}>
        {/* Avatar type badge */}
        {isPhoto ? (
          <span className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <Camera size={9} />
            VASA-1
          </span>
        ) : isCustom ? (
          <span className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <Zap size={9} />
            Custom
          </span>
        ) : (
          <span className="absolute top-3 right-3 flex items-center gap-1 bg-msblue/20 border border-msblue/30 text-msblue text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Stock
          </span>
        )}

        {/* Avatar visual */}
        <div className="w-20 h-20 bg-surface-card/60 border border-white/10 rounded-full flex items-center justify-center mb-4 group-hover:border-msblue/40 transition-colors overflow-hidden">
          {isPhoto && avatar.photo_url ? (
            <Image
              src={avatar.photo_url}
              alt={avatar.name}
              width={80}
              height={80}
              className="w-full h-full object-cover rounded-full"
              unoptimized
            />
          ) : (
            <User size={28} className="text-gray-300" />
          )}
        </div>

        <h3 className="text-white font-bold text-lg leading-tight">{avatar.name}</h3>
        <p className="text-msblue text-sm font-medium mt-1">{avatar.title}</p>
        <p className="text-gray-500 text-xs mt-0.5">{avatar.department}</p>

        {/* Character / style tag */}
        <span className="mt-3 text-[10px] text-gray-500 bg-black/20 px-2 py-0.5 rounded-full">
          {isPhoto ? "Photo Avatar" : `${avatar.avatar_character} · ${avatar.avatar_style}`}
        </span>
      </div>

      {/* Card footer */}
      <div className="px-5 py-4 flex gap-2">
        <Link
          href={`/studio?avatar=${avatar.id}`}
          className="flex-1 flex items-center justify-center gap-2 text-sm border border-surface-border hover:border-msblue text-gray-300 hover:text-white py-2.5 rounded-lg transition-colors"
        >
          <Video size={14} />
          Script
        </Link>
        <Link
          href={`/interact/${avatar.id}`}
          className="flex-1 flex items-center justify-center gap-2 text-sm bg-msblue hover:bg-msblue-dark text-white py-2.5 rounded-lg transition-colors"
        >
          <Zap size={14} />
          Live
        </Link>
      </div>
    </div>
  );
}
