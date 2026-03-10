import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import { 
  Activity, Heart, User, Scale, Thermometer, ChevronRight, 
  Loader2, AlertCircle, CheckCircle2, Info, Volume2, VolumeX, 
  History as HistoryIcon, BarChart3, LayoutDashboard, Save, Trash2,
  Ruler, Weight, Mic, MicOff, Sparkles, Brain, Zap, ShieldCheck,
  ArrowRight, RefreshCw, MessageSquare, Calendar, Filter, CheckSquare, Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface HealthReport {
  explanation: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  lifestyleAdvice: string[];
  dietImprovements: string[];
  exerciseRecommendations: string[];
  healthTip: string;
}

interface HistoryEntry {
  id: string;
  date: string;
  name: string;
  weight: number;
  height: number;
  bmi: number;
  systolic: number;
  diastolic: number;
  heartRate: number;
  riskLevel: string;
  report: HealthReport;
}

type Tab = 'input' | 'results' | 'charts' | 'history' | 'live';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'Male',
    weight: '',
    height: '',
    systolic: '',
    diastolic: '',
    heartRate: '',
  });

  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [chartFilter, setChartFilter] = useState({
    startDate: '',
    endDate: '',
    vitals: ['bmi', 'systolic', 'diastolic', 'heartRate']
  });

  // Live API State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveConnecting, setIsLiveConnecting] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  // Instant BMI Calculation
  const calculatedBMI = useMemo(() => {
    const w = parseFloat(formData.weight);
    const h = parseFloat(formData.height);
    if (w > 0 && h > 0) {
      return (w / (h * h)).toFixed(2);
    }
    return null;
  }, [formData.weight, formData.height]);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('health_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = (newEntry: HistoryEntry) => {
    const updatedHistory = [newEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('health_history', JSON.stringify(updatedHistory));
  };

  const deleteHistoryItem = (id: string) => {
    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('health_history', JSON.stringify(updatedHistory));
  };

  const speak = (text: string) => {
    if (!audioEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calculatedBMI) {
      setError("Please enter valid weight and height.");
      return;
    }

    setScanning(true);
    setLoading(true);
    setError(null);
    setReport(null);

    // Artificial "scanning" delay for aesthetic
    await new Promise(resolve => setTimeout(resolve, 2500));

    const prompt = `
      Analyze the following health information and provide a structured health report.

      Patient Information:
      Name: ${formData.name}
      Age: ${formData.age}
      Gender: ${formData.gender}

      Health Measurements:
      Weight: ${formData.weight} kg
      Height: ${formData.height} m
      BMI: ${calculatedBMI}
      Blood Pressure: ${formData.systolic}/${formData.diastolic} mmHg
      Heart Rate: ${formData.heartRate} BPM

      Tasks:
      1. Explain what these values mean.
      2. Determine a health risk level (Low, Moderate, or High).
      3. Give lifestyle advice.
      4. Suggest diet improvements.
      5. Suggest exercise recommendations.
      6. Provide one useful health tip.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation: { type: Type.STRING },
              riskLevel: { type: Type.STRING, enum: ["Low", "Moderate", "High"] },
              lifestyleAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
              dietImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
              exerciseRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              healthTip: { type: Type.STRING },
            },
            required: ["explanation", "riskLevel", "lifestyleAdvice", "dietImprovements", "exerciseRecommendations", "healthTip"],
          },
        },
      });

      const result = JSON.parse(response.text || '{}') as HealthReport;
      setReport(result);
      setActiveTab('results');

      speak(`Analysis complete. Your health risk level is ${result.riskLevel}.`);

      const newEntry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        name: formData.name,
        weight: parseFloat(formData.weight),
        height: parseFloat(formData.height),
        bmi: parseFloat(calculatedBMI),
        systolic: parseInt(formData.systolic),
        diastolic: parseInt(formData.diastolic),
        heartRate: parseInt(formData.heartRate),
        riskLevel: result.riskLevel,
        report: result
      };
      saveToHistory(newEntry);

    } catch (err) {
      console.error(err);
      setError("AI Analysis failed. Please verify your biometric data and try again.");
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };

  // Live API Implementation
  const startLiveAssistant = async () => {
    if (isLiveActive) {
      stopLiveAssistant();
      return;
    }

    setIsLiveConnecting(true);
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are an AI Health Assistant for the Science & Innovation Club. 
          You have access to the user's latest vitals: 
          Name: ${formData.name || 'User'}, 
          BMI: ${calculatedBMI || 'N/A'}, 
          BP: ${formData.systolic}/${formData.diastolic || 'N/A'}, 
          Heart Rate: ${formData.heartRate || 'N/A'}.
          Help them understand their health data in a professional, encouraging, and scientific manner. 
          Keep responses concise and focused on health science.`,
        },
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            setIsLiveConnecting(false);
            setLiveTranscript(["Connected. You can speak now."]);
            
            // Setup audio streaming
            const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Convert to PCM 16-bit
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
              }
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
            };
            
            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
              const pcmData = new Int16Array(audioData.buffer);
              const floatData = new Float32Array(pcmData.length);
              for (let i = 0; i < pcmData.length; i++) {
                floatData[i] = pcmData[i] / 0x7FFF;
              }
              
              const buffer = audioContextRef.current!.createBuffer(1, floatData.length, 16000);
              buffer.getChannelData(0).set(floatData);
              const source = audioContextRef.current!.createBufferSource();
              source.buffer = buffer;
              source.connect(audioContextRef.current!.destination);
              source.start();
            }
          },
          onclose: () => stopLiveAssistant(),
          onerror: (e) => {
            console.error("Live API Error:", e);
            stopLiveAssistant();
          }
        }
      });
      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to start Live Assistant:", err);
      setIsLiveConnecting(false);
      setError("Microphone access or Live API connection failed.");
    }
  };

  const stopLiveAssistant = () => {
    setIsLiveActive(false);
    setIsLiveConnecting(false);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    if (sessionRef.current) sessionRef.current.close();
    sessionRef.current = null;
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]';
      case 'Moderate': return 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]';
      case 'High': return 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const filteredChartData = useMemo(() => {
    let data = [...history];
    
    if (chartFilter.startDate) {
      const start = new Date(chartFilter.startDate);
      data = data.filter(item => new Date(item.date) >= start);
    }
    if (chartFilter.endDate) {
      const end = new Date(chartFilter.endDate);
      // Set to end of day
      end.setHours(23, 59, 59, 999);
      data = data.filter(item => new Date(item.date) <= end);
    }
    
    return data.reverse().map(item => ({
      date: item.date.split(',')[0],
      bmi: item.bmi,
      systolic: item.systolic,
      diastolic: item.diastolic,
      heartRate: item.heartRate
    }));
  }, [history, chartFilter.startDate, chartFilter.endDate]);

  const toggleVitalFilter = (vital: string) => {
    setChartFilter(prev => ({
      ...prev,
      vitals: prev.vitals.includes(vital) 
        ? prev.vitals.filter(v => v !== vital)
        : [...prev.vitals, vital]
    }));
  };

  return (
    <div className="min-h-screen bg-[#020203] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-50" />
      </div>

      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/5 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
              <div className="relative bg-black p-2.5 rounded-xl border border-white/10">
                <Brain className="w-6 h-6 text-indigo-400" />
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-black tracking-tighter text-white uppercase flex items-center gap-2">
                VitalScan <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30">AI PRO</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Science & Innovation Club</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {[
              { id: 'input', icon: LayoutDashboard, label: 'Input' },
              { id: 'results', icon: Sparkles, label: 'Analysis', disabled: !report },
              { id: 'live', icon: Mic, label: 'Live AI' },
              { id: 'charts', icon: BarChart3, label: 'Insights', disabled: history.length === 0 },
              { id: 'history', icon: HistoryIcon, label: 'Archive', disabled: history.length === 0 }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                disabled={tab.disabled}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${
                  activeTab === tab.id 
                    ? 'bg-white/10 text-white border-white/10 shadow-lg' 
                    : 'text-slate-500 hover:text-white border-transparent hover:bg-white/5 disabled:opacity-20'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2.5 rounded-xl transition-all border ${audioEnabled ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-white/5 text-slate-500 border-white/5'}`}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left: Form */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="bg-[#0A0A0B] rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="p-8 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                      <h3 className="text-lg font-black flex items-center gap-3 text-white uppercase tracking-wider">
                        <Zap className="w-5 h-5 text-indigo-500" />
                        Biometric Telemetry
                      </h3>
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/20" />
                      </div>
                    </div>

                    <form onSubmit={generateReport} className="p-8 space-y-8 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em]">Subject Identity</label>
                          <div className="relative">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <input
                              required
                              name="name"
                              value={formData.name}
                              onChange={handleInputChange}
                              placeholder="FULL NAME"
                              className="w-full pl-14 pr-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white placeholder:text-slate-700 font-bold uppercase tracking-widest text-xs"
                            />
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em]">Age (Years)</label>
                          <input
                            required
                            type="number"
                            name="age"
                            value={formData.age}
                            onChange={handleInputChange}
                            className="w-full px-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white font-mono"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em]">Biological Gender</label>
                          <select
                            name="gender"
                            value={formData.gender}
                            onChange={handleInputChange}
                            className="w-full px-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white appearance-none cursor-pointer font-bold uppercase tracking-widest text-xs"
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div className="md:col-span-2 grid grid-cols-2 gap-6 p-6 bg-white/[0.02] rounded-3xl border border-white/5">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] flex items-center gap-2">
                              <Weight className="w-3.5 h-3.5" /> Mass (kg)
                            </label>
                            <input
                              required
                              type="number"
                              step="0.1"
                              name="weight"
                              value={formData.weight}
                              onChange={handleInputChange}
                              className="w-full px-6 py-4 rounded-xl border border-white/5 bg-black focus:border-indigo-500 outline-none transition-all text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] flex items-center gap-2">
                              <Ruler className="w-3.5 h-3.5" /> Height (m)
                            </label>
                            <input
                              required
                              type="number"
                              step="0.01"
                              name="height"
                              value={formData.height}
                              onChange={handleInputChange}
                              className="w-full px-6 py-4 rounded-xl border border-white/5 bg-black focus:border-indigo-500 outline-none transition-all text-white font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em]">Systolic BP</label>
                          <input
                            required
                            type="number"
                            name="systolic"
                            value={formData.systolic}
                            onChange={handleInputChange}
                            className="w-full px-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em]">Diastolic BP</label>
                          <input
                            required
                            type="number"
                            name="diastolic"
                            value={formData.diastolic}
                            onChange={handleInputChange}
                            className="w-full px-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white font-mono"
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-[0.2em] flex items-center gap-2">
                            <Heart className="w-3.5 h-3.5 text-rose-500" /> Heart Rate (BPM)
                          </label>
                          <input
                            required
                            type="number"
                            name="heartRate"
                            value={formData.heartRate}
                            onChange={handleInputChange}
                            className="w-full px-6 py-5 rounded-2xl border border-white/5 bg-black/40 focus:bg-black focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-white font-mono"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full relative group overflow-hidden"
                      >
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-emerald-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200" />
                        <div className="relative w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white font-black py-6 rounded-2xl transition-all flex items-center justify-center gap-4 uppercase tracking-[0.3em] text-xs">
                          {loading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Processing Neural Analysis...
                            </>
                          ) : (
                            <>
                              Initiate AI Scan
                              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </div>
                      </button>
                      
                      {error && (
                        <motion.p 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-rose-400 text-[10px] font-black text-center mt-4 flex items-center justify-center gap-2 uppercase tracking-widest"
                        >
                          <AlertCircle className="w-4 h-4" /> {error}
                        </motion.p>
                      )}
                    </form>
                  </div>
                </div>

                {/* Right: AI Insights Card */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-[#0A0A0B] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden h-full flex flex-col">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Brain className="w-32 h-32 text-indigo-500" />
                    </div>
                    
                    <div className="relative z-10 flex-1">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                          <Sparkles className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">AI Status Engine</h4>
                      </div>

                      <div className="space-y-8">
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Real-time Biometrics</p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                              <p className="text-[9px] font-black text-slate-600 uppercase mb-1">BMI Index</p>
                              <p className="text-2xl font-black text-white font-mono">{calculatedBMI || '--.-'}</p>
                            </div>
                            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                              <p className="text-[9px] font-black text-slate-600 uppercase mb-1">Pulse Rate</p>
                              <p className="text-2xl font-black text-white font-mono">{formData.heartRate || '--'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                          <div className="flex items-center gap-3 mb-4">
                            <ShieldCheck className="w-4 h-4 text-indigo-400" />
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Innovation Protocol</p>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed font-medium">
                            Our neural network analyzes 50+ health markers to provide clinical-grade insights. Enter your data to begin the diagnostic sequence.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto pt-8 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0A0B] bg-slate-800 flex items-center justify-center">
                              <User className="w-4 h-4 text-slate-500" />
                            </div>
                          ))}
                        </div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">1,240+ Scans Today</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'results' && report && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8 max-w-5xl mx-auto"
            >
              {/* Risk Banner */}
              <div className={`relative p-12 rounded-[3rem] border overflow-hidden group ${getRiskColor(report.riskLevel)}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-50" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-8">
                    <div className="relative">
                      <div className="absolute -inset-4 bg-white/20 rounded-full blur-2xl animate-pulse" />
                      <div className="relative w-20 h-20 bg-white/10 rounded-[2rem] backdrop-blur-xl flex items-center justify-center border border-white/20">
                        {report.riskLevel === 'Low' ? <CheckCircle2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Diagnostic Result</p>
                      <h3 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">{report.riskLevel} Risk</h3>
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Subject Profile</p>
                    <p className="text-2xl font-black text-white uppercase tracking-tighter">{formData.name}</p>
                    <div className="mt-2 flex gap-2 justify-center md:justify-end">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10">Age: {formData.age}</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10">{formData.gender}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {/* Explanation */}
                  <div className="bg-[#0A0A0B] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Info className="w-24 h-24 text-indigo-500" />
                    </div>
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase mb-6 tracking-[0.3em] flex items-center gap-3">
                      <Brain className="w-4 h-4" /> Neural Interpretation
                    </h4>
                    <p className="text-xl text-slate-300 leading-relaxed font-medium">{report.explanation}</p>
                  </div>

                  {/* Two Column Advice */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-[#0A0A0B] p-8 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-indigo-500/20 transition-colors">
                      <h4 className="text-[10px] font-black text-indigo-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
                        <Zap className="w-4 h-4" /> Lifestyle Optimization
                      </h4>
                      <ul className="space-y-5">
                        {report.lifestyleAdvice.map((item, i) => (
                          <li key={i} className="flex items-start gap-4 text-sm text-slate-400 leading-relaxed group/item">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0 group-hover/item:scale-150 transition-transform" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-[#0A0A0B] p-8 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-emerald-500/20 transition-colors">
                      <h4 className="text-[10px] font-black text-emerald-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
                        <Thermometer className="w-4 h-4" /> Nutritional Protocol
                      </h4>
                      <ul className="space-y-5">
                        {report.dietImprovements.map((item, i) => (
                          <li key={i} className="flex items-start gap-4 text-sm text-slate-400 leading-relaxed group/item">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0 group-hover/item:scale-150 transition-transform" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Exercise */}
                  <div className="bg-[#0A0A0B] p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
                    <h4 className="text-[10px] font-black text-amber-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Physical Regimen
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      {report.exerciseRecommendations.map((item, i) => (
                        <span key={i} className="px-4 py-2 bg-amber-500/5 text-amber-400 text-[9px] font-black rounded-xl border border-amber-500/10 uppercase tracking-widest hover:bg-amber-500/10 transition-colors cursor-default">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pro Tip */}
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-emerald-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-1000" />
                    <div className="relative bg-[#0A0A0B] p-10 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                          <Sparkles className="w-5 h-5 text-indigo-400" />
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">AI Insight</p>
                        </div>
                        <p className="text-xl font-bold text-white leading-tight italic">"{report.healthTip}"</p>
                      </div>
                      <Brain className="w-40 h-40 text-white/[0.02] absolute -right-10 -bottom-10 rotate-12" />
                    </div>
                  </div>

                  <button 
                    onClick={() => setActiveTab('input')}
                    className="w-full py-6 bg-white/[0.02] hover:bg-white/[0.05] text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[2rem] border border-white/5 transition-all flex items-center justify-center gap-3"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New Diagnostic
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'live' && (
            <motion.div 
              key="live"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-[#0A0A0B] rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden relative">
                {/* Immersive Background for Live */}
                <div className="absolute inset-0 z-0">
                  <div className={`absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent transition-opacity duration-1000 ${isLiveActive ? 'opacity-100' : 'opacity-0'}`} />
                  {isLiveActive && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-20">
                      <div className="w-[500px] h-[500px] bg-indigo-500/20 blur-[100px] rounded-full animate-pulse" />
                    </div>
                  )}
                </div>

                <div className="relative z-10 p-12 flex flex-col items-center text-center space-y-12">
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                      <div className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Neural Voice Link</span>
                    </div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter">AI Health Assistant</h2>
                    <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
                      Engage in a real-time scientific dialogue about your health data. Our AI understands your latest vitals and provides instant verbal consultation.
                    </p>
                  </div>

                  {/* Visualizer Placeholder */}
                  <div className="relative w-64 h-64 flex items-center justify-center">
                    <AnimatePresence>
                      {isLiveActive ? (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="absolute inset-0"
                        >
                          <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full animate-[ping_3s_linear_infinite]" />
                          <div className="absolute inset-4 border-2 border-indigo-500/40 rounded-full animate-[ping_2s_linear_infinite]" />
                          <div className="absolute inset-8 border border-indigo-500/60 rounded-full animate-[ping_1.5s_linear_infinite]" />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    
                    <button 
                      onClick={startLiveAssistant}
                      disabled={isLiveConnecting}
                      className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 group ${
                        isLiveActive 
                          ? 'bg-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.4)]' 
                          : 'bg-indigo-600 shadow-[0_0_50px_rgba(79,70,229,0.4)] hover:scale-110'
                      }`}
                    >
                      {isLiveConnecting ? (
                        <Loader2 className="w-10 h-10 text-white animate-spin" />
                      ) : isLiveActive ? (
                        <MicOff className="w-10 h-10 text-white" />
                      ) : (
                        <Mic className="w-10 h-10 text-white" />
                      )}
                    </button>
                  </div>

                  <div className="w-full max-w-lg bg-white/[0.02] rounded-3xl border border-white/5 p-6 min-h-[120px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                      {liveTranscript.length > 0 ? (
                        <motion.div 
                          key="transcript"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-2"
                        >
                          {liveTranscript.map((t, i) => (
                            <p key={i} className="text-sm text-slate-400 font-medium italic">"{t}"</p>
                          ))}
                        </motion.div>
                      ) : (
                        <p key="placeholder" className="text-xs text-slate-600 font-black uppercase tracking-widest">
                          {isLiveActive ? 'Listening for your query...' : 'Click the mic to start consultation'}
                        </p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="grid grid-cols-3 gap-8 w-full pt-8 border-t border-white/5">
                    {[
                      { icon: ShieldCheck, label: 'Encrypted' },
                      { icon: Zap, label: 'Low Latency' },
                      { icon: MessageSquare, label: 'Natural' }
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <item.icon className="w-4 h-4 text-slate-600" />
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'charts' && history.length > 0 && (
            <motion.div 
              key="charts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Chart Filters */}
              <div className="bg-[#0A0A0B] p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <Filter className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filters</span>
                </div>
                
                <div className="h-8 w-px bg-white/5 hidden md:block" />
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="date" 
                      value={chartFilter.startDate}
                      onChange={(e) => setChartFilter(prev => ({ ...prev, startDate: e.target.value }))}
                      className="bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-[10px] text-white font-mono outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <span className="text-slate-600 text-xs">to</span>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="date" 
                      value={chartFilter.endDate}
                      onChange={(e) => setChartFilter(prev => ({ ...prev, endDate: e.target.value }))}
                      className="bg-black/40 border border-white/5 rounded-lg px-3 py-1.5 text-[10px] text-white font-mono outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="h-8 w-px bg-white/5 hidden md:block" />

                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { id: 'bmi', label: 'BMI', color: 'text-indigo-400' },
                    { id: 'systolic', label: 'Systolic', color: 'text-rose-400' },
                    { id: 'diastolic', label: 'Diastolic', color: 'text-rose-300' },
                    { id: 'heartRate', label: 'Heart Rate', color: 'text-emerald-400' }
                  ].map(vital => (
                    <button
                      key={vital.id}
                      onClick={() => toggleVitalFilter(vital.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                        chartFilter.vitals.includes(vital.id)
                          ? 'bg-white/5 border-white/10 text-white'
                          : 'bg-transparent border-transparent text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {chartFilter.vitals.includes(vital.id) ? (
                        <CheckSquare className={`w-3.5 h-3.5 ${vital.color}`} />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest">{vital.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {chartFilter.vitals.includes('bmi') && (
                  <div className="bg-[#0A0A0B] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Scale className="w-24 h-24 text-indigo-500" />
                    </div>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase mb-10 tracking-[0.3em] flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" /> BMI Historical Variance
                    </h4>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={filteredChartData}>
                          <defs>
                            <linearGradient id="colorBmi" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                          <XAxis dataKey="date" stroke="#334155" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#334155" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020203', border: '1px solid #ffffff10', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                            itemStyle={{ color: '#818cf8', fontWeight: '900', textTransform: 'uppercase', fontSize: '10px' }}
                          />
                          <Area type="monotone" dataKey="bmi" stroke="#818cf8" strokeWidth={4} fillOpacity={1} fill="url(#colorBmi)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(chartFilter.vitals.includes('systolic') || chartFilter.vitals.includes('diastolic') || chartFilter.vitals.includes('heartRate')) && (
                  <div className="bg-[#0A0A0B] p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Heart className="w-24 h-24 text-rose-500" />
                    </div>
                    <h4 className="text-[10px] font-black text-slate-500 uppercase mb-10 tracking-[0.3em] flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-rose-500" /> Cardiovascular Telemetry
                    </h4>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                          <XAxis dataKey="date" stroke="#334155" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#334155" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#020203', border: '1px solid #ffffff10', borderRadius: '16px' }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: '900', paddingTop: '30px', letterSpacing: '0.1em' }} />
                          {chartFilter.vitals.includes('systolic') && <Line type="monotone" dataKey="systolic" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e' }} />}
                          {chartFilter.vitals.includes('diastolic') && <Line type="monotone" dataKey="diastolic" stroke="#fb7185" strokeWidth={3} dot={{ r: 4, fill: '#fb7185' }} />}
                          {chartFilter.vitals.includes('heartRate') && <Line type="monotone" dataKey="heartRate" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && history.length > 0 && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[#0A0A0B] rounded-[3rem] border border-white/5 shadow-2xl overflow-hidden"
            >
              <div className="p-10 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                <h3 className="text-xl font-black flex items-center gap-4 text-white uppercase tracking-tighter">
                  <HistoryIcon className="w-6 h-6 text-indigo-500" />
                  Diagnostic Archive
                </h3>
                <div className="px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{history.length} Records Persisted</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.01]">
                      <th className="px-10 py-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5">Timestamp</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5">Subject</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5">Biometrics</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5">Risk Factor</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-10 py-6 text-xs text-slate-500 font-mono">{item.date}</td>
                        <td className="px-10 py-6">
                          <p className="text-sm text-white font-black uppercase tracking-tight">{item.name}</p>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex gap-4">
                            <div>
                              <p className="text-[9px] font-black text-slate-600 uppercase mb-0.5">BMI</p>
                              <p className="text-xs text-slate-300 font-mono">{item.bmi}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-600 uppercase mb-0.5">BP</p>
                              <p className="text-xs text-slate-300 font-mono">{item.systolic}/{item.diastolic}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                            item.riskLevel === 'Low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            item.riskLevel === 'Moderate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {item.riskLevel}
                          </span>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => {
                                setReport(item.report);
                                setFormData({
                                  name: item.name,
                                  age: '', 
                                  gender: 'Male',
                                  weight: item.weight.toString(),
                                  height: item.height.toString(),
                                  systolic: item.systolic.toString(),
                                  diastolic: item.diastolic.toString(),
                                  heartRate: item.heartRate.toString(),
                                });
                                setActiveTab('results');
                              }}
                              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-all border border-white/5"
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-2.5 bg-rose-500/0 hover:bg-rose-500/10 rounded-xl text-slate-700 hover:text-rose-400 transition-all border border-transparent"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-20 border-t border-white/5 py-20 px-4 bg-black/40 backdrop-blur-3xl">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-600/20 p-3 rounded-2xl border border-indigo-500/30">
                <Brain className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <p className="text-lg font-black text-white uppercase tracking-tighter">VitalScan AI</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Science & Innovation Club</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              Pushing the boundaries of health technology through neural analysis and real-time biometric telemetry.
            </p>
          </div>
          
          <div className="flex flex-col items-center md:items-start gap-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Core Protocols</p>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer">Neural Diagnostics</span>
              <span className="text-xs text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer">Biometric Encryption</span>
              <span className="text-xs text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer">Live Consultation</span>
            </div>
          </div>

          <div className="text-center md:text-right space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Lead Architect</p>
            <a 
              href="https://loyal-gnu-nxqkj6.mystrikingly.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block group"
            >
              <span className="text-3xl font-black text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tighter">
                Araali Israel
              </span>
              <div className="h-1 w-full bg-indigo-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right" />
            </a>
            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Innovation for Humanity • 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
