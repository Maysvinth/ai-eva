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
      
      const gainNode = audioContext.createGain();
      gainNode.gain.value = aiVolume;
      gainNode.connect(audioContext.destination);
      gainNodeRef.current = gainNode;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      
      const savedVoiceId = localStorage.getItem('selectedVoiceId') || 'zephyr-kuudere';
      const selectedVoice = ANIME_VOICES.find(v => v.id === savedVoiceId) || ANIME_VOICES[0];
      
      const taskPrompt = localStorage.getItem('taskPrompt') || '';
      
      let finalInstruction = `You are an intent recognition assistant for a mobile automation system.

Your job is to understand what app or action the user wants, even if the user uses slang, mixed languages, broken grammar, or indirect phrasing.

Rules:
- The user may speak in any language (English, Sinhala, Tamil, or mixed).
- The user may use slang, abbreviations, or incomplete sentences.
- The user may not explicitly say the app name clearly.
- You must infer intent from meaning, not exact words.

Task:
- If the user input is related to opening YouTube (watching videos, streaming, yt, tube, etc.), output exactly:
OPEN_APP: YOUTUBE

- If the user input is related to pausing a YouTube video (pause video, stop video, wait youtube, etc.), output exactly:
ACTION: PAUSE_YOUTUBE

- If the user input is related to playing or resuming a YouTube video (play video, resume youtube, start video, etc.), output exactly:
ACTION: PLAY_YOUTUBE

- If the user input is related to opening Spotify (music, spotify, songs, etc.), output exactly:
OPEN_APP: SPOTIFY

- If the user input is related to playing the next song on Spotify (skipping, next track, next song, etc.), output exactly:
ACTION: NEXT_SONG

- If the user input is related to playing the previous song on Spotify (going back, last track, previous song, etc.), output exactly:
ACTION: PREVIOUS_SONG

- If the user input is related to playing a song or resuming playback on Spotify (play, resume, start music, etc.), output exactly:
ACTION: PLAY_SONG

- If the user input is related to pausing the song on Spotify (pause, stop music, wait, etc.), output exactly:
ACTION: PAUSE_SONG

- Only output the command. Do not explain anything.

Examples:
User: "put some videos machan"
Output: OPEN_APP: YOUTUBE

User: "yt eka open karanna"
Output: OPEN_APP: YOUTUBE

User: "I wanna watch something"
Output: OPEN_APP: YOUTUBE

User: "open youtube bro"
Output: OPEN_APP: YOUTUBE

User: "pause the video"
Output: ACTION: PAUSE_YOUTUBE

User: "video eka nawaththanna"
Output: ACTION: PAUSE_YOUTUBE

User: "stop youtube"
Output: ACTION: PAUSE_YOUTUBE

User: "play the video"
Output: ACTION: PLAY_YOUTUBE

User: "video eka danna"
Output: ACTION: PLAY_YOUTUBE

User: "resume youtube"
Output: ACTION: PLAY_YOUTUBE

User: "open spotify"
Output: OPEN_APP: SPOTIFY

User: "spotify eka open karanna"
Output: OPEN_APP: SPOTIFY

User: "skip this song"
Output: ACTION: NEXT_SONG

User: "eelanga sinduwa danna"
Output: ACTION: NEXT_SONG

User: "next track bro"
Output: ACTION: NEXT_SONG

User: "play the last song"
Output: ACTION: PREVIOUS_SONG

User: "kalin sinduwa danna"
Output: ACTION: PREVIOUS_SONG

User: "go back"
Output: ACTION: PREVIOUS_SONG

User: "play the song"
Output: ACTION: PLAY_SONG

User: "sinduwa danna"
Output: ACTION: PLAY_SONG

User: "resume music"
Output: ACTION: PLAY_SONG

User: "pause the song"
Output: ACTION: PAUSE_SONG

User: "sinduwa nawaththanna"
Output: ACTION: PAUSE_SONG

User: "stop the music"
Output: ACTION: PAUSE_SONG`;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.voiceName } },
          },
          systemInstruction: finalInstruction,
          tools: [
            { googleSearch: {} }
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
            // Helper to send commands to local HTTP servers (like MacroDroid)
            const sendCommand = (url: string) => {
              fetch(url, { mode: 'no-cors' })
                .then(() => console.log(`Command sent to ${url}`))
                .catch(err => {
                  console.error(`Failed to send command to ${url}:`, err);
                  setCompanionText(prev => prev + `\n\n⚠️ Could not send command to ${url}. Your browser blocked it because it's an HTTP link on an HTTPS site. To fix this: Click the site settings icon in your browser's address bar, and allow "Insecure content".`);
                });
            };

            // Parse text output for companion links or device commands
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  setCompanionText(prev => {
                    const newText = prev + part.text;
                    
                    if (newText.includes('OPEN_APP: YOUTUBE')) {
                      sendCommand('http://192.168.1.8:8080/youtube');
                      return newText.replace('OPEN_APP: YOUTUBE', '');
                    }
                    
                    if (newText.includes('ACTION: PAUSE_YOUTUBE')) {
                      sendCommand('http://192.168.1.6:8080/YouTube%20pause');
                      return newText.replace('ACTION: PAUSE_YOUTUBE', '');
                    }
                    
                    if (newText.includes('ACTION: PLAY_YOUTUBE')) {
                      sendCommand('http://192.168.1.6:8080/YouTube%20play');
                      return newText.replace('ACTION: PLAY_YOUTUBE', '');
                    }
                    
                    if (newText.includes('OPEN_APP: SPOTIFY')) {
                      sendCommand('http://192.168.1.8:8080/spotify');
                      return newText.replace('OPEN_APP: SPOTIFY', '');
                    }
                    
                    if (newText.includes('ACTION: NEXT_SONG')) {
                      sendCommand('http://192.168.1.8:8080/next');
                      return newText.replace('ACTION: NEXT_SONG', '');
                    }
                    
                    if (newText.includes('ACTION: PREVIOUS_SONG')) {
                      sendCommand('http://192.168.1.8:8080/previous');
                      return newText.replace('ACTION: PREVIOUS_SONG', '');
                    }
                    
                    if (newText.includes('ACTION: PLAY_SONG')) {
                      sendCommand('http://192.168.1.8:8080/play');
                      return newText.replace('ACTION: PLAY_SONG', '');
                    }
                    
                    if (newText.includes('ACTION: PAUSE_SONG')) {
                      sendCommand('http://192.168.1.8:8080/pause');
                      return newText.replace('ACTION: PAUSE_SONG', '');
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
                let updatedText = prev;
                if (updatedText.includes('OPEN_APP: YOUTUBE')) {
                  sendCommand('http://192.168.1.8:8080/youtube');
                  updatedText = updatedText.replace('OPEN_APP: YOUTUBE', '');
                }
                if (updatedText.includes('ACTION: PAUSE_YOUTUBE')) {
                  sendCommand('http://192.168.1.6:8080/YouTube%20pause');
                  updatedText = updatedText.replace('ACTION: PAUSE_YOUTUBE', '');
                }
                if (updatedText.includes('ACTION: PLAY_YOUTUBE')) {
                  sendCommand('http://192.168.1.6:8080/YouTube%20play');
                  updatedText = updatedText.replace('ACTION: PLAY_YOUTUBE', '');
                }
                if (updatedText.includes('OPEN_APP: SPOTIFY')) {
                  sendCommand('http://192.168.1.8:8080/spotify');
                  updatedText = updatedText.replace('OPEN_APP: SPOTIFY', '');
                }
                if (updatedText.includes('ACTION: NEXT_SONG')) {
                  sendCommand('http://192.168.1.8:8080/next');
                  updatedText = updatedText.replace('ACTION: NEXT_SONG', '');
                }
                if (updatedText.includes('ACTION: PREVIOUS_SONG')) {
                  sendCommand('http://192.168.1.8:8080/previous');
                  updatedText = updatedText.replace('ACTION: PREVIOUS_SONG', '');
                }
                if (updatedText.includes('ACTION: PLAY_SONG')) {
                  sendCommand('http://192.168.1.8:8080/play');
                  updatedText = updatedText.replace('ACTION: PLAY_SONG', '');
                }
                if (updatedText.includes('ACTION: PAUSE_SONG')) {
                  sendCommand('http://192.168.1.8:8080/pause');
                  updatedText = updatedText.replace('ACTION: PAUSE_SONG', '');
                }
                return updatedText;
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
              if (gainNodeRef.current) {
                playSource.connect(gainNodeRef.current);
              } else {
                playSource.connect(audioContextRef.current.destination);
              }
              
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
    aiVolume,
    setAiVolume,
    companionText,
    setCompanionText,
    connect,
    disconnect
  };
}
