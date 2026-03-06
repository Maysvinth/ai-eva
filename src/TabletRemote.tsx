import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Globe, Music, Terminal, Loader2, Link as LinkIcon, Unlink, Check, X, Mic } from 'lucide-react';
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

export function TabletRemote() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCommand, setLastCommand] = useState<string>('Waiting...');
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  const [pos, setPos] = useState({ x: 20, y: 20 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current.isDragging = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

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
    const { action, app, command, url, message } = payload;
    
    if (action === 'open_app' || action === 'play_music') {
      let appName = (app || '').toLowerCase();
      setLastCommand(`Opening ${appName}...`);
      const isAndroid = /Android/.test(navigator.userAgent);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (appName === 'browser') {
        window.open('https://www.google.com', '_blank');
        return;
      }

      const attemptLaunch = (retryCount = 0) => {
        let scheme = '';
        let fallbackUrl = '';

        if (appName === 'spotify') {
          if (isAndroid) {
            scheme = 'intent://#Intent;package=com.spotify.music;scheme=spotify;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.spotify.music;end;';
          } else {
            scheme = 'spotify://';
            fallbackUrl = 'https://apps.apple.com/app/spotify-music/id324684580';
          }
        } else if (appName === 'youtube') {
          if (isAndroid) {
            scheme = 'intent://#Intent;package=com.google.android.youtube;scheme=vnd.youtube;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.google.android.youtube;end;';
          } else {
            scheme = 'youtube://';
            fallbackUrl = 'https://apps.apple.com/app/youtube-watch-listen-stream/id544007664';
          }
        }

        if (scheme) {
          const start = Date.now();
          window.location.href = scheme;
          
          setTimeout(() => {
            if (Date.now() - start < 2500 && !document.hidden) {
              if (retryCount === 0) {
                // Retry once automatically
                console.log(`Retrying launch for ${appName}...`);
                attemptLaunch(1);
              } else {
                if (fallbackUrl && !isAndroid) {
                  window.location.href = fallbackUrl;
                } else if (!isAndroid) {
                  setErrorMsg(`${appName} is not available or not installed on this device.`);
                  setTimeout(() => setErrorMsg(''), 5000); // Clear after 5 seconds
                }
                // If Android, the intent fallback URL handles the Play Store redirect automatically
              }
            }
          }, 2000);
        } else if (appName) {
            // Fallback for unsupported apps
            window.open(`https://www.google.com/search?q=${encodeURIComponent(appName)}`, '_blank');
        }
      };

      attemptLaunch(0);
      return;
    }

    if (action === 'open_url' && url) {
      setLastCommand(`Opening URL...`);
      window.open(url, '_blank');
    } else if (action === 'media_control') {
      setLastCommand(`Media: ${command}`);
      console.log('Media control requested:', command);
    } else if (action === 'error') {
      setLastCommand(`Error: ${message}`);
      setErrorMsg(message || 'Error executing command');
      setTimeout(() => setErrorMsg(''), 5000);
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

      peer.on('disconnected', () => {
        console.log('PeerJS disconnected, attempting to reconnect...');
        if (!peer.destroyed) {
          peer.reconnect();
        }
      });

      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
          setStatus('error');
          setErrorMsg('Invalid or expired code');
        } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
          console.log('Temporary network error, waiting for reconnect...');
        } else {
          setStatus('error');
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden bg-transparent">
        <div 
          className="absolute z-50 flex flex-col bg-black/80 backdrop-blur-md border border-neutral-800 shadow-2xl pointer-events-auto"
          style={{ 
            left: pos.x, 
            top: pos.y, 
            width: '220px', 
            height: '120px', 
            borderRadius: '16px',
            touchAction: 'none' 
          }}
        >
          {/* Drag Handle / Header */}
          <div 
            className="flex items-center justify-between p-3 border-b border-neutral-800 bg-neutral-900/50 cursor-move"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className="relative flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full z-10 bg-emerald-400" />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </div>
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400">
                Connected
              </span>
            </div>
            <button 
              onClick={() => {
                if (connRef.current) connRef.current.close();
                if (peerRef.current) peerRef.current.destroy();
                setStatus('idle');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Widget Body */}
          <div className="p-3 flex flex-col gap-2 flex-1 justify-center">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full transition-colors duration-300 ${aiState.isUserSpeaking ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'bg-neutral-800 text-neutral-500'}`}>
                <Mic size={18} className={aiState.isUserSpeaking ? 'animate-pulse' : ''} />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider">Last Command</span>
                <span className="text-xs text-white truncate font-medium">{lastCommand}</span>
              </div>
            </div>
          </div>
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
