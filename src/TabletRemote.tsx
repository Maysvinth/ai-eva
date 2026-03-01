import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Globe, Music, Terminal, Loader2, Link as LinkIcon, Unlink, Check, QrCode, X } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { FloatingWidget } from './components/FloatingWidget';

export function TabletRemote() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if code is in URL
    try {
      const hashParts = window.location.hash.split('?');
      if (hashParts.length > 1) {
        const urlParams = new URLSearchParams(hashParts[1]);
        const codeFromUrl = urlParams.get('code');
        if (codeFromUrl && codeFromUrl.length === 6) {
          setCode(codeFromUrl);
          connect(codeFromUrl);
        }
      }
    } catch (e) {
      console.error(e);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleTabletCommand = (payload: any) => {
    const { action, target, details } = payload;
    if (target === 'YOUTUBE') {
      if (action === 'PLAY') {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(details)}`, '_blank');
      }
    } else if (target === 'SPOTIFY') {
      if (action === 'PLAY') {
        window.open(`https://open.spotify.com/search/${encodeURIComponent(details)}`, '_blank');
      }
    } else if (target === 'BROWSER') {
      if (action === 'OPEN') {
        window.open(details, '_blank');
      }
    } else if (target === 'GOOGLE') {
      if (action === 'SEARCH') {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(details)}`, '_blank');
      }
    }
  };

  const [aiState, setAiState] = useState({
    isConnected: false,
    isUserSpeaking: false,
    isAiSpeaking: false,
    voiceName: 'AI',
    voiceColor: 'bg-cyan-400'
  });

  const connect = async (codeToUse?: string) => {
    const finalCode = codeToUse || code;
    if (!finalCode || finalCode.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit code');
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/device/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: finalCode })
      });
      const data = await res.json();
      
      if (data.success) {
        setStatus('connected');
        
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        pollIntervalRef.current = window.setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/device/poll-tablet?code=${finalCode}`);
            const pollData = await pollRes.json();
            
            if (pollData.status === 'disconnected') {
              setStatus('idle');
              setErrorMsg('Laptop disconnected');
              clearInterval(pollIntervalRef.current!);
            } else {
              if (pollData.aiState) {
                setAiState(pollData.aiState);
              }
              if (pollData.commands && pollData.commands.length > 0) {
                pollData.commands.forEach((cmd: any) => handleTabletCommand(cmd));
              }
            }
          } catch (e) {
            console.error("Polling error", e);
          }
        }, 2000);
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Connection failed');
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg('Connection error');
    }
  };

  const sendCommand = (cmd: string, args?: any) => {
    if (status === 'connected') {
      fetch('/api/device/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          command: { command: cmd, ...args },
          target: 'laptop'
        })
      }).catch(console.error);
    }
  };

  if (status === 'connected') {
    return (
      <div className="flex flex-col h-screen bg-neutral-950 text-white font-sans p-6 overflow-hidden relative">
        <FloatingWidget 
          isConnected={aiState.isConnected}
          isUserSpeaking={aiState.isUserSpeaking}
          isAiSpeaking={aiState.isAiSpeaking}
          voiceName={aiState.voiceName}
          voiceColor={aiState.voiceColor}
        />

        <div className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-xl font-semibold text-cyan-100">Remote Control</h1>
          </div>
          <button 
            onClick={() => {
              fetch('/api/device/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
              }).catch(console.error);
              setStatus('idle');
            }}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Unlink size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => sendCommand('play_music')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 hover:border-cyan-500/50 transition-all"
          >
            <Music size={32} className="text-cyan-400" />
            <span className="font-medium">Play Music</span>
          </button>
          
          <button 
            onClick={() => sendCommand('open_youtube')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 hover:border-red-500/50 transition-all"
          >
            <Play size={32} className="text-red-500" />
            <span className="font-medium">YouTube</span>
          </button>

          <button 
            onClick={() => sendCommand('open_website', { url: 'https://google.com' })}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 hover:border-blue-500/50 transition-all"
          >
            <Globe size={32} className="text-blue-400" />
            <span className="font-medium">Browser</span>
          </button>

          <button 
            onClick={() => sendCommand('execute_task')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 hover:border-emerald-500/50 transition-all"
          >
            <Terminal size={32} className="text-emerald-400" />
            <span className="font-medium">Run Task</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-neutral-950 text-white font-sans p-6">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-900/30 border border-cyan-500/30 flex items-center justify-center mb-4">
            <LinkIcon size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Connect to Laptop</h1>
          <p className="text-neutral-400">Enter the 8-character pairing code shown in your laptop's AI settings.</p>
        </div>

        <div className="w-full flex flex-col gap-4">
          {isScanning ? (
            <div className="w-full rounded-xl overflow-hidden border border-neutral-800 relative bg-black aspect-square">
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0) {
                    const text = result[0].rawValue;
                    if (text.includes('code=')) {
                      const urlParams = new URLSearchParams(text.split('?')[1]);
                      const codeFromUrl = urlParams.get('code');
                      if (codeFromUrl && codeFromUrl.length === 6) {
                        setIsScanning(false);
                        setCode(codeFromUrl);
                        connect(codeFromUrl);
                      }
                    } else if (text.length === 6 && /^\d+$/.test(text)) {
                      setIsScanning(false);
                      setCode(text);
                      connect(text);
                    }
                  }
                }}
                onError={(error) => console.error(error)}
              />
              <button 
                onClick={() => setIsScanning(false)}
                className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsScanning(true)}
              className="w-full py-4 rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white"
            >
              <QrCode size={20} /> Scan QR Code
            </button>
          )}

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-neutral-800"></div>
            <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs font-semibold uppercase tracking-widest">OR ENTER PIN</span>
            <div className="flex-grow border-t border-neutral-800"></div>
          </div>

          <input 
            type="text"
            value={code}
            onChange={(e) => {
              let val = e.target.value.replace(/[^0-9]/g, '');
              setCode(val);
              if (val.length === 6) {
                connect(val);
              }
            }}
            placeholder="123456"
            maxLength={6}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center text-2xl tracking-widest font-mono text-white focus:border-cyan-500 focus:outline-none"
          />
          
          {errorMsg && (
            <div className="text-red-400 text-sm text-center font-medium">{errorMsg}</div>
          )}

          <button 
            onClick={() => connect()}
            disabled={code.length !== 6 || status === 'connecting'}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2 ${
              status === 'connecting' 
                ? 'bg-yellow-500 text-black' 
                : status === 'error'
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-cyan-500 hover:bg-cyan-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black'
            }`}
          >
            {status === 'connecting' ? (
              <><Loader2 size={20} className="animate-spin" /> Connecting...</>
            ) : status === 'error' ? (
              'Retry Connection'
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
