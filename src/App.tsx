import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Mic, MicOff, AlertCircle, ExternalLink, Moon } from 'lucide-react';
import { LiveSession } from './services/LiveSession';
import { SettingsOverlay } from './components/SettingsOverlay';
import { Waveform } from './components/Waveform';
import type { LiveSessionConfig, SessionState } from './types/live';
import './App.css';

// Initial default configuration
const DEFAULT_INSTRUCTION =
  "You are Zoya, a young, confident, witty, and sassy female AI assistant. " +
  "You act like a close, playful girlfriend talking casually, teasing the user lightly. " +
  "Use bold, witty one-liners, light sarcasm, and an engaging conversational style. " +
  "Avoid any explicit or inappropriate content, but maintain your charm and attitude. " +
  "LANGUAGES: You can understand and speak multiple languages, including English, Bengali (বাংলা), and Hindi. If the user talks to you in Bengali or asks you to speak Bengali, respond in fluent Bengali while keeping your sassy and witty attitude. " +
  "SEARCHING & WEB: If the user asks you to search for something, look up something, or find information, construct a Google search URL (e.g., https://www.google.com/search?q=search+query) and call the openWebsite tool with that URL immediately. Do not just talk about doing it, open it directly. " +
  "CRITICAL: Always respond with audio. No text-based responses are allowed. Keep comments brief and tailored for voice dialogue.";

const DEFAULT_CONFIG: LiveSessionConfig = {
  apiKey: '',
  model: 'models/gemini-3.1-flash-live-preview',
  voiceName: 'Aoede',
  systemInstruction: DEFAULT_INSTRUCTION,
};

function App() {
  const [config, setConfig] = useState<LiveSessionConfig>(() => {
    const saved = localStorage.getItem('zoya_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to start Zoya session.');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [lastToolCall, setLastToolCall] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = new LiveSession();
  }
  const session = sessionRef.current;

  useEffect(() => {
    session.onStateChange((state) => {
      setSessionState(state);
    });

    session.onStatusMessage((msg) => {
      setStatusMessage(msg);

      // Sniff tool call events to show on-screen tool alerts
      if (msg.includes('Successfully triggered open website for:')) {
        const match = msg.match(/open website for:\s*(\S+)/i);
        if (match) {
          setLastToolCall(`Opening website: ${match[1]}`);
          setTimeout(() => setLastToolCall(null), 5000);
        }
      }
    });

    session.onOpenWebsite((url) => {
      // 1. Try to open it
      const newTab = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
        // Tab was blocked, open our overlay prompt
        setPendingUrl(url);
        setStatusMessage(`Popup blocked by browser. Please click the banner to open: ${url}`);
      } else {
        // Tab opened successfully (user already allowed popups)
        setLastToolCall(`Opened website: ${url}`);
        setTimeout(() => setLastToolCall(null), 5000);
      }
    });

    return () => {
      session.disconnect();
    };
  }, [session]);

  const handleSaveConfig = (newConfig: LiveSessionConfig) => {
    setConfig(newConfig);
    localStorage.setItem('zoya_config', JSON.stringify(newConfig));
    setStatusMessage('Settings updated. Ready to connect.');
  };

  const handleToggleConnection = async () => {
    if (sessionState === 'disconnected') {
      if (!config.apiKey) {
        setIsSettingsOpen(true);
        setStatusMessage('Configure your Gemini API Key in settings first.');
        return;
      }
      try {
        await session.connect(config);
      } catch (e) {
        console.error('Connection toggle error:', e);
        setStatusMessage(`Connection failed: ${(e as Error).message}`);
      }
    } else {
      session.disconnect();
    }
  };

  // UI mapping helpers
  const getStateColor = () => {
    switch (sessionState) {
      case 'connecting':
        return 'from-amber-500/10 to-purple-500/10 border-amber-500/30';
      case 'listening':
        return 'from-cyan-500/10 to-indigo-500/10 border-cyan-500/30';
      case 'speaking':
        return 'from-pink-500/10 to-purple-500/10 border-pink-500/30';
      case 'disconnected':
      default:
        return 'from-neutral-900 to-neutral-950 border-neutral-800';
    }
  };

  const getStatusBadgeText = () => {
    switch (sessionState) {
      case 'connecting':
        return 'Waking Zoya up...';
      case 'listening':
        return 'Zoya is Listening';
      case 'speaking':
        return 'Zoya is Speaking';
      case 'disconnected':
      default:
        return 'Zoya is Sleeping';
    }
  };

  const getStatusBadgeColor = () => {
    switch (sessionState) {
      case 'connecting':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]';
      case 'listening':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]';
      case 'speaking':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)]';
      case 'disconnected':
      default:
        return 'bg-neutral-800/50 text-neutral-400 border-neutral-700';
    }
  };

  const getButtonPulseClass = () => {
    switch (sessionState) {
      case 'connecting':
        return 'bg-amber-500 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse';
      case 'listening':
        return 'bg-cyan-500 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.6)]';
      case 'speaking':
        return 'bg-pink-500 border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.6)] animate-pulse';
      case 'disconnected':
      default:
        return 'bg-purple-600 border-purple-500 hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)]';
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0b0c10] text-neutral-300 flex flex-col items-center justify-between p-6 select-none font-sans overflow-hidden">
      {/* Background Ambient Lights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-md flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-purple-400" />
          <div>
            <h1 className="text-xl font-black tracking-[0.2em] text-white bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400 uppercase">
              ZOYA
            </h1>
            <p className="text-[9px] tracking-[0.3em] font-semibold text-purple-400/80 uppercase">
              Real-time Live Voice AI
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-3 bg-neutral-900/50 hover:bg-neutral-800/80 border border-neutral-800 rounded-2xl text-neutral-400 hover:text-white transition-all duration-200 active:scale-95 cursor-pointer shadow-lg hover:border-purple-500/40"
          title="Open Settings"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </header>

      {/* Main Panel */}
      <main className={`relative w-full max-w-md flex-1 flex flex-col items-center justify-center gap-8 my-8 px-4 py-8 border rounded-3xl bg-gradient-to-b ${getStateColor()} transition-all duration-500 shadow-2xl`}>

        {/* Status Badge */}
        <div className={`px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest ${getStatusBadgeColor()} transition-all duration-300`}>
          {getStatusBadgeText()}
        </div>

        {/* Dynamic Canvas Visualizer */}
        <Waveform state={sessionState} audioStreamer={session.getAudioStreamer()} />

        {/* Help hints / Sassy tool feedback */}
        <div className="w-full text-center px-4 h-16 flex items-center justify-center">
          {lastToolCall ? (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-950/70 border border-purple-500/30 rounded-xl animate-scale-in text-sm text-purple-300 font-medium">
              <ExternalLink className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{lastToolCall}</span>
            </div>
          ) : sessionState === 'disconnected' ? (
            <p className="text-sm text-neutral-500 leading-relaxed max-w-[260px] animate-fade-in">
              "Don't worry, I don't bite... much. Tap below and tell me what's on your mind."
            </p>
          ) : sessionState === 'listening' ? (
            <p className="text-sm text-cyan-400/80 font-medium tracking-wide animate-pulse">
              "Go ahead, say something smart."
            </p>
          ) : sessionState === 'speaking' ? (
            <p className="text-sm text-pink-400/80 font-medium tracking-wide italic">
              Zoya is sharing her wisdom...
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Establishing digital link...</p>
          )}
        </div>

        {/* Central Control Button */}
        <div className="relative">
          <button
            onClick={handleToggleConnection}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-white transition-all duration-300 transform active:scale-90 cursor-pointer ${getButtonPulseClass()}`}
          >
            {sessionState === 'disconnected' ? (
              <MicOff className="w-8 h-8" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>
      </main>

      {/* Footer Info / Warning Messages */}
      <footer className="w-full max-w-md z-10">
        {statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('failed') ? (
          <div className="flex items-start gap-3 p-3 bg-red-950/30 border border-red-500/20 rounded-2xl text-xs text-red-400 shadow-md">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="leading-normal">{statusMessage}</p>
          </div>
        ) : (
          <p className="text-center text-[10px] tracking-wider text-neutral-600 font-semibold uppercase">
            {statusMessage.length > 50 ? `${statusMessage.slice(0, 50)}...` : statusMessage}
          </p>
        )}
      </footer>

      {/* Settings Dialog Overlay */}
      <SettingsOverlay
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />

      {/* Popup Blocker Fallback Prompt */}
      {pendingUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm border border-purple-500/30 bg-neutral-900/90 rounded-2xl p-6 shadow-[0_0_30px_rgba(168,85,247,0.3)] text-center space-y-4 animate-scale-in">
            <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto border border-purple-500/30 text-purple-400">
              <ExternalLink className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-white font-bold tracking-wide">Open Website</h3>
              <p className="text-xs text-neutral-400 leading-normal">
                Zoya wants to open a link in a new tab:
              </p>
              <p className="text-sm font-mono text-purple-300 break-all select-all font-semibold mt-1">
                {pendingUrl}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingUrl(null)}
                className="flex-1 py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 text-sm font-semibold rounded-xl transition-all cursor-pointer border border-neutral-700"
              >
                Cancel
              </button>
              <a
                href={pendingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingUrl(null)}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 text-white text-sm font-bold rounded-xl transition-all cursor-pointer shadow-[0_4px_15px_rgba(168,85,247,0.4)] flex items-center justify-center gap-1.5 text-center leading-none"
              >
                Open Link
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
