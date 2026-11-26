import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, X, Save, Settings, Users, UserPlus, Trash2, MessageSquare, Lock, Mic, ShieldCheck, UserCheck, Activity, Smartphone, QrCode, RefreshCw, CheckCircle2, User, Sparkles, Brain, Bookmark } from 'lucide-react';
import type { LiveSessionConfig } from '../types/live';
import { voiceBiometrics, type SpeakerProfile, type AcousticFeatures } from '../services/VoiceBiometrics';
import {
  customizePromptForUser,
  buildPersonaInstruction,
  DEFAULT_USER_NAME,
  DEFAULT_USER_TITLE
} from '../utils/personality';

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  config: LiveSessionConfig;
  onSave: (newConfig: LiveSessionConfig) => void;
  onTestNotification?: () => void;
  initialTab?: 'settings' | 'whatsapp' | 'voicelock' | 'contacts' | 'memory';
}

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  onTestNotification,
  initialTab,
}) => {
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);
  const [voiceName, setVoiceName] = useState(config.voiceName);
  const [systemInstruction, setSystemInstruction] = useState(config.systemInstruction);
  const [showKey, setShowKey] = useState(false);
  const [visualizerTheme, setVisualizerTheme] = useState(config.visualizerTheme || 'neon-quantum');
  const [voicePersona, setVoicePersona] = useState(config.voicePersona || 'cute-girl');
  const [userName, setUserName] = useState(config.userName || DEFAULT_USER_NAME);
  const [userTitle, setUserTitle] = useState(config.userTitle || DEFAULT_USER_TITLE);
  const [announcerVoiceName, setAnnouncerVoiceName] = useState(config.announcerVoiceName || '');
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        setSystemVoices(window.speechSynthesis.getVoices());
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // WhatsApp Config States
  const [whatsappEnabled, setWhatsappEnabled] = useState(config.whatsappEnabled !== false);
  const [whatsappShowBanner, setWhatsappShowBanner] = useState(config.whatsappShowBanner !== false);
  const [whatsappLanguage, setWhatsappLanguage] = useState(config.whatsappLanguage || 'bn-IN');
  const [whatsappAnnounceContent, setWhatsappAnnounceContent] = useState(config.whatsappAnnounceContent !== false);
  const [whatsappSpeechRate, setWhatsappSpeechRate] = useState(config.whatsappSpeechRate ?? 0.95);
  const [whatsappSpeechPitch, setWhatsappSpeechPitch] = useState(config.whatsappSpeechPitch ?? 1.0);
  const [whatsappAlertSound, setWhatsappAlertSound] = useState(config.whatsappAlertSound || 'beep');
  const [whatsappIgnoreGroups, setWhatsappIgnoreGroups] = useState(config.whatsappIgnoreGroups || false);

  const [activeTab, setActiveTab] = useState<'settings' | 'whatsapp' | 'voicelock' | 'contacts' | 'memory'>(initialTab || 'settings');

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Direct Mobile WhatsApp Link State
  const [waStatus, setWaStatus] = useState<{
    status: string;
    connected: boolean;
    qr: string | null;
    userJid: string | null;
    userName: string | null;
  }>({
    status: 'disconnected',
    connected: false,
    qr: null,
    userJid: null,
    userName: null,
  });
  const [waLoading, setWaLoading] = useState(false);
  const [waTestContact, setWaTestContact] = useState('sahil');
  const [waTestMessage, setWaTestMessage] = useState('');
  const [waTestStatus, setWaTestStatus] = useState<string | null>(null);
  const [waTestLoading, setWaTestLoading] = useState(false);

  const handleSendTestWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waTestMessage.trim()) return;
    setWaTestLoading(true);
    setWaTestStatus(null);
    try {
      const res = await fetch('/api/control?action=send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-whatsapp',
          contact: waTestContact,
          message: waTestMessage,
        })
      });
      const data = await res.json();
      if (data.success) {
        setWaTestStatus(`সফলভাবে পাঠানো হয়েছে: "${waTestMessage}"`);
        setWaTestMessage('');
      } else {
        setWaTestStatus(`ব্যর্থ: ${data.error || 'পাঠানো যায়নি'}`);
      }
    } catch (e: any) {
      setWaTestStatus(`Error: ${e.message}`);
    } finally {
      setWaTestLoading(false);
    }
  };

  useEffect(() => {
    let timer: any = null;
    const fetchWaStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (data && data.success) {
          setWaStatus({
            status: data.status,
            connected: data.connected,
            qr: data.qr,
            userJid: data.userJid,
            userName: data.userName,
          });
        }
      } catch (e) {}
    };

    if (isOpen && activeTab === 'whatsapp') {
      fetchWaStatus();
      timer = setInterval(fetchWaStatus, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, activeTab]);

  const handleDisconnectWhatsApp = async () => {
    setWaLoading(true);
    try {
      await fetch('/api/whatsapp/logout', { method: 'POST' });
      setWaStatus({
        status: 'disconnected',
        connected: false,
        qr: null,
        userJid: null,
        userName: null,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setWaLoading(false);
    }
  };

  const handleConnectFreshWhatsApp = async () => {
    setWaLoading(true);
    try {
      const res = await fetch('/api/whatsapp/connect-fresh', { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        setWaStatus({
          status: data.status,
          connected: data.connected,
          qr: data.qr,
          userJid: data.userJid,
          userName: data.userName,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setWaLoading(false);
    }
  };

  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Multi-Speaker Voice Biometrics States
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>(() => voiceBiometrics.loadProfiles());
  const [bossPitchVal, setBossPitchVal] = useState<number | null>(() => {
    const boss = voiceBiometrics.getBossProfile();
    return boss ? boss.pitchMedian : null;
  });
  const [bossSensitivityVal, setBossSensitivityVal] = useState<number>(() => {
    const saved = localStorage.getItem('zoya_boss_sensitivity');
    return saved ? parseInt(saved, 10) : 70;
  });
  const [enrollRole, setEnrollRole] = useState<'boss' | 'friend'>('boss');
  const [enrollName, setEnrollName] = useState('Siba Boss');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(0);
  const [calibrationStatus, setCalibrationStatus] = useState('Ready to calibrate');
  const [calibrationMicLevel, setCalibrationMicLevel] = useState(0);

  // Live recognition test inside Settings
  const [isLiveTesting, setIsLiveTesting] = useState(false);
  const [liveTestResult, setLiveTestResult] = useState<{
    speakerName: string;
    role: string;
    confidence: number;
    pitch: number;
    status: string;
  } | null>(null);

  // Hugging Face Integration Token
  const [hfToken, setHfToken] = useState<string>(() => {
    return localStorage.getItem('zoya_hf_token') || '';
  });
  const [showHfToken, setShowHfToken] = useState(false);
  const [hfSaved, setHfSaved] = useState(false);

  const handleSaveHfToken = (token: string) => {
    setHfToken(token);
    localStorage.setItem('zoya_hf_token', token.trim());
    setHfSaved(true);
    setTimeout(() => setHfSaved(false), 2500);
  };


  // Zoya Long-Term Memory State
  const [memoryData, setMemoryData] = useState<{
    userProfile?: any;
    preferences?: any;
    importantPeople?: any[];
    facts?: Array<{ id: string; text: string; category?: string; date?: string }>;
  }>({});
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [newMemoryFact, setNewMemoryFact] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState('fact');
  const [memoryStatusMsg, setMemoryStatusMsg] = useState('');

  const fetchMemory = async () => {
    setMemoryLoading(true);
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.memory) {
          setMemoryData(data.memory);
        }
      }
    } catch (e) {
      console.error('Failed to fetch memory:', e);
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryFact.trim()) return;

    try {
      const res = await fetch('/api/memory/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: newMemoryFact.trim(), category: newMemoryCategory }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setNewMemoryFact('');
          setMemoryStatusMsg(`Saved to memory: "${newMemoryFact.trim()}"`);
          setTimeout(() => setMemoryStatusMsg(''), 3000);
          fetchMemory();
        }
      }
    } catch (e: any) {
      setMemoryStatusMsg(`Error: ${e.message}`);
    }
  };

  const handleDeleteMemory = async (id: string, text?: string) => {
    try {
      const res = await fetch('/api/memory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      });
      if (res.ok) {
        setMemoryStatusMsg('Memory item removed');
        setTimeout(() => setMemoryStatusMsg(''), 3000);
        fetchMemory();
      }
    } catch (e: any) {
      setMemoryStatusMsg(`Error: ${e.message}`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchContacts();
      fetchMemory();
    }
  }, [isOpen]);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/control?action=get-contacts');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.contacts) {
          setContacts(data.contacts);
        }
      }
    } catch (e) {
      console.error('Failed to fetch contacts:', e);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;

    try {
      const url = `/api/control?action=add-contact&name=${encodeURIComponent(newContactName.trim())}&phone=${encodeURIComponent(newContactPhone.trim())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setNewContactName('');
          setNewContactPhone('');
          setStatusMsg(`Successfully added "${newContactName.trim()}"`);
          setTimeout(() => setStatusMsg(''), 3000);
          fetchContacts();
        } else {
          setStatusMsg(`Error: ${data.error || 'Failed to add contact'}`);
        }
      }
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    }
  };

  const handleDeleteContact = async (name: string) => {
    try {
      const url = `/api/control?action=delete-contact&name=${encodeURIComponent(name)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatusMsg(`Deleted "${name}"`);
          setTimeout(() => setStatusMsg(''), 3000);
          fetchContacts();
        }
      }
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    }
  };

  // Live recognition test effect
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;

    if (isLiveTesting) {
      const startLiveTest = async () => {
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);

          const dataArray = new Float32Array(analyser.fftSize);
          let silenceFrames = 0;

          const checkLoop = () => {
            analyser.getFloatTimeDomainData(dataArray);
            const res = voiceBiometrics.identifySpeaker(dataArray, 16000, bossSensitivityVal);
            if (res.status !== 'silence') {
              silenceFrames = 0;
              setLiveTestResult({
                speakerName: res.speaker ? res.speaker.name : 'Unknown / Stranger',
                role: res.speaker ? res.speaker.role : 'stranger',
                confidence: res.confidence,
                pitch: Math.round(res.pitch),
                status: res.status,
              });
            } else {
              silenceFrames++;
              if (silenceFrames > 40) {
                setLiveTestResult(null);
              }
            }
            animationFrameId = requestAnimationFrame(checkLoop);
          };

          animationFrameId = requestAnimationFrame(checkLoop);
        } catch (err) {
          console.error('Failed to start live test:', err);
          setIsLiveTesting(false);
        }
      };

      startLiveTest();
    } else {
      setLiveTestResult(null);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
    };
  }, [isLiveTesting, bossSensitivityVal]);

  const handleEnrollSpeaker = async (role: 'boss' | 'friend', name: string) => {
    try {
      setIsCalibrating(true);
      setCalibrationCountdown(6);
      setCalibrationStatus(role === 'boss' ? '১/৩: স্পষ্ট করে বলুন: "জয়া, কেমন আছো? আমি শিবা বলছি..."' : `১/৩: Speak naturally as ${name}...`);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);
      const collectedFrames: AcousticFeatures[] = [];
      const startTime = Date.now();

      const countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = 6 - elapsed;
        if (remaining >= 0) {
          setCalibrationCountdown(remaining);
          if (role === 'boss') {
            if (remaining > 4) {
              setCalibrationStatus('১/৩: স্বাভাবিক স্বরে বলুন: "জয়া, কেমন আছো? আমি শিবা বলছি..."');
            } else if (remaining > 2) {
              setCalibrationStatus('২/৩: সংখ্যা বলুন: "এক, দুই, তিন, চার, পাঁচ..."');
            } else {
              setCalibrationStatus('৩/৩: বায়োমেট্রিক পিচ ও ভোকাল ট্র্যাক বিশ্লেষণ হচ্ছে...');
            }
          }
        }
      }, 300);

      const loop = () => {
        if (Date.now() - startTime > 6200) {
          clearInterval(countdownInterval);
          stream.getTracks().forEach(t => t.stop());
          audioCtx.close();
          setCalibrationMicLevel(0);

          if (collectedFrames.length < 8) {
            setCalibrationStatus('ব্যর্থ হয়েছে! স্পষ্ট শব্দ শোনা যায়নি। মাইক্রোফোনের কাছে গিয়ে আবার বলুন।');
            setIsCalibrating(false);
            return;
          }

          const profile = voiceBiometrics.enrollSpeaker(
            name.trim() || (role === 'boss' ? 'Siba Boss' : 'Friend'),
            role,
            collectedFrames
          );
          const updated = voiceBiometrics.getProfiles();
          setSpeakerProfiles([...updated]);
          if (role === 'boss') {
            setBossPitchVal(profile.pitchMedian);
          }
          setCalibrationStatus(`সফল! ${profile.name}-এর ভয়েসপ্রিন্ট যুক্ত হয়েছে (${profile.pitchMedian.toFixed(1)}Hz + 12-Band MFCC).`);
          setIsCalibrating(false);
          return;
        }

        analyser.getFloatTimeDomainData(dataArray);
        const features = voiceBiometrics.extractFeatures(dataArray, 16000);
        if (features) {
          setCalibrationMicLevel(Math.min(100, Math.round(features.rms * 400)));
          if (features.pitch > 60) {
            collectedFrames.push(features);
          }
        } else {
          setCalibrationMicLevel(0);
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    } catch (e: any) {
      console.error(e);
      setCalibrationStatus(`Error: Microphone access denied or failed (${e.message})`);
      setIsCalibrating(false);
      setCalibrationMicLevel(0);
    }
  };

  const handleDeleteSpeaker = (id: string) => {
    voiceBiometrics.deleteProfile(id);
    const updated = voiceBiometrics.getProfiles();
    setSpeakerProfiles([...updated]);
    if (!voiceBiometrics.getBossProfile()) {
      setBossPitchVal(null);
    }
    setCalibrationStatus('Speaker voiceprint removed.');
  };

  const handleSaveSensitivity = (val: number) => {
    setBossSensitivityVal(val);
    localStorage.setItem('zoya_boss_sensitivity', val.toString());
    localStorage.setItem('zoya_boss_pitch_sensitivity', val.toString());
  };

  if (!isOpen) return null;

  const handleNameChange = (newName: string) => {
    const prevName = userName;
    setUserName(newName);
    setSystemInstruction((prev) => customizePromptForUser(prev, newName, userTitle, prevName, userTitle));
  };

  const handleTitleChange = (newTitle: string) => {
    const prevTitle = userTitle;
    setUserTitle(newTitle);
    setSystemInstruction((prev) => customizePromptForUser(prev, userName, newTitle, userName, prevTitle));
  };

  const handlePersonaChange = (newPersona: string) => {
    setVoicePersona(newPersona as any);
    
    let targetVoice = 'Aoede';
    if (newPersona === 'sassy-bff') targetVoice = 'Kore';
    else if (newPersona === 'cyber-assistant') targetVoice = 'Charon';
    else if (newPersona === 'anime-sister') targetVoice = 'Aoede';
    else if (newPersona === 'playful-puppy') targetVoice = 'Puck';
    else if (newPersona === 'kid-voice') targetVoice = 'Puck';
    else if (newPersona === 'female-voice') targetVoice = 'Kore';
    else if (newPersona === 'sweet-female') targetVoice = 'Aoede';
    
    setVoiceName(targetVoice);
    setSystemInstruction(buildPersonaInstruction(newPersona, userName, userTitle));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...config,
      apiKey: apiKey.trim(),
      model: model.trim(),
      voiceName,
      systemInstruction: systemInstruction.trim(),
      userName: userName.trim() || DEFAULT_USER_NAME,
      userTitle: userTitle.trim() || DEFAULT_USER_TITLE,
      visualizerTheme,
      voicePersona,
    });
    onClose();
  };

  const handleSaveWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...config,
      whatsappEnabled,
      whatsappShowBanner,
      whatsappLanguage,
      whatsappAnnounceContent,
      whatsappSpeechRate,
      whatsappSpeechPitch,
      whatsappAlertSound,
      whatsappIgnoreGroups,
      announcerVoiceName,
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
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-white/5 bg-neutral-950/30">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'border-purple-500 text-purple-400 bg-white/5'
                : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'whatsapp'
                ? 'border-purple-500 text-purple-400 bg-white/5'
                : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'memory'
                ? 'border-purple-500 text-purple-400 bg-white/5'
                : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Brain className="w-4 h-4 text-pink-400" />
            Memory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voicelock')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'voicelock'
                ? 'border-purple-500 text-purple-400 bg-white/5'
                : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Lock className="w-4 h-4" />
            Voice Lock
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold tracking-wider uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === 'contacts'
                ? 'border-purple-500 text-purple-400 bg-white/5'
                : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            Contacts
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[480px] custom-scrollbar">
            {/* User Identity / Personalization */}
            <div className="p-4 bg-gradient-to-r from-purple-900/30 via-pink-900/20 to-neutral-900/50 border border-purple-500/30 rounded-2xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                    User Identity / আপনার নাম ও উপাধি
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center gap-1 font-medium">
                  <Sparkles className="w-3 h-3 text-purple-400" /> Customizable
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                জয়া আপনাকে কী নামে এবং কী উপাধিতে ডাকবে তা এখানে লিখুন (যেমন: নিজের নাম ও Boss/ভায়া/স্যার):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase mb-1">
                    Your Name (আপনার নাম)
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Siba / রাহুল / Alex"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase mb-1">
                    Call You As (কী উপাধিতে ডাকবে)
                  </label>
                  <input
                    type="text"
                    value={userTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Boss / ভাইয়া / Sir / Friend"
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-white/10 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 text-sm font-medium"
                  />
                </div>
              </div>
              <div className="text-xs text-purple-200/90 bg-purple-950/40 p-2.5 rounded-xl border border-purple-800/30 flex items-center justify-between">
                <span>✨ জয়া আপনাকে যেভাবে ডাকবে:</span>
                <span className="font-bold text-white px-2.5 py-1 bg-purple-600/30 border border-purple-500/40 rounded-lg">
                  {userName || 'User'} {userTitle ? userTitle : ''}
                </span>
              </div>
            </div>

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
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-500 hover:text-neutral-300 cursor-pointer"
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

            {/* Voice Persona Selector */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
                Zoya Persona / Character
              </label>
              <select
                value={voicePersona}
                onChange={(e) => handlePersonaChange(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm cursor-pointer"
              >
                <option value="cute-girl" className="bg-neutral-900">Cute Little Girl (Sweet, helpful, little sister)</option>
                <option value="sweet-female" className="bg-neutral-900">Sweet Female (Soft, warm, polite female companion)</option>
                <option value="kid-voice" className="bg-neutral-900">Kid Voice (Innocent child assistant, Puck)</option>
                <option value="female-voice" className="bg-neutral-900">Professional Female (Capable, direct female voice, Kore)</option>
                <option value="sassy-bff" className="bg-neutral-900">Sassy BFF (Cool teen, sarcastic, witty friend)</option>
                <option value="cyber-assistant" className="bg-neutral-900">Cyber Butler (Futuristic sci-fi, professional & direct)</option>
                <option value="anime-sister" className="bg-neutral-900">Anime Imouto (Big brother loving, high anime energy)</option>
                <option value="playful-puppy" className="bg-neutral-900">Playful Chibi Puppy (Goofy dog sounds, highly energetic)</option>
              </select>
            </div>

            {/* Voice Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
                Gemini Live Voice Tone
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

            {/* Visualizer Theme */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold tracking-wider text-neutral-300 uppercase">
                Visualizer Animation style
              </label>
              <select
                value={visualizerTheme}
                onChange={(e) => setVisualizerTheme(e.target.value as any)}
                className="w-full px-4 py-3 bg-neutral-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm cursor-pointer"
              >
                <option value="neon-quantum" className="bg-neutral-900">Neon Quantum (Standard concentric rings)</option>
                <option value="cosmic-nebula" className="bg-neutral-900">Cosmic Nebula (Swirling starlight gas cloud)</option>
                <option value="retro-equalizer" className="bg-neutral-900">Retro Equalizer (Outward circular bars)</option>
                <option value="stellar-orbit" className="bg-neutral-900">Stellar Orbit (Multi-ring counter orbits)</option>
                <option value="liquid-aura" className="bg-neutral-900">Liquid Aura (Apple Intelligence organic flow)</option>
              </select>
            </div>

            {/* System Instructions */}
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
        )}

        {activeTab === 'whatsapp' && (
          <form onSubmit={handleSaveWhatsApp} className="p-6 space-y-5 overflow-y-auto max-h-[480px] custom-scrollbar">
            {/* Header / Intro */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase">
                  WhatsApp Announcement & Mobile Link
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Connect mobile WhatsApp directly & configure voice announcement options.
                </p>
              </div>
            </div>

            {/* Direct Mobile WhatsApp Link (QR Code) */}
            <div className={`p-4 rounded-2xl border backdrop-blur-md transition-all ${
              waStatus.connected
                ? 'bg-emerald-950/40 border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : 'bg-neutral-950/60 border-purple-500/30 shadow-lg'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl border ${
                    waStatus.connected
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  }`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      ডিরেক্ট মোবাইল লিঙ্ক (QR Code)
                      {waStatus.connected ? (
                        <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-neutral-800 text-neutral-400 border border-neutral-700 rounded-full">
                          Disconnected
                        </span>
                      )}
                    </h4>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      ল্যাপটপের কোনো অ্যাপ ছাড়া ইন্টারনেট থেকে সরাসরি আপনার ফোন Zoya-র সাথে যুক্ত থাকে
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {waStatus.connected ? (
                    <button
                      type="button"
                      onClick={handleDisconnectWhatsApp}
                      disabled={waLoading}
                      className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[10px] font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnectFreshWhatsApp}
                      disabled={waLoading}
                      className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-[10px] font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <RefreshCw className={`w-3 h-3 ${waLoading ? 'animate-spin' : ''}`} /> Scan New QR
                    </button>
                  )}
                </div>
              </div>

              {/* Status details / Actions */}
              {waStatus.connected ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <span className="block text-xs font-bold text-emerald-300">
                          {waStatus.userName ? `${waStatus.userName} (${waStatus.userJid?.split('@')[0]})` : (waStatus.userJid?.split('@')[0] || 'Mobile Account Linked')}
                        </span>
                        <span className="block text-[10px] text-emerald-500/90 mt-0.5">
                          মোবাইল লিঙ্ক সক্রিয়! মেসেজ আসা-যাওয়া সরাসরি ব্যাকগ্রাউন্ডে চলছে।
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Message Test Box */}
                  <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-2.5">
                    <div className="text-[11px] font-bold text-purple-300 flex items-center justify-between">
                      <span>ডাইরেক্ট মেসেজ টেস্ট (Direct Message Send Test)</span>
                      <span className="text-[9px] text-neutral-400">ল্যাপটপ না খুলে ব্যাকগ্রাউন্ডে পাঠান</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={waTestContact}
                        onChange={(e) => setWaTestContact(e.target.value)}
                        placeholder="নাম বা ফোন (যেমন: sahil, মা)"
                        className="px-2.5 py-1.5 text-xs bg-neutral-900 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                      />
                      <input
                        type="text"
                        value={waTestMessage}
                        onChange={(e) => setWaTestMessage(e.target.value)}
                        placeholder="মেসেজ লিখুন..."
                        className="col-span-2 px-2.5 py-1.5 text-xs bg-neutral-900 border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {waTestStatus ? (
                        <span className={`text-[10px] font-medium ${waTestStatus.startsWith('সফল') ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {waTestStatus}
                        </span>
                      ) : <span className="text-[10px] text-neutral-500">মেসেজ সরাসরি আপনার ফোন থেকে চলে যাবে</span>}
                      <button
                        type="button"
                        onClick={handleSendTestWhatsApp}
                        disabled={waTestLoading || !waTestMessage.trim()}
                        className="px-3 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all"
                      >
                        {waTestLoading ? 'পাঠানো হচ্ছে...' : 'মেসেজ পাঠান'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : waStatus.qr ? (
                <div className="mt-4 flex flex-col items-center text-center space-y-3 bg-black/40 p-4 rounded-2xl border border-purple-500/30">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-purple-400" /> মোবাইল দিয়ে নিচের কিউআর কোডটি স্ক্যান করুন
                  </span>
                  <div className="p-2.5 bg-white rounded-2xl shadow-2xl">
                    <img src={waStatus.qr} alt="WhatsApp QR Code" className="w-48 h-48 block" />
                  </div>
                  <div className="text-[10px] text-neutral-300 text-left bg-neutral-900/80 p-3 rounded-xl border border-white/5 space-y-1 w-full max-w-xs">
                    <p className="font-semibold text-white">সহজ ৩টি ধাপ:</p>
                    <p>১. আপনার ফোনে <b>WhatsApp</b> অ্যাপটি খুলুন।</p>
                    <p>২. উপরে ৩টি ডট (Android) বা Settings (iPhone) &gt; <b>Linked Devices</b>-এ যান।</p>
                    <p>৩. <b>Link a Device</b>-এ ট্যাপ করে এই কোডটি স্ক্যান করুন।</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[10px] text-neutral-400">
                    ল্যাপটপ অ্যাপ ছাড়াও সরাসরি ফোন কানেক্ট করতে কিউআর কোড আনুন।
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectFreshWhatsApp}
                    disabled={waLoading}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <QrCode className="w-4 h-4" /> {waLoading ? 'Generating QR...' : 'Connect Mobile WhatsApp'}
                  </button>
                </div>
              )}
            </div>

            {/* Enable Toggle & Show Banner */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-neutral-950/40 border border-white/5 hover:border-purple-500/30 rounded-xl cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-purple-600 focus:ring-purple-500 bg-neutral-900 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-semibold text-white">Enable Voice</span>
                  <span className="block text-[10px] text-neutral-500">Announce incoming messages</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-neutral-950/40 border border-white/5 hover:border-purple-500/30 rounded-xl cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={whatsappShowBanner}
                  onChange={(e) => setWhatsappShowBanner(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-purple-600 focus:ring-purple-500 bg-neutral-900 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-semibold text-white">Show Toast Banner</span>
                  <span className="block text-[10px] text-neutral-500">Display visual alert popup</span>
                </div>
              </label>
            </div>

            {/* Mute Groups & Mute Content (Privacy) */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-neutral-950/40 border border-white/5 hover:border-purple-500/30 rounded-xl cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={whatsappIgnoreGroups}
                  onChange={(e) => setWhatsappIgnoreGroups(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-purple-600 focus:ring-purple-500 bg-neutral-900 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-semibold text-white">Ignore Groups</span>
                  <span className="block text-[10px] text-neutral-500">Only announce direct chats</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-neutral-950/40 border border-white/5 hover:border-purple-500/30 rounded-xl cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={whatsappAnnounceContent}
                  onChange={(e) => setWhatsappAnnounceContent(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 text-purple-600 focus:ring-purple-500 bg-neutral-900 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-semibold text-white">Read Message Body</span>
                  <span className="block text-[10px] text-neutral-500">Speak sender only if disabled</span>
                </div>
              </label>
            </div>

            {/* Language & Alert Sound selects */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                  Voice Language
                </label>
                <select
                  value={whatsappLanguage}
                  onChange={(e) => setWhatsappLanguage(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="bn-IN" className="bg-neutral-900">Bengali (bn-IN)</option>
                  <option value="en-IN" className="bg-neutral-900">English (India)</option>
                  <option value="en-US" className="bg-neutral-900">English (US)</option>
                  <option value="hi-IN" className="bg-neutral-900">Hindi (hi-IN)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                  Alert Sound
                </label>
                <select
                  value={whatsappAlertSound}
                  onChange={(e) => setWhatsappAlertSound(e.target.value as any)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="beep" className="bg-neutral-900">Double Beep</option>
                  <option value="chime" className="bg-neutral-900">Electronic Chime</option>
                  <option value="ding" className="bg-neutral-900">Classic Ding</option>
                  <option value="none" className="bg-neutral-900">Mute (None)</option>
                </select>
              </div>
            </div>

            {/* System Announcer Voice Selector */}
            <div className="space-y-1.5 p-3 bg-neutral-950/30 border border-white/5 rounded-xl">
              <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                System Announcer Voice (Local TTS)
              </label>
              <select
                value={announcerVoiceName}
                onChange={(e) => setAnnouncerVoiceName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="" className="bg-neutral-900">Auto-Select based on Language (Default)</option>
                {systemVoices.map((v) => (
                  <option key={v.name} value={v.name} className="bg-neutral-900">
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-neutral-500">
                Choose a specific voice installed on your system to speak WhatsApp notifications.
              </p>
            </div>

            {/* Speech rate slider */}
            <div className="space-y-2 p-3 bg-neutral-950/30 border border-white/5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                  Voice Speech Speed
                </label>
                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  {whatsappSpeechRate}x
                </span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.05"
                value={whatsappSpeechRate}
                onChange={(e) => setWhatsappSpeechRate(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-950 border border-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
                <span>Slow (0.6x)</span>
                <span>Normal (1.0x)</span>
                <span>Fast (1.4x)</span>
              </div>
            </div>

            {/* Speech pitch slider */}
            <div className="space-y-2 p-3 bg-neutral-950/30 border border-white/5 rounded-xl">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                  Voice Pitch (Sweetness)
                </label>
                <span className="text-xs font-mono font-bold text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                  {whatsappSpeechPitch}x
                </span>
              </div>
              <input
                type="range"
                min="0.85"
                max="1.25"
                step="0.05"
                value={whatsappSpeechPitch}
                onChange={(e) => setWhatsappSpeechPitch(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-neutral-950 border border-white/5 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
                <span>Deep (0.85x)</span>
                <span>Clear & Natural (1.0x)</span>
                <span>Cute (1.2x)</span>
              </div>
            </div>

            {/* Test Action and Save Changes */}
            <div className="flex gap-3 pt-2">
              {onTestNotification && (
                <button
                  type="button"
                  onClick={onTestNotification}
                  className="flex-1 py-3 px-4 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-neutral-300 text-xs font-bold rounded-xl transition-all cursor-pointer border border-neutral-700 uppercase"
                >
                  Test Announcement
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(168,85,247,0.3)] uppercase cursor-pointer"
              >
                Save WhatsApp Settings
              </button>
            </div>
          </form>
        )}

        {activeTab === 'voicelock' && (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[480px] custom-scrollbar">
            {/* Header / Info */}
            <div className="space-y-2 text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600/20 to-pink-600/20 border border-purple-500/30 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(168,85,247,0.2)]">
                <ShieldCheck className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
                Speaker Recognition & Voice Biometrics
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-md mx-auto">
                Zoya analyzes 12-band Mel spectral formants + pitch frequency to identify who is speaking (Siba Boss vs Friends vs Strangers).
              </p>
            </div>

            {/* Hugging Face AI Integration Card */}
            <div className="p-4 bg-neutral-950/70 border border-purple-500/30 rounded-2xl space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-lg">
                    🤗
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Hugging Face AI Engine</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {hfSaved ? '✓ Saved & Updated' : 'Connected & Active'}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      Access Token for AI Voice Biometrics & Speaker Models
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <input
                    type={showHfToken ? 'text' : 'password'}
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    placeholder="hf_..."
                    className="w-full px-3 py-2 pr-10 bg-neutral-900 border border-white/10 rounded-xl text-white placeholder-neutral-600 text-xs font-mono focus:outline-none focus:border-purple-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowHfToken(!showHfToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title={showHfToken ? 'Hide Token' : 'Show Token'}
                  >
                    {showHfToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveHfToken(hfToken)}
                  className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-95 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shadow-[0_2px_10px_rgba(168,85,247,0.3)]"
                >
                  Save Token
                </button>
              </div>
            </div>

            {/* Enrolled Profiles List */}
            <div className="p-4 bg-neutral-950/50 border border-white/10 rounded-2xl space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                  Enrolled Voiceprints ({speakerProfiles.length})
                </span>
                <span className="text-[10px] text-neutral-400">
                  {bossPitchVal ? '👑 Boss Voice Locked' : '⚠️ No Boss Voice Locked'}
                </span>
              </div>

              {speakerProfiles.length === 0 ? (
                <div className="py-4 text-center text-xs text-neutral-500">
                  No voice profiles enrolled yet. Enroll your voice below to train Zoya!
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {speakerProfiles.map((sp) => (
                    <div
                      key={sp.id}
                      className="p-3 bg-neutral-900/60 border border-white/5 rounded-xl flex items-center justify-between gap-3 hover:border-purple-500/30 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg ${sp.role === 'boss' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'}`}>
                          {sp.role === 'boss' ? '👑' : '👤'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{sp.name}</span>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${sp.role === 'boss' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
                              {sp.role === 'boss' ? 'Master Boss' : 'Friend / Guest'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-400">
                            F0: {sp.pitchMedian.toFixed(1)} Hz | 12-Band Timbre Vector
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSpeaker(sp.id)}
                        className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all cursor-pointer"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Real-Time Voice Recognition Test Console */}
            <div className="p-4 bg-neutral-950/60 border border-purple-500/30 rounded-2xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className={`w-4 h-4 ${isLiveTesting ? 'text-emerald-400 animate-pulse' : 'text-neutral-400'}`} />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Live Voice Recognition Test Console
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLiveTesting(!isLiveTesting)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isLiveTesting
                      ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                      : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                  }`}
                >
                  {isLiveTesting ? '⏹ Stop Test' : '▶ Start Mic Test'}
                </button>
              </div>

              {isLiveTesting && (
                <div className="p-3 bg-neutral-900/80 border border-white/10 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Detected Speaker:</span>
                    {liveTestResult ? (
                      <span className={`font-bold flex items-center gap-1.5 ${
                        liveTestResult.status === 'boss'
                          ? 'text-emerald-400'
                          : liveTestResult.status === 'recognized'
                          ? 'text-cyan-400'
                          : 'text-red-400'
                      }`}>
                        {liveTestResult.status === 'boss' ? '👑' : liveTestResult.status === 'recognized' ? '👤' : '⚠️'}
                        {liveTestResult.status === 'stranger' ? 'Stranger / Alien Voice' : liveTestResult.speakerName} ({liveTestResult.confidence}% Match)
                      </span>
                    ) : (
                      <span className="text-neutral-500 animate-pulse">Listening for voice...</span>
                    )}
                  </div>
                  {liveTestResult && liveTestResult.pitch > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                      <span>Live Vocal Pitch:</span>
                      <span className="text-purple-300 font-bold">{liveTestResult.pitch} Hz</span>
                    </div>
                  )}
                  {/* Confidence Bar */}
                  <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        liveTestResult?.status === 'boss'
                          ? 'bg-emerald-500'
                          : liveTestResult?.status === 'recognized'
                          ? 'bg-cyan-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${liveTestResult ? liveTestResult.confidence : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Voice Enrollment Studio */}
            <div className="p-4 border border-white/10 bg-neutral-950/40 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Mic className="w-4 h-4 text-pink-400" />
                Enroll New Voice Profile
              </h4>

              {/* Role Selector Tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEnrollRole('boss');
                    setEnrollName(`${userName} ${userTitle}`.trim());
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    enrollRole === 'boss'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                      : 'bg-neutral-900 border-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  👑 {userName} {userTitle} (Master)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEnrollRole('friend');
                    setEnrollName('Friend 1');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    enrollRole === 'friend'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                      : 'bg-neutral-900 border-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  👤 Friend / Guest
                </button>
              </div>

              {/* Speaker Name Input if not boss */}
              {enrollRole === 'friend' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-neutral-400 uppercase">
                    Speaker Name / Identifier:
                  </label>
                  <input
                    type="text"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    placeholder="e.g. Rahul, Mother, Sayan..."
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-cyan-500 rounded-xl text-xs text-white outline-none"
                  />
                </div>
              )}

              {/* Enrollment Action */}
              {isCalibrating ? (
                <div className="text-center py-4 px-4 space-y-3 bg-purple-950/40 border border-purple-500/40 rounded-xl shadow-lg">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                    <div className="text-3xl font-mono font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                      {calibrationCountdown > 0 ? `${calibrationCountdown}s` : 'Analyzing...'}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-purple-200">
                    {calibrationStatus}
                  </div>
                  {/* Live mic energy bar during calibration */}
                  <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-100"
                      style={{ width: `${Math.max(5, calibrationMicLevel)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400 block font-mono">
                    Microphone Input Energy: {calibrationMicLevel}%
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-400 italic text-center">
                    {calibrationStatus}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrollSpeaker(enrollRole, enrollName)}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 active:scale-98 text-white text-xs font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(168,85,247,0.3)] uppercase cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    Record & Enroll Voiceprint (6 Seconds)
                  </button>
                </div>
              )}
            </div>

            {/* Sensitivity Adjustment */}
            <div className="space-y-2 p-3.5 bg-neutral-950/40 border border-white/5 rounded-2xl">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-semibold tracking-wider text-neutral-400 uppercase">
                  Biometric Recognition Sensitivity
                </label>
                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  {bossSensitivityVal}% Strictness
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={bossSensitivityVal}
                onChange={(e) => handleSaveSensitivity(parseInt(e.target.value))}
                className="w-full h-1.5 bg-neutral-900 border border-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
                <span>Relaxed (50%)</span>
                <span>Balanced (70%)</span>
                <span>Ultra-Strict (90%)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[480px] custom-scrollbar">
            {statusMsg && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs rounded-xl text-center">
                {statusMsg}
              </div>
            )}

            {/* Add Contact Form */}
            <form onSubmit={handleAddContact} className="space-y-4 p-4 border border-white/5 bg-neutral-950/20 rounded-xl">
              <h3 className="text-sm font-semibold tracking-wider text-purple-400 uppercase flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Add WhatsApp Contact
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    placeholder="Name (e.g. Siba)"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    placeholder="Phone (e.g. 9876543210)"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase"
              >
                Save Contact
              </button>
            </form>

            {/* Contacts List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wider text-neutral-300 uppercase">
                Existing Contacts ({Object.keys(contacts).length})
              </h3>
              {Object.keys(contacts).length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-4">No contacts added yet.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {Object.entries(contacts).map(([name, phone]) => (
                    <div key={name} className="flex items-center justify-between p-3 border border-white/5 bg-neutral-950/40 rounded-xl hover:border-white/10 transition-all">
                      <div>
                        <span className="text-sm font-semibold text-white capitalize">{name}</span>
                        <span className="ml-3 font-mono text-xs text-neutral-500">{phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(name)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                        title="Delete Contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[480px] custom-scrollbar">
            {/* Header info card */}
            <div className="p-4 bg-gradient-to-r from-purple-950/40 via-pink-950/30 to-neutral-950/60 border border-purple-500/30 rounded-2xl flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600/30 to-pink-600/30 border border-pink-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(236,72,153,0.3)]">
                  <Brain className="w-6 h-6 text-pink-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    Persistent Long-Term Memory
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-300">
                      Local JSON
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Zoya remembers these facts, preferences, and personal notes across all sessions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchMemory}
                disabled={memoryLoading}
                className="p-2.5 rounded-xl bg-neutral-900 border border-white/10 hover:border-purple-500/40 text-neutral-400 hover:text-white transition-all cursor-pointer shadow active:scale-95"
                title="Refresh Memory"
              >
                <RefreshCw className={`w-4 h-4 ${memoryLoading ? 'animate-spin text-purple-400' : ''}`} />
              </button>
            </div>

            {memoryStatusMsg && (
              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl text-xs text-purple-300 animate-fadeIn flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{memoryStatusMsg}</span>
              </div>
            )}

            {/* User Profile & Preferences Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 bg-neutral-950/40 border border-white/5 rounded-xl space-y-2">
                <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-purple-400" /> Identity Profile
                </span>
                <div className="text-xs space-y-1 text-neutral-300">
                  <p><b className="text-white">Name:</b> {memoryData.userProfile?.name || userName || 'Siba'}</p>
                  <p><b className="text-white">Title:</b> {memoryData.userProfile?.title || userTitle || 'Boss'}</p>
                  <p><b className="text-white">Role:</b> {memoryData.userProfile?.profession || 'Developer & Creator'}</p>
                  <p><b className="text-white">Language:</b> {memoryData.userProfile?.preferredLanguage || 'Bengali & English'}</p>
                </div>
              </div>

              <div className="p-3.5 bg-neutral-950/40 border border-white/5 rounded-xl space-y-2">
                <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" /> Preferences
                </span>
                <div className="text-xs space-y-1 text-neutral-300">
                  <p><b className="text-white">Favorite Singer:</b> {memoryData.preferences?.favoriteSinger || 'Arijit Singh'}</p>
                  <p><b className="text-white">Music Genre:</b> {memoryData.preferences?.favoriteMusicGenre || 'Melody / Romantic'}</p>
                  {memoryData.preferences?.interests && (
                    <p><b className="text-white">Interests:</b> {memoryData.preferences.interests.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Add Memory Form */}
            <form onSubmit={handleAddMemory} className="p-4 bg-neutral-950/50 border border-white/5 rounded-2xl space-y-3 shadow-md">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-purple-400" /> Add New Memory Item
              </span>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  type="text"
                  value={newMemoryFact}
                  onChange={(e) => setNewMemoryFact(e.target.value)}
                  placeholder="e.g. আমার প্রিয় গান অরিজিৎ সিং-এর কেশরিয়া"
                  className="md:col-span-3 px-3 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-sans"
                />
                <select
                  value={newMemoryCategory}
                  onChange={(e) => setNewMemoryCategory(e.target.value)}
                  className="px-2 py-2 text-xs bg-neutral-900 border border-white/10 rounded-xl text-neutral-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="fact">Fact (সাধারণ তথ্য)</option>
                  <option value="preference">Preference (পছন্দ)</option>
                  <option value="habit">Habit (অভ্যাস)</option>
                  <option value="person">Person (পরিচিত জন)</option>
                  <option value="reminder">Note (জরুরি নোট)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!newMemoryFact.trim()}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase shadow-md active:scale-95"
              >
                Save To Memory (মেমোরিতে সেভ করুন)
              </button>
            </form>

            {/* Remembered Facts List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                  Remembered Items ({memoryData.facts?.length || 0})
                </h3>
                <span className="text-[10px] text-neutral-500">
                  You can also tell Zoya verbally: "জয়া মনে রেখো..."
                </span>
              </div>

              {(!memoryData.facts || memoryData.facts.length === 0) ? (
                <p className="text-xs text-neutral-500 text-center py-6 bg-neutral-950/30 rounded-xl border border-white/5">
                  No memories saved yet. Speak to Zoya or add one above!
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {memoryData.facts.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 p-3 border border-white/5 bg-neutral-950/40 rounded-xl hover:border-purple-500/30 transition-all group"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-xs text-neutral-200 leading-relaxed font-medium">
                          {item.text}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                            {item.category || 'fact'}
                          </span>
                          {item.date && (
                            <span className="text-[9px] font-mono text-neutral-500">
                              {item.date}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(item.id, item.text)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0 opacity-80 group-hover:opacity-100"
                        title="Delete this memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
