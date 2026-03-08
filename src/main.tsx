import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite WebSocket and PeerJS errors
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

const shouldSuppress = (args: any[]) => {
  const fullMsg = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message;
    if (arg && typeof arg === 'object' && arg.message) return arg.message;
    return String(arg);
  }).join(' ');

  return (
    fullMsg.includes('[vite] failed to connect to websocket') || 
    fullMsg.includes('WebSocket') ||
    fullMsg.includes('Lost connection to server') ||
    (args[0] === 'PeerJS error:' && args[1]?.type === 'network') ||
    (args[0] === 'PeerJS error:' && args[1]?.type === 'peer-unavailable')
  );
};

console.error = (...args) => {
  if (shouldSuppress(args)) return;
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  if (shouldSuppress(args)) return;
  originalConsoleWarn.apply(console, args);
};

console.log = (...args) => {
  if (shouldSuppress(args)) return;
  originalConsoleLog.apply(console, args);
};

// Also suppress unhandled promise rejections for "WebSocket closed without opened" and other WebSocket errors
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason);
  const msg = event.reason?.message || '';
  if (
    reasonStr.includes('WebSocket') || 
    msg.includes('WebSocket') ||
    reasonStr.includes('peer-unavailable') ||
    event.reason?.type === 'peer-unavailable'
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.includes('WebSocket') || msg.includes('[vite] failed to connect to websocket')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
