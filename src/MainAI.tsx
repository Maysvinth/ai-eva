import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, ExternalLink, Activity, Moon, GripHorizontal, Settings, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGeminiLive } from './useGeminiLive';
import { ANIME_VOICES } from './voices';
import { FloatingWidget } from './components/FloatingWidget';

export function MainAI() {
  const { isConnected, isConnecting, isAiSpeaking, userVolume, isUserSpeaking, companionText, setCompanionText, connect, disconnect, aiVolume, setAiVolume } = useGeminiLive();

  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState('zephyr-kuudere');
  const [taskPrompt, setTaskPrompt] = useState('');
  
  const [activeTab, setActiveTab] = useState<'voice' | 'general'>('voice');

  const currentVoice = ANIME_VOICES.find(v => v.id === selectedVoiceId) || ANIME_VOICES[0];

  useEffect(() => {
    const saved = localStorage.getItem('selectedVoiceId');
    if (saved) setSelectedVoiceId(saved);
    
    setTaskPrompt(localStorage.getItem('taskPrompt') || '');
  }, []);

  const handleVoiceSelect = (id: string) => {
    setSelectedVoiceId(id);
    localStorage.setItem('selectedVoiceId', id);
    if (isConnected) {
      disconnect();
      setTimeout(() => {
        connect();
      }, 500);
    }
  };

  const handlePrevVoice = () => {
    const currentIndex = ANIME_VOICES.findIndex(v => v.id === selectedVoiceId);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : ANIME_VOICES.length - 1;
    handleVoiceSelect(ANIME_VOICES[prevIndex].id);
  };

  const handleNextVoice = () => {
    const currentIndex = ANIME_VOICES.findIndex(v => v.id === selectedVoiceId);
    const nextIndex = currentIndex < ANIME_VOICES.length - 1 ? currentIndex + 1 : 0;
    handleVoiceSelect(ANIME_VOICES[nextIndex].id);
  };

  const handleTaskPromptChange = (val: string) => {
    setTaskPrompt(val);
    localStorage.setItem('taskPrompt', val);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  };

  const handleMouseUp = () => {
    dragRef.current.isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const openWidget = () => {
    window.open(window.location.pathname + '#/widget', 'AIWidget', 'width=280,height=160,resizable=yes');
  };

  const circleSize = isAiSpeaking ? "w-64 h-64" : "w-48 h-48";
  
  const neonGlowStyle = {
    boxShadow: isAiSpeaking 
      ? `0 0 80px rgba(${currentVoice.rgb}, 0.8), inset 0 0 40px rgba(${currentVoice.rgb}, 0.4)`
      : `0 0 30px rgba(${currentVoice.rgb}, 0.3), inset 0 0 15px rgba(${currentVoice.rgb}, 0.2)`,
    backgroundColor: isAiSpeaking 
      ? `rgba(${currentVoice.rgb}, 1)` 
      : `rgba(${currentVoice.rgb}, 0.1)`,
    borderColor: isAiSpeaking 
      ? `rgba(${currentVoice.rgb}, 1)` 
      : `rgba(${currentVoice.rgb}, 0.5)`
  } as React.CSSProperties;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white font-sans overflow-hidden relative">
      
      {/* Ambient Background */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-700 ease-in-out"
        style={{
          background: `
            radial-gradient(circle at 30% 40%, rgba(${currentVoice.rgb}, ${isAiSpeaking ? '0.15' : '0.03'}) 0%, transparent ${isAiSpeaking ? '60%' : '40%'}),
            radial-gradient(circle at 70% 60%, rgba(${currentVoice.rgb}, ${isAiSpeaking ? '0.1' : '0.02'}) 0%, transparent ${isAiSpeaking ? '50%' : '30%'})
          `,
          filter: 'blur(80px)',
          transform: isAiSpeaking ? 'scale(1.05)' : 'scale(1)',
        }}
      />

      {/* Voice Selector Oval */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-2 bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-full z-30 shadow-lg">
        <button 
          onClick={handlePrevVoice}
          className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-cyan-400 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col items-center min-w-[140px]">
          <span className="text-[10px] text-cyan-500/70 uppercase tracking-widest font-mono mb-0.5">Persona</span>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${currentVoice.color}`} />
            <span className="text-sm font-semibold text-cyan-100 tracking-wide text-center">{currentVoice.name}</span>
          </div>
        </div>
        <button 
          onClick={handleNextVoice}
          className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-cyan-400 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Floating Adjustable Widget */}
      <FloatingWidget 
        isConnected={isConnected}
        isConnecting={isConnecting}
        isUserSpeaking={isUserSpeaking}
        isAiSpeaking={isAiSpeaking}
        onConnect={() => connect()}
        onDisconnect={disconnect}
        voiceName={currentVoice.name}
        voiceColor={currentVoice.color}
      />

      <button 
        onClick={() => setIsSettingsOpen(true)}
        className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-sm text-neutral-300 transition-colors z-30"
      >
        <Settings size={16} />
        Settings
      </button>

      {/* Settings Panel */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="w-96 bg-neutral-950 border-l border-neutral-800 h-full flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-neutral-800">
              <h2 className="text-lg font-semibold text-white">Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-neutral-800">
              <button 
                onClick={() => setActiveTab('voice')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${activeTab === 'voice' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'}`}
              >
                Voice
              </button>
              <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${activeTab === 'general' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'}`}
              >
                General
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              {activeTab === 'voice' && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest">AI Volume</h3>
                  <div className="flex items-center gap-4 bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                    <span className="text-neutral-400 text-xs w-8 text-right">{Math.round(aiVolume * 100)}%</span>
                    <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="0.1" 
                      value={aiVolume} 
                      onChange={(e) => setAiVolume(parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-500"
                    />
                  </div>

                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest mt-4">AI Persona</h3>
                  <p className="text-xs text-neutral-400 mb-1">
                    Select an anime persona for the AI. Changing this while connected will briefly disconnect and reconnect the AI.
                  </p>
                  
                  {ANIME_VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => handleVoiceSelect(voice.id)}
                    className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-300 ${
                      selectedVoiceId === voice.id 
                        ? 'border-cyan-500 bg-cyan-950/30' 
                        : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${voice.color}`} />
                        <span className={`font-semibold ${selectedVoiceId === voice.id ? 'text-cyan-300' : 'text-white'}`}>
                          {voice.name}
                        </span>
                      </div>
                      {selectedVoiceId === voice.id && <Check size={16} className="text-cyan-400" />}
                    </div>
                    <span className="text-xs text-neutral-400 leading-relaxed">
                      {voice.description}
                    </span>
                  </button>
                ))}
                </div>
              )}

              {activeTab === 'general' && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest">General Settings</h3>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Background Task Prompt</label>
                    <textarea 
                      value={taskPrompt}
                      onChange={(e) => handleTaskPromptChange(e.target.value)}
                      placeholder="e.g. 'You are helping me debug a React application. Keep answers concise.'"
                      className="w-full h-24 bg-neutral-900/50 border border-neutral-800 rounded-xl p-3 text-sm text-white placeholder:text-neutral-600 focus:border-cyan-500 focus:outline-none resize-none"
                    />
                    <span className="text-[10px] text-neutral-500">This prompt will be added to the AI's system instructions.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative flex items-center justify-center flex-1 w-full">
        {isConnected && (
          <div 
            className="absolute rounded-full border-2 transition-all duration-75"
            style={{
              width: `${(isAiSpeaking ? 256 : 192) + Math.min(userVolume * 1500, 300)}px`,
              height: `${(isAiSpeaking ? 256 : 192) + Math.min(userVolume * 1500, 300)}px`,
              opacity: isUserSpeaking ? 0.8 : 0.1,
              borderColor: `rgba(${currentVoice.rgb}, 0.5)`
            }}
          />
        )}
        
        <div 
          className={`relative rounded-full transition-all duration-300 flex items-center justify-center z-10 ${circleSize} ${isAiSpeaking ? 'animate-pulse' : ''} ${!isAiSpeaking ? 'border-2' : ''}`}
          style={neonGlowStyle}
        >
          {!isConnected && !isConnecting && (
            <span className="text-white/70 font-medium tracking-widest uppercase text-sm">Offline</span>
          )}
          {isConnecting && <Loader2 className="w-8 h-8 text-white/80 animate-spin" />}
        </div>
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-6 z-20">
        <div className="flex flex-col items-center gap-1">
          <div className="h-6 flex items-center justify-center">
            {isConnected ? (
              <span className={`text-sm tracking-widest uppercase transition-colors duration-300 ${isUserSpeaking ? 'text-cyan-300 font-bold' : 'text-cyan-700'}`}>
                {isUserSpeaking ? 'Voice Detected' : 'Listening...'}
              </span>
            ) : (
              <span className="text-sm tracking-widest uppercase text-neutral-600">Ready to connect</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-cyan-500/50 font-mono uppercase tracking-widest">
            <div className={`w-2 h-2 rounded-full ${currentVoice.color}`} />
            Voice: {currentVoice.name}
          </div>
        </div>
        
        <button
          onClick={() => isConnected ? disconnect() : connect()}
          disabled={isConnecting}
          className={`p-4 rounded-full transition-all duration-300 ${
            isConnected 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30' 
              : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30'
          }`}
        >
          {isConnected ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
      </div>

      {/* Companion Text Panel */}
      {companionText && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-30">
          <div className="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-xl p-4 shadow-2xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest flex items-center gap-2">
                <ExternalLink size={14} /> Companion Links
              </h3>
              <button 
                onClick={() => setCompanionText('')}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="text-sm text-neutral-300 whitespace-pre-wrap font-mono bg-black/50 p-3 rounded-lg border border-neutral-800 max-h-48 overflow-y-auto">
              {companionText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
