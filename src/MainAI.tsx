import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, ExternalLink, Activity, Moon, GripHorizontal, Settings, X, Check, ChevronLeft, ChevronRight, RefreshCw, Smartphone } from 'lucide-react';
import { useGeminiLive } from './useGeminiLive';
import { ANIME_VOICES } from './voices';

const generatePairingCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  code += '-';
  for (let i = 0; i < 4; i++) code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  return code;
};

export function MainAI() {
  const { isConnected, isConnecting, isAiSpeaking, userVolume, isUserSpeaking, companionText, setCompanionText, connect, disconnect, sendTabletCommand } = useGeminiLive();

  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState('zephyr-kuudere');
  const [useLaptopAudio, setUseLaptopAudio] = useState(true);
  const [taskPrompt, setTaskPrompt] = useState('');
  
  const [myDeviceCode, setMyDeviceCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'waiting' | 'connected' | 'expired'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  const [activeTab, setActiveTab] = useState<'voice' | 'device' | 'general'>('voice');

  useEffect(() => {
    const saved = localStorage.getItem('selectedVoiceId');
    if (saved) setSelectedVoiceId(saved);
    
    setUseLaptopAudio(localStorage.getItem('useLaptopAudio') !== 'false');
    setTaskPrompt(localStorage.getItem('taskPrompt') || '');

    // Auto-generate and start pairing
    const initialCode = generatePairingCode();
    setMyDeviceCode(initialCode);
    startPairing(initialCode);
  }, []);

  const startPairing = (codeToUse: string) => {
    setPairingStatus('waiting');

    const wsUrl = window.location.protocol === 'https:' 
      ? `wss://${window.location.host}/ws` 
      : `ws://${window.location.host}/ws`;
      
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (codeToUse === myDeviceCode) {
        ws.send(JSON.stringify({ type: 'register_device', role: 'laptop', code: codeToUse }));
      } else {
        ws.send(JSON.stringify({ type: 'connect_device', role: 'laptop', code: codeToUse }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setPairingStatus('connected');
          localStorage.setItem('isDeviceConnected', 'true');
        } else if (data.type === 'disconnected') {
          setPairingStatus('idle');
          localStorage.setItem('isDeviceConnected', 'false');
          // Auto-regenerate on disconnect
          const newCode = generatePairingCode();
          setMyDeviceCode(newCode);
          startPairing(newCode);
        } else if (data.type === 'command') {
          handleRemoteCommand(data.payload);
        }
      } catch (e) {
        console.error(e);
      }
    };
  };

  const handleRemoteCommand = (payload: any) => {
    const { command, url } = payload;
    if (command === 'play_music') {
      window.open('https://open.spotify.com', '_blank');
    } else if (command === 'open_youtube') {
      window.open('https://youtube.com', '_blank');
    } else if (command === 'open_website' && url) {
      window.open(url, '_blank');
    } else if (command === 'execute_task') {
      if (!isConnected) connect();
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (sendTabletCommand && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'tablet_command',
        payload: sendTabletCommand
      }));
    }
  }, [sendTabletCommand]);

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

  const handleUseLaptopAudioToggle = (val: boolean) => {
    setUseLaptopAudio(val);
    localStorage.setItem('useLaptopAudio', String(val));
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

  const currentVoice = ANIME_VOICES.find(v => v.id === selectedVoiceId) || ANIME_VOICES[0];

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
      <div 
        className="absolute z-40 flex flex-col bg-black/80 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl overflow-hidden resize"
        style={{ left: pos.x, top: pos.y, minWidth: '240px', minHeight: '120px' }}
      >
        {/* Drag Handle / Header */}
        <div 
          className="flex flex-col p-3 border-b border-neutral-800 bg-neutral-900/50 cursor-move gap-1.5"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 pointer-events-none">
              <div className="relative flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full z-10 transition-colors duration-300 ${isConnected ? 'bg-cyan-400' : 'bg-neutral-600'}`} />
                {isConnected && (
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping opacity-75" />
                )}
              </div>
              <span className={`text-xs font-semibold tracking-wider uppercase transition-colors duration-300 ${
                isConnected ? 'text-cyan-100' : 'text-neutral-500'
              }`}>
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={(e) => { e.stopPropagation(); openWidget(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title="Popout Widget"
              >
                <ExternalLink size={14} />
              </button>
              <GripHorizontal size={14} className="text-neutral-500 pointer-events-none" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-500/70 font-mono uppercase tracking-wider pointer-events-none">
            <div className={`w-1.5 h-1.5 rounded-full ${currentVoice.color}`} />
            Voice: {currentVoice.name}
          </div>
        </div>

        {/* Widget Body */}
        <div className="p-4 flex flex-col gap-3 flex-1 justify-center">
          {/* Connect/Disconnect Box */}
          <button
            onClick={(e) => { e.stopPropagation(); isConnected ? disconnect() : connect(); }}
            disabled={isConnecting}
            className={`relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-mono tracking-widest uppercase transition-all duration-300 overflow-hidden ${
              isConnecting
                ? 'border-yellow-500/50 text-yellow-400 bg-yellow-950/30'
                : isConnected 
                ? 'border-emerald-500/50 text-emerald-400 bg-emerald-950/30 hover:bg-red-900/40 hover:border-red-500/50 hover:text-red-400 group shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                : 'border-cyan-500/30 text-cyan-400 bg-cyan-950/30 hover:bg-cyan-900/40'
            }`}
          >
            {isConnecting ? (
              <><Loader2 size={14} className="animate-spin" /> CONNECTING...</>
            ) : isConnected ? (
              <>
                <Check size={14} className="group-hover:hidden" />
                <MicOff size={14} className="hidden group-hover:block" />
                <span className="group-hover:hidden">CONNECTED</span>
                <span className="hidden group-hover:block">DISCONNECT</span>
              </>
            ) : (
              <><Mic size={14} /> CONNECT AI</>
            )}
          </button>

          {/* Voice Status Box */}
          <div className={`relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-mono tracking-widest uppercase transition-all duration-300 overflow-hidden ${
            !isConnected ? 'border-neutral-800 text-neutral-600 bg-neutral-900/50' :
            isUserSpeaking ? 'border-cyan-400/60 text-cyan-100 bg-gradient-to-r from-cyan-900/40 to-cyan-800/40 shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'border-cyan-900/50 text-cyan-600 bg-cyan-950/30'
          }`}>
            <div className="relative flex items-center gap-2 z-10">
              {!isConnected ? (
                <>OFFLINE</>
              ) : isUserSpeaking ? (
                <><Activity size={14} className="text-cyan-300 animate-pulse" /> LISTENING</>
              ) : (
                <><Moon size={14} className="opacity-50" /> IDLE</>
              )}
            </div>
          </div>
        </div>
        
        {/* Resize Handle Hint */}
        <div className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize opacity-50 pointer-events-none text-neutral-500">
          <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 10V8H10V10H8ZM5 10V8H7V10H5ZM8 7V5H10V7H8ZM2 10V8H4V10H2ZM5 7V5H7V7H5ZM8 4V2H10V4H8Z" fill="currentColor"/>
          </svg>
        </div>
      </div>

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
                onClick={() => setActiveTab('device')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${activeTab === 'device' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'}`}
              >
                Device
              </button>
              <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${activeTab === 'general' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'}`}
              >
                General
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              {activeTab === 'device' && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest">Device Connection</h3>
                  
                  <div className="flex flex-col gap-3 p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white">Pair Tablet Remote</span>
                        <span className="text-xs text-neutral-400">Control AI from your tablet</span>
                      </div>
                      <Smartphone size={20} className="text-cyan-400" />
                    </div>
                    
                    {pairingStatus === 'connected' ? (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mt-2">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Check size={16} />
                          <span className="text-sm font-medium">Tablet Connected</span>
                        </div>
                        <button 
                          onClick={() => {
                            if (wsRef.current) wsRef.current.close();
                            setPairingStatus('idle');
                            localStorage.setItem('isDeviceConnected', 'false');
                            const newCode = generatePairingCode();
                            setMyDeviceCode(newCode);
                            startPairing(newCode);
                          }}
                          className="text-xs text-neutral-400 hover:text-white transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="text-xs text-neutral-400 mb-1 uppercase tracking-widest font-semibold">Your Pair Code</div>
                        <div className="flex items-center justify-between bg-black/50 border border-neutral-800 rounded-lg p-3 mb-2">
                          <span className="text-xl font-mono tracking-widest font-bold text-white">{myDeviceCode || '------'}</span>
                          <button 
                            onClick={() => {
                              const newCode = generatePairingCode();
                              setMyDeviceCode(newCode);
                              startPairing(newCode);
                            }}
                            className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                            title="Generate New Code"
                          >
                            <RefreshCw size={16} />
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-cyan-400 flex items-center gap-1.5">
                            <Loader2 size={12} className="animate-spin" /> Waiting for tablet...
                          </span>
                        </div>

                        <div className="relative flex items-center py-2">
                          <div className="flex-grow border-t border-neutral-800"></div>
                          <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs font-semibold uppercase tracking-widest">OR</span>
                          <div className="flex-grow border-t border-neutral-800"></div>
                        </div>

                        <div className="text-xs text-neutral-400 mb-1 uppercase tracking-widest font-semibold">Enter Tablet Code</div>
                        <input 
                          type="text"
                          value={inputCode}
                          onChange={(e) => {
                            let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            if (val.length > 4) {
                              val = val.slice(0, 4) + '-' + val.slice(4, 8);
                            }
                            setInputCode(val);
                          }}
                          placeholder="Enter code from tablet"
                          maxLength={9}
                          className="w-full bg-black/50 border border-neutral-800 rounded-lg p-2.5 text-center text-lg tracking-widest font-mono text-white focus:border-cyan-500 focus:outline-none"
                        />
                        <div className="flex gap-2 mt-2">
                          <button 
                            onClick={() => startPairing(inputCode)}
                            disabled={inputCode.length < 9}
                            className="flex-1 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            CONNECT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'voice' && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest">AI Persona</h3>
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
                  
                  <div className="flex flex-col gap-4 p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white">Use Laptop Audio</span>
                        <span className="text-xs text-neutral-400">Capture audio from this device</span>
                      </div>
                      <button
                        onClick={() => handleUseLaptopAudioToggle(!useLaptopAudio)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${useLaptopAudio ? 'bg-cyan-500' : 'bg-neutral-700'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useLaptopAudio ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

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
          onClick={isConnected ? disconnect : connect}
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
                <Smartphone size={14} /> Companion Links
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
