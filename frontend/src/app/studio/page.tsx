"use client";

import { useState } from "react";
import { fetchAvatars, createBatchJob, fetchBatchJob } from "@/lib/api";
import type { AvatarProfile, SynthesisJob } from "@/lib/types";
import { Video, RefreshCw, CheckCircle, Clock, XCircle } from "lucide-react";
import { useEffect } from "react";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Succeeded: <CheckCircle size={16} className="text-green-400" />,
  Running: <RefreshCw size={16} className="text-yellow-400 animate-spin" />,
  Failed: <XCircle size={16} className="text-red-400" />,
};

export default function StudioPage() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [script, setScript] = useState("");
  const [bgColor, setBgColor] = useState("#FFFFFFFF");
  const [subtitles, setSubtitles] = useState(true);
  const [jobs, setJobs] = useState<SynthesisJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAvatars().then((data) => {
      // Only show avatars capable of batch video synthesis:
      // stock and custom avatars always work; photo avatars require a photo_url.
      const batchCapable = data.filter(
        (a) => a.avatar_type === "stock" || a.avatar_type === "custom" || (a.avatar_type === "photo" && a.photo_url)
      );
      setAvatars(batchCapable);
      if (batchCapable.length > 0) setSelectedId(batchCapable[0].id);
    });
  }, []);

  const handleGenerate = async () => {
    if (!selectedId || !script.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const job = await createBatchJob({ avatar_id: selectedId, script, background_color: bgColor, subtitles });
      setJobs((prev) => [job, ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create job");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshJob = async (jobId: string) => {
    try {
      const updated = await fetchBatchJob(jobId);
      setJobs((prev) => prev.map((j) => (j.job_id === jobId ? updated : j)));
    } catch (e) {
      console.error("Refresh job failed:", e);
    }
  };

  return (
    <div className="px-6 py-10 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
        <Video size={28} className="text-msblue" />
        Script Studio
      </h1>
      <p className="text-gray-400 mb-10">Generate professional video messages from your executive avatar.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left — Script Editor */}
        <div className="space-y-5">
          {/* Avatar selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Select Avatar</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full bg-surface-card border border-surface-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-msblue"
            >
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.title}
                </option>
              ))}
            </select>
          </div>

          {/* Script textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Script
              <span className="text-gray-500 font-normal ml-2">({script.length} chars)</span>
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={10}
              placeholder="Write your executive message here..."
              className="w-full bg-surface-card border border-surface-border text-white rounded-lg px-4 py-3 focus:outline-none focus:border-msblue resize-none placeholder-gray-600"
            />
          </div>

          {/* Options */}
          <div className="flex gap-6 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Background Color</label>
              <input
                type="color"
                value={`#${bgColor.slice(1, 7)}`}
                onChange={(e) => setBgColor(e.target.value + "FF")}
                className="w-12 h-10 rounded border border-surface-border cursor-pointer bg-surface-card"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                id="subtitles"
                type="checkbox"
                checked={subtitles}
                onChange={(e) => setSubtitles(e.target.checked)}
                className="w-4 h-4 accent-msblue"
              />
              <label htmlFor="subtitles" className="text-sm text-gray-300">Include subtitles</label>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedId || !script.trim()}
            className="w-full bg-msblue hover:bg-msblue-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {isGenerating ? "Submitting to Azure..." : "Generate Video"}
          </button>
        </div>

        {/* Right — Job List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Generated Videos</h2>
          {jobs.length === 0 ? (
            <div className="border border-surface-border rounded-xl p-10 text-center text-gray-500">
              No videos yet. Generate your first one.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.job_id} className="bg-surface-card border border-surface-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {STATUS_ICONS[job.status] ?? <Clock size={16} className="text-gray-400" />}
                        <span className="text-white font-medium text-sm">{job.avatar_name}</span>
                      </div>
                      <p className="text-gray-400 text-xs truncate">{job.script_preview}</p>
                      <p className="text-gray-600 text-xs mt-1">ID: {job.job_id}</p>
                    </div>
                    <button
                      onClick={() => handleRefreshJob(job.job_id)}
                      className="text-gray-400 hover:text-msblue ml-3 mt-0.5"
                      title="Refresh status"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                  {job.video_url && (
                    <div className="mt-3">
                      {/* Inline HTML5 player — avoids Windows codec/encoding issues */}
                      <video
                        key={job.video_url}
                        controls
                        playsInline
                        className="w-full rounded-lg bg-black"
                        style={{ maxHeight: "280px" }}
                      >
                        <source src={job.video_url} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                      <a
                        href={job.video_url}
                        download
                        className="mt-2 inline-block text-msblue text-sm hover:underline"
                      >
                        Download Video ↓
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
