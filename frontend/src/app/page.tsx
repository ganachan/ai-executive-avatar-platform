import { fetchAvatars } from "@/lib/api";
import AvatarCard from "@/components/AvatarCard";
import { Users, Video, Zap } from "lucide-react";

export default async function HomePage() {
  const avatars = await fetchAvatars();

  return (
    <div className="px-6 py-12 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-msblue/10 border border-msblue/30 rounded-full px-4 py-1.5 text-msblue text-sm font-medium mb-6">
          <Zap size={14} />
          Powered by Azure AI Speech + Azure OpenAI
        </div>
        <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
          Microsoft Executive
          <span className="block text-msblue">AI Avatars</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Engage with lifelike digital avatars of Microsoft leadership. Create scripted video
          messages or hold live real-time conversations — at any time, at any scale.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-16">
        {[
          { icon: Users, label: "Available Avatars", value: avatars.length.toString() },
          { icon: Video, label: "Scripted Studio", value: "Batch MP4" },
          { icon: Zap, label: "Live Interaction", value: "Real-time" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-surface-card border border-surface-border rounded-xl p-5 text-center">
            <Icon size={24} className="text-msblue mx-auto mb-2" />
            <div className="text-white font-bold text-lg">{value}</div>
            <div className="text-gray-400 text-xs mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Avatar Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-msblue rounded-full inline-block" />
          Available Avatars
        </h2>
        {avatars.length === 0 ? (
          <div className="text-center text-gray-500 py-20 border border-surface-border rounded-2xl">
            No avatars found. <a href="/admin" className="text-msblue hover:underline">Add one in Admin</a>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {avatars.map((avatar) => (
              <AvatarCard key={avatar.id} avatar={avatar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
