import { fetchAvatar } from "@/lib/api";
import InteractTabs from "@/components/InteractTabs";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ avatarId: string }>;
}

export default async function InteractPage({ params }: Props) {
  const { avatarId } = await params;
  const avatar = await fetchAvatar(avatarId).catch(() => null);
  if (!avatar) notFound();

  return (
    <div className="px-6 py-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Live Session —{" "}
          <span className="text-msblue">{avatar.name}</span>
        </h1>
        <p className="text-gray-400 mt-1">
          {avatar.title} · {avatar.department}
        </p>
      </div>
      <InteractTabs avatar={avatar} />
    </div>
  );
}
