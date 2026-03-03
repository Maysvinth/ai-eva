import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite WebSocket and PeerJS errors
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

const shouldSuppress = (args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : String(args[0] || '');
  return (
    msg.includes('[vite] failed to connect to websocket') || 
    msg.includes('WebSocket closed without opened') ||
    msg.includes('Lost connection to server') ||
    (args[0] === 'PeerJS error:' && args[1]?.type === 'network')
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

// Also suppress unhandled promise rejections for "WebSocket closed without opened"
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason);
  if (
    reasonStr.includes('WebSocket closed without opened') || 
    (event.reason && event.reason.message && event.reason.message.includes('WebSocket closed without opened'))
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.includes('WebSocket closed without opened') || msg.includes('[vite] failed to connect to websocket')) {
    event.preventDefault();
    event.stopPropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
