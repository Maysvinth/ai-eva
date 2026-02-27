import { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2, Activity, Moon } from 'lucide-react';
import { useGeminiLive } from './useGeminiLive';
import { ANIME_VOICES } from './voices';

export function WidgetAI() {
  const { isConnected, isConnecting, isUserSpeaking, connect, disconnect } = useGeminiLive();
  const [selectedVoiceId, setSelectedVoiceId] = useState('zephyr-kuudere');

  useEffect(() => {
    const saved = localStorage.getItem('selectedVoiceId');
    if (saved) setSelectedVoiceId(saved);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'selectedVoiceId' && e.newValue) {
        setSelectedVoiceId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const currentVoice = ANIME_VOICES.find(v => v.id === selectedVoiceId) || ANIME_VOICES[0];

  return (
    <div className="flex flex-col justify-center h-screen w-screen bg-neutral-950 text-white font-sans p-4 relative overflow-hidden">
      {/* Background glow when connected */}
      {isConnected && (
        <div className="absolute inset-0 bg-cyan-900/20 blur-3xl rounded-full transition-opacity duration-1000" />
      )}
      
      <div className={`relative flex flex-col gap-4 bg-black/80 backdrop-blur-md border rounded-xl p-4 transition-all duration-500 ${
        isConnected ? 'border-cyan-500/40 shadow-[0_0_30px_rgba(0,255,255,0.15)]' : 'border-neutral-800 shadow-none'
      }`}>
        
        {/* Top Row: Connection Status */}
        <div className="flex flex-col items-center justify-center pb-2 border-b border-neutral-800/50 gap-1.5">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className={`w-2 h-2 rounded-full z-10 transition-colors duration-300 ${isConnected ? 'bg-cyan-400' : 'bg-neutral-600'}`} />
              {isConnected && (
                <div className="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping opacity-75" />
              )}
            </div>
            <span className={`text-xs font-semibold tracking-wider uppercase transition-colors duration-300 ${
              isConnected ? 'text-cyan-100' : 'text-neutral-500'
            }`}>
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-cyan-500/70 font-mono uppercase tracking-wider text-center">
            <div className={`w-1.5 h-1.5 rounded-full ${currentVoice.color}`} />
            Voice: {currentVoice.name}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* Connect/Disconnect Box */}
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-mono tracking-widest uppercase transition-all duration-300 overflow-hidden ${
              isConnected 
                ? 'border-red-500/30 text-red-400 bg-red-950/30 hover:bg-red-900/40' 
                : 'border-cyan-500/30 text-cyan-400 bg-cyan-950/30 hover:bg-cyan-900/40'
            }`}
          >
            {isConnecting ? (
              <><Loader2 size={14} className="animate-spin" /> CONNECTING...</>
            ) : isConnected ? (
              <><MicOff size={14} /> DISCONNECT</>
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

      </div>
    </div>
  );
}
