"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { AvatarProfile, AvatarCreate } from "@/lib/types";
import { Settings, Plus, Trash2, Edit, Save, X, Camera, User } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

// Official Azure TTS prebuilt avatar characters and their supported styles.
// Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/standard-avatars
// ⚠ Jeff is excluded — it retires December 2026.
// ⚠ lisa/graceful-sitting, graceful-standing, technical-sitting, technical-standing
//    are batch-only (not supported by real-time WebRTC API).
const AVATAR_CHARACTER_STYLES: Record<string, { styles: string[]; realTimeStyles: string[] }> = {
  // Full-body avatars
  harry: { styles: ["business", "casual", "youthful"],            realTimeStyles: ["business", "casual", "youthful"] },
  lisa:  { styles: ["casual-sitting", "graceful-sitting", "graceful-standing", "technical-sitting", "technical-standing"],
           realTimeStyles: ["casual-sitting"] },
  lori:  { styles: ["casual", "graceful", "formal"],              realTimeStyles: ["casual", "graceful", "formal"] },
  max:   { styles: ["business", "casual", "formal"],              realTimeStyles: ["business", "casual", "formal"] },
  meg:   { styles: ["business", "casual", "formal"],              realTimeStyles: ["business", "casual", "formal"] },
  rowan: { styles: ["business"],                                   realTimeStyles: ["business"] },
  celine:{ styles: ["business"],                                   realTimeStyles: ["business"] },
  nia:   { styles: ["business"],                                   realTimeStyles: ["business"] },
  malik: { styles: ["business"],                                   realTimeStyles: ["business"] },
  // Talking heads (head-only, no gestures)
  marcus:    { styles: [""], realTimeStyles: [""] },
  darius:    { styles: [""], realTimeStyles: [""] },
  isabella:  { styles: [""], realTimeStyles: [""] },
  bianca:    { styles: [""], realTimeStyles: [""] },
  camila:    { styles: [""], realTimeStyles: [""] },
  carlos:    { styles: [""], realTimeStyles: [""] },
  clara:     { styles: [""], realTimeStyles: [""] },
  diego:     { styles: [""], realTimeStyles: [""] },
  elise:     { styles: [""], realTimeStyles: [""] },
  gabrielle: { styles: [""], realTimeStyles: [""] },
  imran:     { styles: [""], realTimeStyles: [""] },
  layla:     { styles: [""], realTimeStyles: [""] },
  matteo:    { styles: [""], realTimeStyles: [""] },
  rahul:     { styles: [""], realTimeStyles: [""] },
  simone:    { styles: [""], realTimeStyles: [""] },
  zoe:       { styles: [""], realTimeStyles: [""] },
};

const AVATAR_CHARACTERS = Object.keys(AVATAR_CHARACTER_STYLES);

const VOICES = [
  { value: "en-US-GuyNeural",   label: "Guy (Male, US)" },
  { value: "en-US-DavisNeural", label: "Davis (Male, US)" },
  { value: "en-US-AndrewNeural",label: "Andrew (Male, US)" },
  { value: "en-US-JennyNeural", label: "Jenny (Female, US)" },
  { value: "en-US-AriaNeural",  label: "Aria (Female, US)" },
  { value: "en-US-NancyNeural", label: "Nancy (Female, US)" },
  { value: "en-US-SaraNeural",  label: "Sara (Female, US)" },
];

const EMPTY_FORM: AvatarCreate = {
  name: "",
  title: "",
  department: "",
  avatar_type: "stock",
  avatar_character: "harry",
  avatar_style: "business",
  voice_name: "en-US-GuyNeural",
  system_prompt: "",
  photo_url: "",
  custom_avatar_id: "",
};

export default function AdminPage() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AvatarCreate>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAvatars = () =>
    fetch(`${API}/api/avatars`).then((r) => r.json()).then(setAvatars);

  useEffect(() => { loadAvatars(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `${API}/api/avatars/${editingId}` : `${API}/api/avatars`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAvatars();
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (avatar: AvatarProfile) => {
    setForm({
      name: avatar.name,
      title: avatar.title,
      department: avatar.department,
      avatar_type: avatar.avatar_type,
      avatar_character: avatar.avatar_character,
      avatar_style: avatar.avatar_style,
      voice_name: avatar.voice_name,
      system_prompt: avatar.system_prompt,
      photo_url: avatar.photo_url ?? "",
      custom_avatar_id: avatar.custom_avatar_id ?? "",
    });
    setEditingId(avatar.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this avatar?")) return;
    await fetch(`${API}/api/avatars/${id}`, { method: "DELETE" });
    await loadAvatars();
  };

  return (
    <div className="px-6 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Settings size={28} className="text-msblue" />
            Admin
          </h1>
          <p className="text-gray-400 mt-1">Manage executive avatar profiles.</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-msblue hover:bg-msblue-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Avatar
        </button>
      </div>

      {/* Avatar table */}
      <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden mb-8">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border text-gray-400 text-sm">
              <th className="text-left px-5 py-3 font-medium">Name</th>
              <th className="text-left px-5 py-3 font-medium">Title</th>
              <th className="text-left px-5 py-3 font-medium">Character</th>
              <th className="text-left px-5 py-3 font-medium">Voice</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {avatars.map((a) => (
              <tr key={a.id} className="border-b border-surface-border last:border-0 hover:bg-surface-hover">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-border flex items-center justify-center flex-shrink-0">
                      {a.avatar_type === "photo" && a.photo_url ? (
                        <Image src={a.photo_url} alt={a.name} width={32} height={32} className="object-cover" unoptimized />
                      ) : (
                        <User size={14} className="text-gray-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium">{a.name}</div>
                      {a.avatar_type === "photo" && (
                        <div className="flex items-center gap-1 text-amber-400 text-[10px]">
                          <Camera size={8} /> VASA-1 Photo
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-gray-400 text-sm">{a.title}</td>
                <td className="px-5 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    a.avatar_type === "photo"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-msblue/10 text-msblue"
                  }`}>
                    {a.avatar_type === "photo" ? "Photo" : `${a.avatar_character} / ${a.avatar_style}`}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-400 text-sm">{a.voice_name}</td>
                <td className="px-5 py-4 flex gap-2 justify-end">
                  <button onClick={() => handleEdit(a)} className="text-gray-400 hover:text-msblue transition-colors">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-surface-border">
              <h2 className="text-white font-semibold text-lg">
                {editingId ? "Edit Avatar" : "Add New Avatar"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Avatar Type toggle */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">Avatar Type</label>
                <div className="flex gap-2">
                  {(["stock", "photo"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, avatar_type: t }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        form.avatar_type === t
                          ? t === "photo"
                            ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                            : "bg-msblue/20 border-msblue/60 text-msblue"
                          : "border-surface-border text-gray-400 hover:text-white"
                      }`}
                    >
                      {t === "photo" ? <Camera size={14} /> : <User size={14} />}
                      {t === "stock" ? "Stock Avatar" : "Photo Avatar (VASA-1)"}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { label: "Full Name", key: "name", placeholder: "Satya Nadella" },
                { label: "Title", key: "title", placeholder: "Chief Executive Officer" },
                { label: "Department", key: "department", placeholder: "Executive Leadership" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm text-gray-300 mb-1">{label}</label>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue text-sm"
                  />
                </div>
              ))}

              {/* Photo Avatar fields */}
              {form.avatar_type === "photo" && (
                <div className="space-y-3 border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
                  <p className="text-amber-300 text-xs font-semibold flex items-center gap-1">
                    <Camera size={11} /> VASA-1 Photo Avatar Settings
                  </p>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Photo URL <span className="text-gray-500">(HTTPS, publicly accessible)</span></label>
                    <input
                      value={form.photo_url ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))}
                      placeholder="https://example.com/executive-photo.jpg"
                      className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-500 text-sm"
                    />
                    {form.photo_url && (
                      <div className="mt-2 flex items-center gap-3">
                        <Image src={form.photo_url} alt="Preview" width={48} height={48} className="rounded-full object-cover border border-amber-500/30" unoptimized />
                        <span className="text-gray-400 text-xs">Photo preview</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Custom Avatar ID <span className="text-gray-500">(optional — Azure Custom Avatar deployment)</span></label>
                    <input
                      value={form.custom_avatar_id ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, custom_avatar_id: e.target.value }))}
                      placeholder="your-custom-avatar-id"
                      className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-amber-500 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Stock Avatar fields */}
              {form.avatar_type === "stock" && (() => {
                const charInfo = AVATAR_CHARACTER_STYLES[form.avatar_character] ?? { styles: [""], realTimeStyles: [""] };
                const availableStyles = charInfo.styles;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">Avatar Character</label>
                        <select
                          value={form.avatar_character}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            avatar_character: e.target.value,
                            // Reset style to first valid option for new character
                            avatar_style: AVATAR_CHARACTER_STYLES[e.target.value]?.styles[0] ?? "",
                          }))}
                          className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue text-sm"
                        >
                          {AVATAR_CHARACTERS.map((c) => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-1">Style</label>
                        <select
                          value={form.avatar_style}
                          onChange={(e) => setForm((f) => ({ ...f, avatar_style: e.target.value }))}
                          className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue text-sm"
                        >
                          {availableStyles.map((s) => {
                            const isRealTime = charInfo.realTimeStyles.includes(s);
                            return (
                              <option key={s || "default"} value={s}>
                                {s || "default"}{!isRealTime ? " (batch only)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                    {/* Warn if selected style is batch-only */}
                    {form.avatar_style && !charInfo.realTimeStyles.includes(form.avatar_style) && (
                      <p className="text-yellow-400 text-xs flex items-center gap-1">
                        ⚠ <strong>{form.avatar_character}/{form.avatar_style}</strong> is batch synthesis only — Live Interaction will not work with this style.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-sm text-gray-300 mb-1">Voice</label>
                <select
                  value={form.voice_name}
                  onChange={(e) => setForm((f) => ({ ...f, voice_name: e.target.value }))}
                  className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue text-sm"
                >
                  {VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">AI System Prompt</label>
                <textarea
                  value={form.system_prompt}
                  onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                  rows={5}
                  placeholder="Describe the avatar's personality, knowledge, and communication style..."
                  className="w-full bg-surface border border-surface-border text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-msblue text-sm resize-none placeholder-gray-600"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-msblue hover:bg-msblue-dark disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save Avatar"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-6 border border-surface-border text-gray-300 hover:text-white py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
