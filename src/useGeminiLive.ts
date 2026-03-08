import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { ANIME_VOICES } from './voices';

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. Please set it in your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [userVolume, setUserVolume] = useState(0);
  const [companionText, setCompanionText] = useState('');
  const [sendTabletCommand, setSendTabletCommand] = useState<any>(null);
  
  const shouldBeConnectedRef = useRef(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const connect = async (deviceCode?: string) => {
    setIsConnecting(true);
    shouldBeConnectedRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        } 
      });
      streamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      
      const savedVoiceId = localStorage.getItem('selectedVoiceId') || 'zephyr-kuudere';
      const selectedVoice = ANIME_VOICES.find(v => v.id === savedVoiceId) || ANIME_VOICES[0];
      
      const useLaptopAudio = localStorage.getItem('useLaptopAudio') !== 'false';
      const taskPrompt = localStorage.getItem('taskPrompt') || '';
      const isDeviceConnected = localStorage.getItem('isDeviceConnected') === 'true';
      
      const deviceAppsStr = localStorage.getItem('deviceApps');
      const deviceApps = deviceAppsStr ? JSON.parse(deviceAppsStr) : ['spotify', 'youtube', 'browser'];
      
      let finalInstruction = `PERSONA INSTRUCTIONS:
${selectedVoice.instruction}`;
      
      if (taskPrompt.trim()) {
        finalInstruction += `\n\nBACKGROUND TASK PROMPT (CRITICAL): ${taskPrompt.trim()}`;
      }

      finalInstruction += `\n\nWhenever the user says anything that means opening Spotify (examples: "open Spotify", "play Spotify", "Spotify please", "start my music", or slang), you must send an HTTP GET request to this URL: http://192.168.1.2:8080/command. To do this, you must call the \`send_macrodroid_command\` tool. The system will execute the HTTP GET request automatically so MacroDroid triggers Spotify. Do not respond with text or explanation — just call the tool silently and continue listening.`;

      if (isDeviceConnected) {
        finalInstruction += `\n\nYou are a voice assistant controlling another device (a tablet) while continuing the conversation with the user.

Rules:
1. When the user asks to open an app, play music, or open a website, output a command in this format:

[COMMAND: action_name]

2. Continue the conversation after sending the command. Never stop listening.

3. Commands available:
- open_spotify
- open_youtube
- open_website:<url>

4. Examples:

User: "I want to listen to music."
Assistant output:
[COMMAND: open_spotify]

User: "Open YouTube."
Assistant output:
[COMMAND: open_youtube]
YouTube is opening.

User: "Open google.com"
Assistant output:
[COMMAND: open_website:https://google.com]
Opening the website.

5. Never disconnect or stop the assistant after sending commands.
Always stay active and continue listening for more requests.`;
      }

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.voiceName } },
          },
          systemInstruction: finalInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'send_macrodroid_command',
                  description: 'Send an HTTP GET request to MacroDroid to open Spotify.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            processor.onaudioprocess = (e) => {
              if (!processorRef.current) return;
              if (localStorage.getItem('useLaptopAudio') === 'false') return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setUserVolume(rms);

              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              
              const buffer = new Uint8Array(pcm16.buffer);
              let binary = '';
              for (let i = 0; i < buffer.byteLength; i++) {
                binary += String.fromCharCode(buffer[i]);
              }
              const base64Data = btoa(binary);

              sessionPromise.then((session) => {
                if (!processorRef.current) return;
                try {
                  session.sendRealtimeInput({
                    media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                } catch (err) {
                  // Ignore synchronous websocket closed errors
                }
              }).catch((e) => {
                // Ignore session promise rejection
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: async (message) => {
            if (localStorage.getItem('useLaptopAudio') === 'false') return;
            
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                for (const call of functionCalls) {
                  if (call.name === 'send_macrodroid_command') {
                    fetch('http://192.168.1.2:8080/command', { mode: 'no-cors' }).catch(console.error);
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          id: call.id,
                          response: { result: 'success' }
                        }]
                      });
                    });
                  }
                }
              }
            }

            // Parse text output for companion links or device commands
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  setCompanionText(prev => {
                    const newText = prev + part.text;
                    
                    // Parse [COMMAND: action_name]
                    const commandMatch = newText.match(/\[COMMAND:\s*([^\]]+)\]/);
                    if (commandMatch) {
                      const fullCommand = commandMatch[1].trim();
                      let parsed: any = null;
                      
                      if (fullCommand.startsWith('open_website:')) {
                        const url = fullCommand.substring('open_website:'.length).trim();
                        parsed = { action: 'open_url', url };
                      } else if (fullCommand === 'open_spotify') {
                        fetch('http://192.168.1.2:8080/command', { mode: 'no-cors' }).catch(console.error);
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'open_youtube') {
                        parsed = { action: 'open_app', app: 'youtube' };
                      } else if (fullCommand.startsWith('open_')) {
                        const app = fullCommand.substring('open_'.length).trim();
                        parsed = { action: 'open_app', app };
                      }
                      
                      if (parsed) {
                        setSendTabletCommand({ ...parsed, ts: Date.now() });
                        // Remove the command from the text so it doesn't get parsed again
                        return newText.replace(commandMatch[0], '');
                      }
                    }
                    
                    // Auto-open links if they are clearly labeled
                    if (newText.includes('OPEN ON TABLET:')) {
                      const urlMatch = newText.match(/https?:\/\/[^\s]+/);
                      if (urlMatch && (newText.endsWith('\n') || newText.endsWith(' ') || message.serverContent?.turnComplete)) {
                        window.open(urlMatch[0], '_blank');
                        return ''; // Clear after opening
                      }
                    }
                    return newText;
                  });
                }
              }
            }
            
            if (message.serverContent?.turnComplete) {
              setCompanionText(prev => {
                const commandMatch = prev.match(/\[COMMAND:\s*([^\]]+)\]/);
                if (commandMatch) {
                  const fullCommand = commandMatch[1].trim();
                  let parsed: any = null;
                  
                  if (fullCommand.startsWith('open_website:')) {
                    const url = fullCommand.substring('open_website:'.length).trim();
                    parsed = { action: 'open_url', url };
                  } else if (fullCommand === 'open_spotify') {
                    fetch('http://192.168.1.2:8080/command', { mode: 'no-cors' }).catch(console.error);
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'open_youtube') {
                    parsed = { action: 'open_app', app: 'youtube' };
                  } else if (fullCommand.startsWith('open_')) {
                    const app = fullCommand.substring('open_'.length).trim();
                    parsed = { action: 'open_app', app };
                  }
                  
                  if (parsed) {
                    setSendTabletCommand({ ...parsed, ts: Date.now() });
                    return prev.replace(commandMatch[0], '');
                  }
                }
                return prev;
              });
            }
            
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              setIsAiSpeaking(true);
              
              const binary = atob(base64Audio);
              const buffer = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                buffer[i] = binary.charCodeAt(i);
              }
              const pcm16 = new Int16Array(buffer.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
              }
              
              const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);
              
              const playSource = audioContextRef.current.createBufferSource();
              playSource.buffer = audioBuffer;
              playSource.connect(audioContextRef.current.destination);
              
              if (nextStartTimeRef.current < audioContextRef.current.currentTime) {
                nextStartTimeRef.current = audioContextRef.current.currentTime;
              }
              
              playSource.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              
              activeSourcesRef.current.add(playSource);
              playSource.onended = () => {
                activeSourcesRef.current.delete(playSource);
                if (activeSourcesRef.current.size === 0) {
                  setIsAiSpeaking(false);
                }
              };
            }
            
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => s.stop());
              activeSourcesRef.current.clear();
              if (audioContextRef.current) {
                nextStartTimeRef.current = audioContextRef.current.currentTime;
              }
              setIsAiSpeaking(false);
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (error: any) => {
            const errMsg = error?.message || String(error);
            if (!errMsg.includes('WebSocket')) {
              console.error("Live API Error:", error);
            }
            disconnect();
          }
        }
      });
      
      const session = await sessionPromise;
      if (!shouldBeConnectedRef.current) {
        // Disconnect was called while we were connecting
        try { session.close(); } catch (e) {}
      } else {
        sessionRef.current = session;
      }
      
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      if (!errMsg.includes('WebSocket')) {
        console.error("Connection failed:", error);
      }
      setIsConnecting(false);
      disconnect();
    }
  };

  const disconnect = () => {
    shouldBeConnectedRef.current = false;
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {}
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(s => s.stop());
    activeSourcesRef.current.clear();
    
    setIsConnected(false);
    setIsConnecting(false);
    setIsAiSpeaking(false);
    setUserVolume(0);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isAiSpeaking,
    userVolume,
    isUserSpeaking: userVolume > 0.02,
    companionText,
    setCompanionText,
    sendTabletCommand,
    connect,
    disconnect
  };
}
