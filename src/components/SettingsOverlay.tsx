import React, { useState } from 'react';
import { Eye, EyeOff, X, Save, Settings } from 'lucide-react';
import type { LiveSessionConfig } from '../types/live';

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  config: LiveSessionConfig;
  onSave: (newConfig: LiveSessionConfig) => void;
}

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [voiceName, setVoiceName] = useState(config.voiceName);
  const [systemInstruction, setSystemInstruction] = useState(config.systemInstruction);
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      apiKey: apiKey.trim(),
      model: model.trim(),
      voiceName,
      systemInstruction: systemInstruction.trim(),
    });
    onClose();
  };

  const voices = [
    { value: 'Aoede', label: 'Aoede (Female - Clear, expressive, recommended)' },
    { value: 'Kore', label: 'Kore (Female - Friendly, witty)' },
    { value: 'Leda', label: 'Leda (Female - Sassy, mature)' },
    { value: 'Puck', label: 'Puck (Male - Casual, playful)' },
    { value: 'Charon', label: 'Charon (Male - Deep, confident)' },
    { value: 'Fenrir', label: 'Fenrir (Male - Sharp, energetic)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden border border-white/10 bg-neutral-900/80 backdrop-blur-xl rounded-2xl shadow-[0_0_50px_rgba(168,85,247,0.15)] animate-scale-in">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500" />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold tracking-wide text-white uppercase">Zoya Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all pr-12 font-mono text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-500 hover:text-neutral-300"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Your key is saved locally in your browser and sent directly to Google's API servers.
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="models/gemini-3.1-flash-live-preview"
              className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono text-sm"
              required
            />
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              Voice Tone
            </label>
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm appearance-none cursor-pointer"
            >
              {voices.map((v) => (
                <option key={v.value} value={v.value} className="bg-neutral-900">
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* System Instructions (Persona Definition) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              Zoya Persona (System Instruction)
            </label>
            <textarea
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm leading-relaxed"
              required
            />
          </div>

          {/* Save Button */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-98 text-white font-bold tracking-wider rounded-xl transition-all shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_4px_30px_rgba(168,85,247,0.5)] cursor-pointer text-sm uppercase"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
};
