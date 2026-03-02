import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Globe, Music, Terminal, Loader2, Link as LinkIcon, Unlink, Check, X } from 'lucide-react';
import { FloatingWidget } from './components/FloatingWidget';
import Peer from 'peerjs';

export function TabletRemote() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  useEffect(() => {
    // Check if code is in URL
    try {
      const hashParts = window.location.hash.split('?');
      if (hashParts.length > 1) {
        const urlParams = new URLSearchParams(hashParts[1]);
        const codeFromUrl = urlParams.get('code');
        if (codeFromUrl && codeFromUrl.length === 6) {
          setCode(codeFromUrl.split(''));
          connect(codeFromUrl);
        }
      }
    } catch (e) {
      console.error(e);
    }

    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const handleTabletCommand = (payload: any) => {
    const { action, target, details } = payload;
    
    if (action === 'OPEN_APP') {
      let scheme = '';
      let appName = target.toLowerCase();
      
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (appName === 'browser') {
        window.open('https://www.google.com', '_blank');
        return;
      }

      if (appName === 'spotify') {
        scheme = 'spotify://';
      } else if (appName === 'youtube') {
        scheme = isIOS ? 'youtube://' : 'vnd.youtube://';
      }

      if (scheme) {
        const start = Date.now();
        window.location.href = scheme;
        
        setTimeout(() => {
          if (Date.now() - start < 2500 && !document.hidden) {
            setErrorMsg(`${target} is not available or not installed on this device.`);
            setTimeout(() => setErrorMsg(''), 5000); // Clear after 5 seconds
          }
        }, 2000);
      }
      return;
    }

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
    const finalCode = typeof codeToUse === 'string' ? codeToUse : code.join('');
    if (!finalCode || finalCode.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit code');
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      if (peerRef.current) peerRef.current.destroy();
      
      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
        const targetPeerId = `ais-laptop-${finalCode}`;
        const conn = peer.connect(targetPeerId);
        connRef.current = conn;

        conn.on('open', () => {
          setStatus('connected');
        });

        conn.on('data', (data: any) => {
          if (data.type === 'state') {
            if (data.aiState) {
              setAiState(data.aiState);
            }
          } else if (data.type === 'command') {
            handleTabletCommand(data.command);
          }
        });

        conn.on('close', () => {
          setStatus('idle');
          setErrorMsg('Laptop disconnected');
        });
        
        conn.on('error', (err) => {
          setStatus('error');
          setErrorMsg('Connection error');
        });
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        setStatus('error');
        if (err.type === 'peer-unavailable') {
          setErrorMsg('Invalid or expired code');
        } else {
          setErrorMsg('Connection error');
        }
      });

    } catch (e) {
      setStatus('error');
      setErrorMsg('Connection error');
    }
  };

  const sendCommand = (cmd: string, args?: any) => {
    if (status === 'connected' && connRef.current) {
      connRef.current.send({
        type: 'command',
        command: { command: cmd, ...args }
      });
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
              if (connRef.current) connRef.current.close();
              if (peerRef.current) peerRef.current.destroy();
              setStatus('idle');
            }}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Unlink size={20} />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm text-center animate-in fade-in slide-in-from-top-4">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => sendCommand('play_music')}
            className="flex flex-col items-center justify-center gap-3 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:bg-neutral-800 hover:border-cyan-500/50 transition-all"
          >
            <Music size={32} className="text-cyan-400" />
            <span className="font-medium">Play Music</span>
          </button>
          
          <button 
            onClick={() => {
              const query = prompt('What do you want to search on YouTube?');
              if (query) {
                sendCommand('open_youtube', { details: query });
              } else {
                sendCommand('open_youtube');
              }
            }}
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Connect to Laptop</h1>
            <div className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}>
              {status === 'connecting' && <Loader2 size={12} className="animate-spin" />}
              {status === 'error' && <X size={12} />}
              {status === 'idle' && <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />}
              {status}
            </div>
          </div>
          <p className="text-neutral-400">Enter the 6-digit pairing code shown in your laptop's AI settings.</p>
        </div>

        <div className="w-full flex flex-col gap-4">
          <div className="flex justify-between gap-2">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                maxLength={1}
                value={code[index]}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  const newCode = [...code];
                  newCode[index] = val;
                  setCode(newCode);
                  
                  if (val && index < 5) {
                    inputRefs.current[index + 1]?.focus();
                  }
                  
                  if (newCode.join('').length === 6) {
                    connect(newCode.join(''));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !code[index] && index > 0) {
                    inputRefs.current[index - 1]?.focus();
                  }
                }}
                className="w-12 h-14 bg-neutral-900 border border-neutral-800 rounded-xl text-center text-2xl font-mono text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
              />
            ))}
          </div>
          
          {errorMsg && (
            <div className="text-red-400 text-sm text-center font-medium">{errorMsg}</div>
          )}

          <button 
            onClick={() => connect()}
            disabled={code.join('').length !== 6 || status === 'connecting'}
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
