import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Activity, Moon, GripHorizontal, Loader2, Check, ExternalLink } from 'lucide-react';

interface FloatingWidgetProps {
  isConnected: boolean;
  isConnecting?: boolean;
  isUserSpeaking: boolean;
  isAiSpeaking: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  voiceName?: string;
  voiceColor?: string;
}

export function FloatingWidget({ 
  isConnected, 
  isConnecting,
  isUserSpeaking, 
  isAiSpeaking, 
  onConnect, 
  onDisconnect,
  voiceName = "AI",
  voiceColor = "bg-cyan-400"
}: FloatingWidgetProps) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const [popoutWindow, setPopoutWindow] = useState<Window | null>(null);
  const [popoutContainer, setPopoutContainer] = useState<HTMLElement | null>(null);

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

  const handlePopout = async () => {
    if (popoutWindow) {
      popoutWindow.focus();
      return;
    }

    let targetWindow: Window | null = null;

    // Document Picture-in-Picture API requires a top-level browsing context.
    if ('documentPictureInPicture' in window && window === window.top) {
      try {
        targetWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 320,
          height: 240,
        });
      } catch (e) {
        console.warn('PiP failed, falling back to window.open', e);
      }
    }

    if (!targetWindow) {
      targetWindow = window.open('', '', 'width=320,height=240,left=200,top=200');
    }

    if (!targetWindow) return;

    // Copy styles
    Array.from(document.styleSheets).forEach(styleSheet => {
      try {
        if (styleSheet.href) {
          const newLinkEl = targetWindow!.document.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          targetWindow!.document.head.appendChild(newLinkEl);
        } else {
          const newStyleEl = targetWindow!.document.createElement('style');
          newStyleEl.appendChild(targetWindow!.document.createTextNode(
            Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('')
          ));
          targetWindow!.document.head.appendChild(newStyleEl);
        }
      } catch (e) {
        console.warn('Could not copy stylesheet', e);
      }
    });

    targetWindow.document.body.className = "bg-black text-white h-full m-0 flex flex-col items-center justify-center";
    
    const container = targetWindow.document.createElement('div');
    container.className = "w-full h-full p-4 flex flex-col gap-3 justify-center";
    targetWindow.document.body.appendChild(container);

    const closeHandler = () => {
      setPopoutWindow(null);
      setPopoutContainer(null);
    };

    targetWindow.addEventListener('pagehide', closeHandler);
    targetWindow.addEventListener('beforeunload', closeHandler);

    setPopoutWindow(targetWindow);
    setPopoutContainer(container);
  };

  const widgetContent = (
    <>
      {popoutWindow && (
        <div className="flex items-center justify-between w-full mb-2">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-500/70 font-mono uppercase tracking-wider">
            <div className={`w-1.5 h-1.5 rounded-full ${voiceColor}`} />
            Voice: {voiceName}
          </div>
        </div>
      )}

      {/* Connect/Disconnect Box */}
      {onConnect && onDisconnect && (
        <button
          onClick={(e) => { e.stopPropagation(); isConnected ? onDisconnect() : onConnect(); }}
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
      )}

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
    </>
  );

  if (popoutWindow && popoutContainer) {
    return createPortal(widgetContent, popoutContainer);
  }

  return (
    <div 
      className="fixed z-50 flex flex-col bg-black/80 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y, minWidth: '240px', touchAction: 'none' }}
    >
      {/* Drag Handle / Header */}
      <div 
        className="flex flex-col p-3 border-b border-neutral-800 bg-neutral-900/50 cursor-move gap-1.5"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
              onClick={(e) => { e.stopPropagation(); handlePopout(); }}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
              title="Popout Widget"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ExternalLink size={14} />
            </button>
            <GripHorizontal size={14} className="text-neutral-500 pointer-events-none ml-1" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-cyan-500/70 font-mono uppercase tracking-wider pointer-events-none">
          <div className={`w-1.5 h-1.5 rounded-full ${voiceColor}`} />
          Voice: {voiceName}
        </div>
      </div>

      {/* Widget Body */}
      <div className="p-4 flex flex-col gap-3 flex-1 justify-center">
        {widgetContent}
      </div>
    </div>
  );
}