import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Globe, Music, Terminal, Loader2, Link as LinkIcon, Unlink, Check } from 'lucide-react';

export function TabletRemote() {
  const [myDeviceCode, setMyDeviceCode] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const generatePairingCode = () => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const numbers = '0123456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += letters.charAt(Math.floor(Math.random() * letters.length));
      c += '-';
      for (let i = 0; i < 4; i++) c += numbers.charAt(Math.floor(Math.random() * numbers.length));
      return c;
    };
    
    const initialCode = generatePairingCode();
    setMyDeviceCode(initialCode);
    
    // Auto-register the tablet's code
    const wsUrl = window.location.protocol === 'https:' 
      ? `wss://${window.location.host}/ws` 
      : `ws://${window.location.host}/ws`;
      
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register_device', role: 'tablet', code: initialCode }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setStatus('connected');
        } else if (data.type === 'error') {
          setStatus('error');
          setErrorMsg(data.message);
          ws.close();
        } else if (data.type === 'disconnected') {
          setStatus('idle');
          setErrorMsg('Laptop disconnected');
        } else if (data.type === 'tablet_command') {
          handleTabletCommand(data.payload);
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('Connection error');
    };
    
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
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

  const connect = () => {
    if (!code || code.length !== 9) {
      setErrorMsg('Please enter a valid code (e.g. ABXZ-4821)');
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    const wsUrl = window.location.protocol === 'https:' 
      ? `wss://${window.location.host}/ws` 
      : `ws://${window.location.host}/ws`;
      
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connect_device', role: 'tablet', code: code.toUpperCase() }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setStatus('connected');
        } else if (data.type === 'error') {
          setStatus('error');
          setErrorMsg(data.message);
          ws.close();
        } else if (data.type === 'disconnected') {
          setStatus('idle');
          setErrorMsg('Laptop disconnected');
        } else if (data.type === 'tablet_command') {
          handleTabletCommand(data.payload);
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('Connection error');
    };
  };

  const sendCommand = (cmd: string, args?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'command',
        payload: { command: cmd, ...args }
      }));
    }
  };

  if (status === 'connected') {
    return (
      <div className="flex flex-col h-screen bg-neutral-950 text-white font-sans p-6">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-xl font-semibold text-cyan-100">Remote Control</h1>
          </div>
          <button 
            onClick={() => {
              wsRef.current?.close();
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
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-400 uppercase tracking-widest font-semibold text-center">Your Tablet Code</div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
              <span className="text-2xl font-mono tracking-widest font-bold text-white">{myDeviceCode || '------'}</span>
            </div>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-neutral-800"></div>
            <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs font-semibold uppercase tracking-widest">OR</span>
            <div className="flex-grow border-t border-neutral-800"></div>
          </div>

          <div className="text-xs text-neutral-400 uppercase tracking-widest font-semibold text-center">Enter Laptop Code</div>
          <input 
            type="text"
            value={code}
            onChange={(e) => {
              let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (val.length > 4) {
                val = val.slice(0, 4) + '-' + val.slice(4, 8);
              }
              setCode(val);
            }}
            placeholder="ABXZ-4821"
            maxLength={9}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center text-2xl tracking-widest font-mono text-white focus:border-cyan-500 focus:outline-none"
          />
          
          {errorMsg && (
            <div className="text-red-400 text-sm text-center font-medium">{errorMsg}</div>
          )}

          <button 
            onClick={connect}
            disabled={code.length !== 9 || status === 'connecting'}
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
