import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, ExternalLink, Activity, Moon, GripHorizontal, Settings, X, Check, ChevronLeft, ChevronRight, RefreshCw, Smartphone, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Peer from 'peerjs';

// Patch PeerJS to prevent unhandled promise rejections from its internal socket
if (Peer && Peer.prototype) {
  const originalInit = (Peer.prototype as any)._initializeServerConnection;
  if (originalInit) {
    (Peer.prototype as any)._initializeServerConnection = function() {
      if (this._socket && typeof this._socket.start === 'function' && !this._socket.__patched) {
        const originalStart = this._socket.start;
        this._socket.start = function() {
          try {
            const promise = originalStart.apply(this, arguments);
            if (promise && typeof promise.catch === 'function') {
              promise.catch((err: any) => {
                // Suppress internal unhandled rejection
              });
            }
            return promise;
          } catch (e) {
            // Ignore synchronous errors
          }
        };
        this._socket.__patched = true;
      }
      return originalInit.apply(this, arguments);
    };
  }
}

import { useGeminiLive } from './useGeminiLive';
import { ANIME_VOICES } from './voices';
import { FloatingWidget } from './components/FloatingWidget';

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
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'waiting' | 'connected' | 'expired'>('idle');
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<'voice' | 'device' | 'general'>('voice');

  const currentVoice = ANIME_VOICES.find(v => v.id === selectedVoiceId) || ANIME_VOICES[0];

  useEffect(() => {
    const saved = localStorage.getItem('selectedVoiceId');
    if (saved) setSelectedVoiceId(saved);
    
    setUseLaptopAudio(localStorage.getItem('useLaptopAudio') !== 'false');
    setTaskPrompt(localStorage.getItem('taskPrompt') || '');

    // Auto-generate and start pairing
    startPairing();
    
    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const startPairing = async () => {
    try {
      setPairingStatus('waiting');
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setMyDeviceCode(code);
      
      if (peerRef.current) peerRef.current.destroy();
      
      const peerId = `ais-laptop-${code}`;
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('Laptop peer ready:', id);
      });

      peer.on('connection', (conn) => {
        connRef.current = conn;
        
        conn.on('open', () => {
          setPairingStatus('connected');
          localStorage.setItem('isDeviceConnected', 'true');
          
          // Send initial state
          conn.send({
            type: 'state',
            aiState: {
              isConnected,
              isUserSpeaking,
              isAiSpeaking,
              voiceName: currentVoice.name,
              voiceColor: currentVoice.color
            }
          });
        });

        conn.on('data', (data: any) => {
          if (data.type === 'command') {
            handleRemoteCommand(data.command);
          } else if (data.type === 'device_info') {
            localStorage.setItem('deviceApps', JSON.stringify(data.apps));
          }
        });

        conn.on('close', () => {
          setPairingStatus('idle');
          localStorage.setItem('isDeviceConnected', 'false');
          startPairing();
        });
      });

      peer.on('disconnected', () => {
        console.log('PeerJS disconnected, attempting to reconnect...');
        if (!peer.destroyed) {
          peer.reconnect();
        }
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
          // Do not reset pairing status on temporary network errors
          console.log('Temporary network error, waiting for reconnect...');
        } else {
          setPairingStatus('idle');
          localStorage.setItem('isDeviceConnected', 'false');
        }
      });
      
    } catch (e) {
      console.error("Failed to register device", e);
    }
  };

  const handleRemoteCommand = (payload: any) => {
    const { command, url, details } = payload;
    if (command === 'play_music') {
      window.open('https://open.spotify.com', '_blank');
    } else if (command === 'open_youtube') {
      if (details) {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(details)}`, '_blank');
      } else {
        window.open('https://youtube.com', '_blank');
      }
    } else if (command === 'open_website' && url) {
      window.open(url, '_blank');
    } else if (command === 'execute_task') {
      if (!isConnected) connect(myDeviceCode);
    }
  };

  useEffect(() => {
    if (pairingStatus === 'connected' && connRef.current) {
      connRef.current.send({
        type: 'state',
        aiState: {
          isConnected,
          isUserSpeaking,
          isAiSpeaking,
          voiceName: currentVoice.name,
          voiceColor: currentVoice.color
        }
      });
    }
  }, [isConnected, isUserSpeaking, isAiSpeaking, currentVoice, pairingStatus]);

  useEffect(() => {
    if (sendTabletCommand) {
      if (sendTabletCommand.action === 'open_app' && sendTabletCommand.app === 'spotify') {
        fetch('http://192.168.1.2:8080/command', { mode: 'no-cors' }).catch(console.error);
      }
    }
  }, [sendTabletCommand]);

  useEffect(() => {
    if (sendTabletCommand && pairingStatus === 'connected' && connRef.current) {
      if (!(sendTabletCommand.action === 'open_app' && sendTabletCommand.app === 'spotify')) {
        connRef.current.send({
          type: 'command',
          target: 'tablet',
          command: sendTabletCommand
        });
      }
    }
  }, [sendTabletCommand, pairingStatus]);

  const handleVoiceSelect = (id: string) => {
    setSelectedVoiceId(id);
    localStorage.setItem('selectedVoiceId', id);
    if (isConnected) {
      disconnect();
      setTimeout(() => {
        connect(myDeviceCode);
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
        onConnect={() => connect(myDeviceCode)}
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
                            if (connRef.current) connRef.current.close();
                            if (peerRef.current) peerRef.current.destroy();
                            setPairingStatus('idle');
                            localStorage.setItem('isDeviceConnected', 'false');
                            startPairing();
                          }}
                          className="text-xs text-neutral-400 hover:text-white transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 mt-2">
                        <div className="text-xs text-neutral-400 uppercase tracking-widest font-semibold">Pairing Code</div>
                        
                        <div className="flex items-center justify-between bg-black/50 border border-neutral-800 rounded-lg p-4">
                          <span className="text-3xl font-mono tracking-widest font-bold text-white tracking-[0.5em]">{myDeviceCode || '------'}</span>
                          <button 
                            onClick={() => {
                              if (connRef.current) connRef.current.close();
                              if (peerRef.current) peerRef.current.destroy();
                              startPairing();
                            }}
                            className="p-2 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                            title="Generate New Code"
                          >
                            <RefreshCw size={20} />
                          </button>
                        </div>

                        <div className="text-xs text-neutral-400 uppercase tracking-widest font-semibold mt-2">Direct Link & QR</div>
                        
                        <div className="flex gap-4 items-center bg-black/30 border border-neutral-800 rounded-lg p-4">
                          <div className="bg-white p-2 rounded-lg shrink-0">
                            {myDeviceCode ? (
                              <QRCodeSVG 
                                value={`${window.location.origin}/#/tablet?code=${myDeviceCode}`} 
                                size={80} 
                                level="L"
                              />
                            ) : (
                              <div className="w-[80px] h-[80px] bg-neutral-200 animate-pulse rounded" />
                            )}
                          </div>
                          <div className="flex flex-col gap-2 w-full overflow-hidden">
                            <div className="text-xs text-neutral-400">Scan QR or use link:</div>
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                readOnly 
                                value={`${window.location.origin}/#/tablet?code=${myDeviceCode}`}
                                className="w-full bg-black/50 border border-neutral-700 rounded p-2 text-xs text-neutral-300 outline-none"
                              />
                              <button 
                                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/#/tablet?code=${myDeviceCode}`)}
                                className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 transition-colors"
                                title="Copy Link"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-xs text-cyan-200/80">
                          <strong className="text-cyan-400 block mb-1">Backup Method:</strong>
                          If the tablet UI is broken, simply open the direct link above in any browser on your tablet to automatically join the session.
                        </div>
                        
                        <div className="flex items-center justify-between text-xs mt-2">
                          <span className="text-cyan-400 flex items-center gap-1.5">
                            <Loader2 size={12} className="animate-spin" /> Waiting for tablet...
                          </span>
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
          onClick={() => isConnected ? disconnect() : connect(myDeviceCode)}
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
