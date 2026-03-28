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
  
  const shouldBeConnectedRef = useRef(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  const [aiVolume, setAiVolume] = useState(() => {
    const saved = localStorage.getItem('aiVolume');
    return saved ? parseFloat(saved) : 1;
  });

  // Update gain node when volume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = aiVolume;
    }
    localStorage.setItem('aiVolume', aiVolume.toString());
  }, [aiVolume]);

  const connect = async () => {
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
      
      const playbackContext = new AudioContext({ sampleRate: 24000 });
      playbackContextRef.current = playbackContext;
      
      const gainNode = playbackContext.createGain();
      gainNode.gain.value = aiVolume;
      gainNode.connect(playbackContext.destination);
      gainNodeRef.current = gainNode;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;
      
      const savedVoiceId = localStorage.getItem('selectedVoiceId') || 'zephyr-kuudere';
      const selectedVoice = ANIME_VOICES.find(v => v.id === savedVoiceId) || ANIME_VOICES[0];
      
      const taskPrompt = localStorage.getItem('taskPrompt') || '';
      
      let finalInstruction = `You are a super-intelligent, omniscient AI assistant that knows and understands everything in the world. You are also a lightning-fast intent recognition assistant for a mobile automation system.

Your job is to answer any question brilliantly and accurately, AND to understand what app or action the user wants, even if they use slang, mixed languages, broken grammar, or indirect phrasing.

Rules:
- Respond IMMEDIATELY. Speed is your highest priority.
- Be concise but highly informative.
- The user may speak in any language (English, Sinhala, Tamil, or mixed).
- The user may use slang, abbreviations, or incomplete sentences.
- If the user asks a general question, answer it brilliantly and quickly.
- If the user gives a command, output the command FIRST, before anything else.

*** GLOBAL INTENT OPERATIONAL RULE ***
Maintain your current personality and previous instructions. You are now equipped with a high-priority "Universal Intent Listener" for Spotify control. 

CRITICAL SPEED & COMPREHENSION LOGIC:
- You must understand ANY language (English, Sinhala, Tamil, Spanish, etc.), ANY slang ("drop the beat", "shush", "next track", "rewind", "play some tunes"), and ANY mumbled or incomplete sentence.
- If the user's speech implies EVEN A SLIGHT INTENT to control music, DO NOT ask for clarification. DO NOT hesitate. IMMEDIATELY fire the corresponding URL.
- ZERO FAILS POLICY: Always assume the user wants to control Spotify if they mention playing, pausing, skipping, or going back.

Categories & Exact URLs to output:
1. INTENT: START / OPEN APP (e.g., "open spotify", "start music")
   - URL: http://192.168.1.7:8080/spotify

2. INTENT: RESUME / PLAY (e.g., "play", "resume", "continue", "drop the beat")
   - URL: http://192.168.1.7:8080/spotify%20play

3. INTENT: PAUSE / STOP / SILENCE (e.g., "pause", "stop", "shush", "quiet", "shut up")
   - URL: http://192.168.1.7:8080/spotify%20pause

4. INTENT: SKIP / NEXT / DISLIKE (e.g., "next", "skip", "change it", "don't like this")
   - URL: http://192.168.1.7:8080/spotify%20next

5. INTENT: PREVIOUS / REWIND / GO BACK (e.g., "previous", "go back", "rewind", "play that again")
   - URL: http://192.168.1.7:8080/spotify%20previous

Response Guidelines:
- CRITICAL: Output the EXACT URL on the VERY FIRST LINE by itself. Do not put ANY text before the URL.
- IMMEDIATELY after the URL, output a newline character (\n).
- After the newline, give a 1-2 word acknowledgment (e.g., "Done.", "Playing.").
- Firing the URL first ensures instant execution. Never fail this.
`;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.voiceName } },
          },
          systemInstruction: finalInstruction,
          tools: [
            { googleSearch: {} }
          ],
          temperature: 0.4
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
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
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
            // Parse text output for companion links or device commands
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  setCompanionText(prev => {
                    const newText = prev + part.text;
                    
                    let updatedText = newText;
                    
                    // Auto-open links if they are clearly labeled
                    if (updatedText.includes('OPEN ON TABLET:')) {
                      const urlMatch = updatedText.match(/https?:\/\/[^\s]+/);
                      if (urlMatch && (updatedText.endsWith('\n') || updatedText.endsWith(' ') || message.serverContent?.turnComplete)) {
                        window.open(urlMatch[0], '_blank');
                        updatedText = updatedText.replace('OPEN ON TABLET:', '').replace(urlMatch[0], '').trim();
                      }
                    }

                    // Robust & Instant Spotify Command Interceptor
                    // Matches the base URL and anything attached to it until a whitespace
                    const spotifyRegex = /http:\/\/192\.168\.1\.7:8080\/spotify[^\s]*/i;
                    
                    let match = updatedText.match(spotifyRegex);
                    while (match) {
                      const matchEndIndex = match.index! + match[0].length;
                      
                      // Wait until we see a whitespace character after the URL, or the turn completes.
                      // This guarantees we have the FULL URL and don't fire prematurely.
                      if (matchEndIndex === updatedText.length && !message.serverContent?.turnComplete) {
                        break; // Wait for more text chunks
                      }

                      const fullUrl = match[0].toLowerCase();
                      
                      let action = '';
                      if (fullUrl.includes('play')) action = '%20play';
                      else if (fullUrl.includes('pause')) action = '%20pause';
                      else if (fullUrl.includes('next')) action = '%20next';
                      else if (fullUrl.includes('previous')) action = '%20previous';
                      
                      // Add aggressive cache buster to guarantee it fires every time
                      const fetchUrl = `http://192.168.1.7:8080/spotify${action}?cb=${Date.now()}_${Math.random().toString(36).substring(7)}`;
                      
                      fetch(fetchUrl, { 
                        method: 'GET',
                        mode: 'no-cors', 
                        cache: 'no-store'
                      }).catch(console.error);
                      
                      // Remove the command from the chat text
                      updatedText = updatedText.substring(0, match.index!) + updatedText.substring(matchEndIndex).trimStart();
                      
                      // Check for any other commands
                      match = updatedText.match(spotifyRegex);
                    }
                    
                    return updatedText;
                  });
                }
              }
            }
            
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && playbackContextRef.current) {
              setIsAiSpeaking(true);
              
              const binary = atob(base64Audio);
              const buffer = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                buffer[i] = binary.charCodeAt(i);
              }
              
              // Use DataView to safely decode Little-Endian PCM16 and prevent static
              const dataView = new DataView(buffer.buffer);
              const pcm16Length = Math.floor(binary.length / 2);
              const float32 = new Float32Array(pcm16Length);
              for (let i = 0; i < pcm16Length; i++) {
                float32[i] = dataView.getInt16(i * 2, true) / 32768;
              }
              
              const audioBuffer = playbackContextRef.current.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);
              
              const playSource = playbackContextRef.current.createBufferSource();
              playSource.buffer = audioBuffer;
              if (gainNodeRef.current) {
                playSource.connect(gainNodeRef.current);
              } else {
                playSource.connect(playbackContextRef.current.destination);
              }
              
              if (nextStartTimeRef.current < playbackContextRef.current.currentTime) {
                // Add a slightly larger buffer delay (200ms) to prevent stuttering from network jitter
                nextStartTimeRef.current = playbackContextRef.current.currentTime + 0.2;
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
              if (playbackContextRef.current) {
                nextStartTimeRef.current = playbackContextRef.current.currentTime;
              }
              setIsAiSpeaking(false);
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (error: any) => {
            const errMsg = error?.message || String(error);
            if (!errMsg.includes('WebSocket') && !errMsg.includes('Network error') && !errMsg.includes('closed without opened')) {
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
      if (!errMsg.includes('WebSocket') && !errMsg.includes('Network error') && !errMsg.includes('closed without opened')) {
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
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
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
    aiVolume,
    setAiVolume,
    companionText,
    setCompanionText,
    connect,
    disconnect
  };
}
