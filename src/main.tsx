import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite WebSocket and PeerJS errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('[vite] failed to connect to websocket') || 
      msg.includes('WebSocket closed without opened') ||
      msg.includes('Lost connection to server') ||
      (args[0] === 'PeerJS error:' && args[1]?.type === 'network')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// Also suppress unhandled promise rejections for "WebSocket closed without opened"
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && typeof event.reason.message === 'string' && event.reason.message.includes('WebSocket closed without opened')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
