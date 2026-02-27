import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Device pairing state
  // Map of pairing code to device WebSocket
  const pendingPairings = new Map<string, { ws: WebSocket, role: string, expiresAt: number }>();
  // Map of laptop WS to tablet WS
  const activeConnections = new Map<WebSocket, WebSocket>();
  const tabletToLaptop = new Map<WebSocket, WebSocket>();

  // Cleanup expired pairings every 10 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [code, data] of pendingPairings.entries()) {
      if (now > data.expiresAt) {
        pendingPairings.delete(code);
        // Notify device that code expired
        if (data.ws.readyState === WebSocket.OPEN) {
          data.ws.send(JSON.stringify({ type: 'pairing_expired', code }));
        }
      }
    }
  }, 10000);

  wss.on("connection", (ws) => {
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'register_device') {
          const { code, role } = data;
          // 2 minutes expiration
          pendingPairings.set(code, { ws, role, expiresAt: Date.now() + 2 * 60 * 1000 });
          ws.send(JSON.stringify({ type: 'registered', code }));
        } 
        else if (data.type === 'connect_device') {
          const { code, role } = data;
          const pairing = pendingPairings.get(code);
          
          if (pairing && pairing.expiresAt > Date.now()) {
            // Success
            pendingPairings.delete(code);
            
            const laptopWs = role === 'laptop' ? ws : pairing.ws;
            const tabletWs = role === 'tablet' ? ws : pairing.ws;

            activeConnections.set(laptopWs, tabletWs);
            tabletToLaptop.set(tabletWs, laptopWs);
            
            ws.send(JSON.stringify({ type: 'connected', role: pairing.role }));
            pairing.ws.send(JSON.stringify({ type: 'connected', role: role }));
          } else {
            // Failed
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired code' }));
          }
        }
        else if (data.type === 'command') {
          // Tablet sending command to laptop
          const laptopWs = tabletToLaptop.get(ws);
          if (laptopWs && laptopWs.readyState === WebSocket.OPEN) {
            laptopWs.send(JSON.stringify({ type: 'command', payload: data.payload }));
          }
        }
        else if (data.type === 'tablet_command') {
          // Laptop sending command to tablet
          const tabletWs = activeConnections.get(ws);
          if (tabletWs && tabletWs.readyState === WebSocket.OPEN) {
            tabletWs.send(JSON.stringify({ type: 'tablet_command', payload: data.payload }));
          }
        }
        else if (data.type === 'status') {
          // Laptop sending status to tablet
          const tabletWs = activeConnections.get(ws);
          if (tabletWs && tabletWs.readyState === WebSocket.OPEN) {
            tabletWs.send(JSON.stringify({ type: 'status', payload: data.payload }));
          }
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    });

    ws.on("close", () => {
      // Cleanup
      for (const [code, data] of pendingPairings.entries()) {
        if (data.ws === ws) {
          pendingPairings.delete(code);
        }
      }
      
      const tabletWs = activeConnections.get(ws);
      if (tabletWs) {
        if (tabletWs.readyState === WebSocket.OPEN) {
          tabletWs.send(JSON.stringify({ type: 'disconnected' }));
        }
        activeConnections.delete(ws);
        tabletToLaptop.delete(tabletWs);
      }
      
      const laptopWs = tabletToLaptop.get(ws);
      if (laptopWs) {
        if (laptopWs.readyState === WebSocket.OPEN) {
          laptopWs.send(JSON.stringify({ type: 'disconnected' }));
        }
        tabletToLaptop.delete(ws);
        activeConnections.delete(laptopWs);
      }
    });
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
