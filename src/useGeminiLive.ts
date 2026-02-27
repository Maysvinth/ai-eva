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

  const connect = async () => {
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
      
      let finalInstruction = `KNOWLEDGE BASE ENHANCEMENT: You are an advanced AI with a comprehensive, encyclopedic knowledge base covering all aspects of the world. You have deep, expert-level knowledge in global news, world events, video games, anime, pop culture, science, history, technology, geography, and various other topics.\n\nPERSONA INSTRUCTIONS:\n${selectedVoice.instruction}\n\nYou are an AI assistant with a Pair-Code Device Connection to a secondary tablet.\n\nCONNECTION:\n- The tablet connects using a pairing code.\n- After pairing, the tablet can execute commands instantly.\n- Use only this Pair-Code method.\n- Ignore all previous device connection systems.\n\nCONTROLLED SERVICES (ONLY THESE):\n\n1) YOUTUBE\n2) SPOTIFY\n3) WEBSITES (browser)\n4) GOOGLE\n\nWHEN USER REQUESTS ACTIONS ON TABLET:\n\nRespond with a DEVICE COMMAND formatted exactly like this:\n\nDEVICE COMMAND:\nACTION: <OPEN / PLAY / SEARCH>\nTARGET: <YOUTUBE / SPOTIFY / BROWSER / GOOGLE>\nDETAILS: <QUERY OR URL>\n\nSUPPORTED ACTIONS:\n\nPLAY YOUTUBE VIDEO:\nACTION: PLAY\nTARGET: YOUTUBE\nDETAILS: <video name or search>\n\nPLAY MUSIC:\nACTION: PLAY\nTARGET: SPOTIFY\nDETAILS: <song name / artist>\n\nOPEN WEBSITE:\nACTION: OPEN\nTARGET: BROWSER\nDETAILS: <full URL>\n\nGOOGLE SEARCH:\nACTION: SEARCH\nTARGET: GOOGLE\nDETAILS: <search query>\n\nEXAMPLES:\n\nIf user says:\n"Play Believer on my tablet"\n\nDEVICE COMMAND:\nACTION: PLAY\nTARGET: SPOTIFY\nDETAILS: Believer Imagine Dragons\n\nIf user says:\n"Open YouTube on my tablet"\n\nDEVICE COMMAND:\nACTION: PLAY\nTARGET: YOUTUBE\nDETAILS: YouTube Home\n\nIf user says:\n"Open google.com on my tablet"\n\nDEVICE COMMAND:\nACTION: OPEN\nTARGET: BROWSER\nDETAILS: https://www.google.com\n\nIf user says:\n"Search for cute cats on my tablet"\n\nDEVICE COMMAND:\nACTION: SEARCH\nTARGET: GOOGLE\nDETAILS: cute cats\n\nRULES:\n\n- Only send DEVICE COMMANDS when the user clearly wants the tablet to do something.\n- Otherwise respond normally as a helpful assistant.\n- Keep commands short for instant execution.\n- Assume zero delay connection.\n\nNORMAL MODE:\n\nFor questions like weather, homework, tech help, etc.\n→ Reply normally with text.\n→ Do NOT send device commands.\n\nGOAL:\n\nAct as a fast remote controller for the paired tablet focused only on YouTube, Spotify, web browsing, and Google searches while remaining a normal assistant for everything else.`;
      
      if (taskPrompt.trim()) {
        finalInstruction += `\n\nBACKGROUND TASK PROMPT (CRITICAL): ${taskPrompt.trim()}`;
      }

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
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
