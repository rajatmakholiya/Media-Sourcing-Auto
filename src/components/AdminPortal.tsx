"use client";

import React, { useState, useEffect } from 'react';

interface Preset {
  _id: string;
  name: string;
  seederPrompt: string;
  previewImage: string;
}

interface AdminPortalProps {
  onClose: () => void;
  onPresetsUpdated?: () => void;
}

export default function AdminPortal({ onClose, onPresetsUpdated }: AdminPortalProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    seederPrompt: '',
    previewImage: ''
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('library');

  const fetchPresets = async () => {
    try {
      const response = await fetch('/api/design/presets');
      if (response.ok) {
        const data = await response.json();
        setPresets(data);
      }
    } catch (err) {
      console.error("Failed to load presets:", err);
      setStatus({ type: 'error', message: 'Could not connect to the server.' });
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await fetch('/api/design/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: 'Preset saved successfully.' });
        setFormData({ name: '', seederPrompt: '', previewImage: '' });
        fetchPresets();
        if (onPresetsUpdated) onPresetsUpdated();
      } else {
        setStatus({ type: 'error', message: result.error || 'Failed to save preset.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Network error.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this preset?')) return;

    try {
      const response = await fetch(`/api/design/presets/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setStatus({ type: 'success', message: 'Preset deleted.' });
        fetchPresets();
        if (onPresetsUpdated) onPresetsUpdated();
      } else {
        setStatus({ type: 'error', message: 'Failed to delete.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Network error.' });
    }
  };

  return (
    <div className="h-full bg-white dark:bg-[#111118] border-l border-gray-200 dark:border-[#1e1e28] flex flex-col transition-colors">

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-[#1e1e28] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#7c5cfc]/10 border border-[#7c5cfc]/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#7c5cfc]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Preset Manager</h2>
            <p className="text-[10px] text-gray-400 dark:text-[#52525b]">{presets.length} styles loaded</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-[#1c1c24] hover:bg-gray-200 dark:hover:bg-[#27272f] border border-gray-200 dark:border-[#27272f] flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-gray-400 dark:text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 flex gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('library')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'library'
              ? 'bg-[#7c5cfc]/10 text-[#7c5cfc] dark:text-[#c084fc] border border-[#7c5cfc]/20'
              : 'text-gray-400 dark:text-[#52525b] hover:text-gray-600 dark:hover:text-[#71717a] border border-transparent'
          }`}
        >
          Library
        </button>
        <button
          onClick={() => setActiveTab('add')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeTab === 'add'
              ? 'bg-[#7c5cfc]/10 text-[#7c5cfc] dark:text-[#c084fc] border border-[#7c5cfc]/20'
              : 'text-gray-400 dark:text-[#52525b] hover:text-gray-600 dark:hover:text-[#71717a] border border-transparent'
          }`}
        >
          + Add New
        </button>
      </div>

      {/* Status Message */}
      {status.message && (
        <div className="mx-5 mt-3 shrink-0">
          <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
            status.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
              : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'
          }`}>
            {status.message}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === 'library' ? (
          <div className="space-y-2">
            {presets.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-10 h-10 text-gray-200 dark:text-[#1e1e28] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <p className="text-xs text-gray-400 dark:text-[#3f3f46] font-medium">No presets yet</p>
                <button onClick={() => setActiveTab('add')} className="text-[10px] text-[#7c5cfc] font-semibold mt-1 hover:underline">Add your first style</button>
              </div>
            ) : (
              presets.map(preset => (
                <div key={preset._id} className="group flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#141419] border border-gray-200 dark:border-[#1e1e28] hover:border-gray-300 dark:hover:border-[#27272f] transition-all">
                  <img
                    src={preset.previewImage}
                    alt={preset.name}
                    className="w-16 h-20 object-cover rounded-md border border-gray-200 dark:border-[#27272f] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-gray-800 dark:text-[#e4e4e7] truncate">{preset.name}</h4>
                      <button
                        onClick={() => handleDelete(preset._id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 flex items-center justify-center transition-all"
                      >
                        <svg className="w-3 h-3 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-[#52525b] mt-1 line-clamp-2 leading-relaxed">{preset.seederPrompt}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Style Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Cinematic Hero Shot"
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2.5 text-sm text-gray-800 dark:text-[#e4e4e7] placeholder-gray-400 dark:placeholder-[#3f3f46] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Seeder Prompt</label>
              <textarea
                name="seederPrompt"
                value={formData.seederPrompt}
                onChange={handleInputChange}
                placeholder="The master prompt that defines this visual style..."
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2.5 text-sm text-gray-800 dark:text-[#e4e4e7] placeholder-gray-400 dark:placeholder-[#3f3f46] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium resize-none"
                rows={5}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-[#52525b] uppercase tracking-wider mb-1.5">Preview Image URL</label>
              <input
                type="url"
                name="previewImage"
                value={formData.previewImage}
                onChange={handleInputChange}
                placeholder="https://..."
                className="w-full rounded-lg bg-gray-100 dark:bg-[#1c1c24] border border-gray-200 dark:border-[#27272f] p-2.5 text-sm text-gray-800 dark:text-[#e4e4e7] placeholder-gray-400 dark:placeholder-[#3f3f46] focus:border-[#7c5cfc]/50 focus:ring-1 focus:ring-[#7c5cfc]/20 outline-none transition-all font-medium"
                required
              />
              {formData.previewImage && (
                <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-[#27272f] h-24">
                  <img
                    src={formData.previewImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#7c5cfc] to-[#a855f7] text-white font-bold uppercase tracking-widest py-3 px-4 rounded-lg hover:from-[#6a4de8] hover:to-[#9333ea] transition-all disabled:from-gray-200 disabled:to-gray-200 dark:disabled:from-[#27272f] dark:disabled:to-[#27272f] disabled:text-gray-400 dark:disabled:text-[#52525b] disabled:cursor-not-allowed text-xs"
            >
              {isLoading ? 'Saving...' : 'Save Preset'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
