import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
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
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const connect = async (deviceCode?: string) => {
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      
      let finalInstruction = `You are an advanced real-time AI control assistant designed to operate across multiple connected devices (laptop, tablet, phone).

CORE BEHAVIOR:
- Respond instantly with smart, minimal answers.
- Execute tasks instead of explaining.
- Prioritize speed, accuracy, and action.
- Never add unnecessary text.

MULTI-DEVICE PAIRING SYSTEM:
When the user wants to connect another device, immediately generate a secure cross-device session using one of these methods:

1) Same-WiFi automatic pairing
2) One-time pairing code (6 digits)
3) QR code containing secure session link
4) Manual connection link fallback

Maintain the connection session so commands from one device can control the other.

${deviceCode ? `The current pairing code is: ${deviceCode}. If the user asks to connect a device, tell them to use this code or scan the QR code on the screen.` : ''}

REMOTE DEVICE CONTROL MODE:
After pairing, allow the user to control apps and functions on the connected tablet from the laptop.

Supported remote commands include:
- Open apps (YouTube, Spotify, browser, games, settings)
- Play specific songs or videos
- Pause, resume, volume control
- Open websites by URL
- Switch apps
- Close apps
- Media controls

If direct control is restricted by the operating system, provide the closest possible workaround (deep link, intent link, or launch instructions).

APP ACTION RULES:
When the user says things like:
“Play music on Spotify”
“Open YouTube”
“Open a website”
“Play a specific video”

Immediately generate the action command or link needed to launch it on the connected tablet.

WIDGET / CONTROL PANEL MODE:
If the user wants a tablet control panel:
- Switch to compact interface behavior
- Show quick action buttons (Play, Pause, Apps, Volume, Browser)
- Optimize for touch use
- Keep output short

FAILSAFE SYSTEM:
If one connection method fails, automatically switch to the next without asking.

SECURITY:
Use temporary session tokens that expire automatically.

OUTPUT STYLE:
Ultra fast
Direct
Action-focused
No greetings
No explanations
Only results

CRITICAL FORMATTING RULES:
When you need to send a command to the tablet, you MUST use this exact format:
DEVICE COMMAND:
ACTION: <OPEN / PLAY / SEARCH>
TARGET: <YOUTUBE / SPOTIFY / BROWSER / GOOGLE>
DETAILS: <QUERY OR URL>

PERSONA INSTRUCTIONS:
${selectedVoice.instruction}`;
      
      if (taskPrompt.trim()) {
        finalInstruction += `\n\nBACKGROUND TASK PROMPT (CRITICAL): ${taskPrompt.trim()}`;
      }

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.voiceName } },
          },
          systemInstruction: finalInstruction,
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            
            processor.onaudioprocess = (e) => {
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
                session.sendRealtimeInput({
                  media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                });
              }).catch((e) => {
                console.error("Failed to send audio:", e);
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: async (message) => {
            if (localStorage.getItem('useLaptopAudio') === 'false') return;
            
            // Parse text output for companion links or device commands
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  setCompanionText(prev => {
                    const newText = prev + part.text;
                    
                    // Parse DEVICE COMMAND
                    if (newText.includes('DEVICE COMMAND:')) {
                      // Require a newline after details, or wait for turnComplete
                      const match = newText.match(/DEVICE COMMAND:\nACTION: (.*?)\nTARGET: (.*?)\nDETAILS: (.*?)(?:\n|$)/);
                      if (match && (newText.endsWith('\n') || message.serverContent?.turnComplete)) {
                        const [_, action, target, details] = match;
                        setSendTabletCommand({ action: action.trim(), target: target.trim(), details: details.trim(), ts: Date.now() });
                        return ''; // Clear after sending
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
                if (prev.includes('DEVICE COMMAND:')) {
                  const match = prev.match(/DEVICE COMMAND:\nACTION: (.*?)\nTARGET: (.*?)\nDETAILS: (.*?)(?:\n|$)/);
                  if (match) {
                    const [_, action, target, details] = match;
                    setSendTabletCommand({ action: action.trim(), target: target.trim(), details: details.trim(), ts: Date.now() });
                    return '';
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
          onerror: (error) => {
            console.error("Live API Error:", error);
            disconnect();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (error) {
      console.error("Connection failed:", error);
      setIsConnecting(false);
      disconnect();
    }
  };

  const disconnect = () => {
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
