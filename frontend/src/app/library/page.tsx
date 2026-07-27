"use client";

import { useState, useEffect } from "react";
import type { SynthesisJob } from "@/lib/types";
import { Library, RefreshCw, Download, CheckCircle, Clock, XCircle, Loader } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  Succeeded: { icon: <CheckCircle size={14} />, color: "text-green-400", label: "Ready" },
  Running: { icon: <Loader size={14} className="animate-spin" />, color: "text-yellow-400", label: "Processing" },
  Failed: { icon: <XCircle size={14} />, color: "text-red-400", label: "Failed" },
};

export default function LibraryPage() {
  const [jobs, setJobs] = useState<SynthesisJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/synthesis/batch`);
      const data: SynthesisJob[] = await res.json();
      setJobs(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const refreshJob = async (jobId: string) => {
    const res = await fetch(`${API}/api/synthesis/batch/${jobId}`);
    const updated: SynthesisJob = await res.json();
    setJobs((prev) => prev.map((j) => (j.job_id === jobId ? updated : j)));
  };

  useEffect(() => { loadJobs(); }, []);

  return (
    <div className="px-6 py-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Library size={28} className="text-msblue" />
            Video Library
          </h1>
          <p className="text-gray-400 mt-1">All generated avatar videos from the Script Studio.</p>
        </div>
        <button
          onClick={loadJobs}
          className="flex items-center gap-2 text-sm text-gray-300 hover:text-white border border-surface-border hover:border-msblue px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader size={32} className="animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="border border-surface-border rounded-2xl py-24 text-center text-gray-500">
          No videos yet.{" "}
          <a href="/studio" className="text-msblue hover:underline">
            Create one in Studio →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {jobs.map((job) => {
            const status = statusConfig[job.status] ?? { icon: <Clock size={14} />, color: "text-gray-400", label: job.status };
            return (
              <div key={job.job_id} className="bg-surface-card border border-surface-border rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold">{job.avatar_name}</span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${status.color}`}>
                    {status.icon}
                    {status.label}
                  </span>
                </div>

                <p className="text-gray-400 text-sm line-clamp-2">{job.script_preview}</p>

                <p className="text-gray-600 text-xs">
                  {new Date(job.created_at).toLocaleString()} · {job.job_id}
                </p>

                <div className="flex gap-2 mt-auto pt-1">
                  {job.status !== "Succeeded" && (
                    <button
                      onClick={() => refreshJob(job.job_id)}
                      className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-300 hover:text-white border border-surface-border hover:border-msblue py-2 rounded-lg transition-colors"
                    >
                      <RefreshCw size={13} />
                      Check Status
                    </button>
                  )}
                  {job.video_url && (
                    <a
                      href={job.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 text-sm bg-msblue hover:bg-msblue-dark text-white py-2 rounded-lg transition-colors"
                    >
                      <Download size={13} />
                      Download
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
