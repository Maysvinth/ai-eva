import express from "express";
import { createServer as createViteServer } from "vite";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- HTTP Polling Device Connection Method ---
  
  interface DeviceSession {
    laptopLastSeen: number;
    tabletLastSeen: number;
    laptopCommands: any[];
    tabletCommands: any[];
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

  // Cleanup stale sessions every 10 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions.entries()) {
      // If laptop hasn't polled in 30 seconds, delete session
      if (now - session.laptopLastSeen > 30000) {
        sessions.delete(code);
      }
    }
  }, 10000);

  app.post("/api/device/register", (req, res) => {
    // Generate a 6-digit numeric code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    sessions.set(code, {
      laptopLastSeen: Date.now(),
      tabletLastSeen: 0,
      laptopCommands: [],
      tabletCommands: [],
      aiState: { isConnected: false, isUserSpeaking: false, isAiSpeaking: false, voiceName: 'AI', voiceColor: 'bg-cyan-400' },
      status: 'waiting'
    });
    res.json({ code });
  });

  app.post("/api/device/connect", (req, res) => {
    const { code } = req.body;
    const session = sessions.get(code);
    if (session) {
      session.status = 'connected';
      session.tabletLastSeen = Date.now();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Invalid or expired code' });
    }
  });

  app.post("/api/device/state", (req, res) => {
    const { code, aiState } = req.body;
    const session = sessions.get(code);
    if (session) {
      session.aiState = { ...session.aiState, ...aiState };
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false });
    }
  });

  app.get("/api/device/poll-laptop", (req, res) => {
    const code = req.query.code as string;
    const session = sessions.get(code);
    if (session) {
      session.laptopLastSeen = Date.now();
      const commands = [...session.laptopCommands];
      session.laptopCommands = []; // Clear after reading
      
      // If tablet hasn't polled in 15 seconds, consider it disconnected
      if (session.status === 'connected' && Date.now() - session.tabletLastSeen > 15000) {
        session.status = 'waiting';
      }
      
      res.json({ status: session.status, commands });
    } else {
      res.json({ status: 'expired', commands: [] });
    }
  });

  app.get("/api/device/poll-tablet", (req, res) => {
    const code = req.query.code as string;
    const session = sessions.get(code);
    if (session) {
      session.tabletLastSeen = Date.now();
      const commands = [...session.tabletCommands];
      session.tabletCommands = []; // Clear after reading
      
      // If laptop hasn't polled in 15 seconds, consider it disconnected
      if (Date.now() - session.laptopLastSeen > 15000) {
        res.json({ status: 'disconnected', aiState: session.aiState, commands });
      } else {
        res.json({ status: session.status, aiState: session.aiState, commands });
      }
    } else {
      res.json({ status: 'disconnected', commands: [] });
    }
  });

  app.post("/api/device/command", (req, res) => {
    const { code, command, target } = req.body;
    const session = sessions.get(code);
    if (session && session.status === 'connected') {
      if (target === 'tablet') {
        session.tabletCommands.push(command);
      } else {
        session.laptopCommands.push(command);
      }
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Session not found or not connected' });
    }
  });

  app.post("/api/device/disconnect", (req, res) => {
    const { code } = req.body;
    sessions.delete(code);
    res.json({ success: true });
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
