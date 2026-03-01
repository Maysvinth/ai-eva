import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from 'ws';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- WebSocket Device Connection Method ---
  
  interface DeviceSession {
    laptopSocket: WebSocket | null;
    tabletSocket: WebSocket | null;
    aiState: {
      isConnected: boolean;
      isUserSpeaking: boolean;
      isAiSpeaking: boolean;
      voiceName: string;
      voiceColor: string;
    };
    status: 'waiting' | 'connected';
  }
  
  const sessions = new Map<string, DeviceSession>();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const role = url.searchParams.get('role'); // 'laptop' or 'tablet'

    if (!code || !role) {
      ws.close(1008, 'Missing code or role');
      return;
    }

    let session = sessions.get(code);

    if (role === 'laptop') {
      if (!session) {
        session = {
          laptopSocket: ws,
          tabletSocket: null,
          aiState: { isConnected: false, isUserSpeaking: false, isAiSpeaking: false, voiceName: 'AI', voiceColor: 'bg-cyan-400' },
          status: 'waiting'
        };
        sessions.set(code, session);
      } else {
        session.laptopSocket = ws;
      }
      
      ws.send(JSON.stringify({ type: 'status', status: session.status }));
    } else if (role === 'tablet') {
      if (session) {
        session.tabletSocket = ws;
        session.status = 'connected';
        if (session.laptopSocket) {
          session.laptopSocket.send(JSON.stringify({ type: 'status', status: 'connected' }));
        }
        ws.send(JSON.stringify({ type: 'status', status: 'connected', aiState: session.aiState }));
      } else {
        ws.close(1008, 'Invalid code');
        return;
      }
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (!session) return;

        if (role === 'laptop') {
          if (data.type === 'state') {
            session.aiState = { ...session.aiState, ...data.aiState };
            if (session.tabletSocket) {
              session.tabletSocket.send(JSON.stringify({ type: 'state', aiState: session.aiState }));
            }
          } else if (data.type === 'command' && data.target === 'tablet') {
            if (session.tabletSocket) {
              session.tabletSocket.send(JSON.stringify({ type: 'command', command: data.command }));
            }
          }
        } else if (role === 'tablet') {
          if (data.type === 'command' && data.target === 'laptop') {
            if (session.laptopSocket) {
              session.laptopSocket.send(JSON.stringify({ type: 'command', command: data.command }));
            }
          }
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    });

    ws.on('close', () => {
      if (!session) return;
      if (role === 'laptop') {
        session.laptopSocket = null;
        if (session.tabletSocket) {
          session.tabletSocket.send(JSON.stringify({ type: 'status', status: 'disconnected' }));
        }
        sessions.delete(code);
      } else if (role === 'tablet') {
        session.tabletSocket = null;
        session.status = 'waiting';
        if (session.laptopSocket) {
          session.laptopSocket.send(JSON.stringify({ type: 'status', status: 'waiting' }));
        }
      }
    });
  });

  app.post("/api/device/register", (req, res) => {
    // Generate a 6-digit numeric code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    res.json({ code });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
