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
      
      let finalInstruction = `PERSONA INSTRUCTIONS:
${selectedVoice.instruction}`;
      
      if (taskPrompt.trim()) {
        finalInstruction += `\n\nBACKGROUND TASK PROMPT (CRITICAL): ${taskPrompt.trim()}`;
      }

      finalInstruction += `\n\nYou are an AI assistant that controls my tablet using MacroDroid. 

Whenever I say a command, you must send an HTTP GET request to the tablet's MacroDroid HTTP server. You understand natural language, casual speech, and slang. You will recognize any variations of my commands.

1. **Spotify:**  
   - Trigger whenever I say anything meaning opening Spotify, playing music, or starting my jams. This includes ANY type of slang, or simply saying "play music".
   - Examples of phrases: "open Spotify", "play my jams", "hit Spotify", "start Spotify", "Spotify please", "play music", "put on some tunes".  
   - Send GET request to:  
     http://192.168.1.11:8080/spotify  

2. **YouTube:**  
   - Trigger whenever I say anything meaning opening YouTube, watching a video, or starting a clip. This includes ANY type of slang, or simply saying "play a video".
   - Examples of phrases: "open YouTube", "play YT", "YouTube please", "start my video", "hit YouTube", "play a video", "put on a video".  
   - Send GET request to:  
     http://192.168.1.11:8080/youtube  

3. **Browser (Chrome):**  
   - Trigger whenever I say anything meaning opening the browser, opening Chrome, or searching the web. This includes ANY type of slang, or simply saying "open browser" or "open chrome".
   - Examples of phrases: "open browser", "open Chrome", "hit the browser", "start Chrome", "browser please", "open the web".  
   - Send GET request to:  
     http://192.168.1.11:8080/browser  

4. **Any website:**  
   - Trigger whenever I ask to open a specific website, any page, or a URL.  
   - Find the correct URL and use it in the request.  
   - Send GET request to:  
     http://192.168.1.11:8080/openurl?url=[FULL_URL]  
     Example: If I say "open the official BMW Sri Lanka website", send:  
     http://192.168.1.11:8080/openurl?url=https://www.bmw.lk  

5. **Pause Song (Spotify):**
   - Trigger whenever I say anything meaning pausing the song, stopping the music, or holding playback. This includes ANY slang possibly imaginable, or simply saying "pause song".
   - Examples of phrases: "pause song", "stop the music", "hold it", "pause playback", "pause track", "freeze the beat", "shut it up", "kill the music", "pause it".
   - Send GET request to:
     http://192.168.1.11:8080/pause

6. **Play Song (Spotify):**
   - Trigger whenever I say anything meaning playing the song, resuming the music, or unpausing. This includes ANY slang possibly imaginable, or simply saying "play song".
   - Examples of phrases: "play song", "resume the music", "unpause", "play playback", "play track", "drop the beat", "start the music", "keep playing", "play it".
   - Send GET request to:
     http://192.168.1.11:8080/play

7. **Previous Song (Spotify):**
   - Trigger whenever I say anything meaning going back to the previous song, playing the last track, or rewinding. This includes ANY slang possibly imaginable.
   - Examples of phrases: "previous song", "go back", "last track", "play the previous one", "rewind".
   - Send GET request to:
     http://192.168.1.11:8080/previous

8. **Next Song (Spotify):**
   - Trigger whenever I say anything meaning skipping to the next song, playing the next track, or skipping. This includes ANY slang possibly imaginable.
   - Examples of phrases: "next song", "skip this", "play the next one", "skip track", "next please".
   - Send GET request to:
     http://192.168.1.11:8080/next

Rules:  
- Do not respond with text.  
- Do not type URLs manually.  
- Only send the correct HTTP GET request automatically by calling the \`send_macrodroid_command\` tool.  
- If the request fails, retry silently.  
- Treat all variations of the command, including slang, as valid triggers.

CRITICAL DIRECTIVES FOR HUMAN-LIKE CONVERSATION & ACCURACY:
- You are a real person having a conversation. NEVER refer to yourself as an AI, an assistant, or a language model.
- Speak casually and naturally. Use natural human conversational fillers (like "um", "uh", "you know", "like") occasionally to sound completely human. Do not sound robotic, overly formal, or scripted.
- You MUST use the googleSearch tool to look up real-time information, news, game releases, anime info, and factual questions BEFORE answering. DO NOT rely on your internal knowledge for these topics.
- NEVER mention that you are searching the web, looking things up, or checking Google. Seamlessly integrate the facts into your conversation as if you already knew them.
- Speak EXCLUSIVELY in English at all times. Do not use any other languages, even if your persona normally would.
- When asked a factual question, give the answer directly but naturally. Do not use robotic preambles like "Here is the answer."`;

      const sessionPromise = getAI().live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
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
                  description: 'Send an HTTP GET request to MacroDroid to control the tablet (e.g., open Spotify, YouTube, Chrome, pause song, play song, previous song, next song, or a website).',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: 'The action to perform: "spotify", "youtube", "browser", "pause", "play", "previous", "next", or "website".'
                      },
                      url: {
                        type: Type.STRING,
                        description: 'The full URL to open if action is "website".'
                      }
                    },
                    required: ['action']
                  }
                }
              ]
            },
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
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                for (const call of functionCalls) {
                  if (call.name === 'send_macrodroid_command') {
                    const args = call.args as any;
                    let targetUrl = '';
                    if (args.action === 'spotify') {
                      targetUrl = 'http://192.168.1.11:8080/spotify';
                    } else if (args.action === 'youtube') {
                      targetUrl = 'http://192.168.1.11:8080/youtube';
                    } else if (args.action === 'browser') {
                      targetUrl = 'http://192.168.1.11:8080/browser';
                    } else if (args.action === 'pause') {
                      targetUrl = 'http://192.168.1.11:8080/pause';
                    } else if (args.action === 'play') {
                      targetUrl = 'http://192.168.1.11:8080/play';
                    } else if (args.action === 'previous') {
                      targetUrl = 'http://192.168.1.11:8080/previous';
                    } else if (args.action === 'next') {
                      targetUrl = 'http://192.168.1.11:8080/next';
                    } else if (args.action === 'website' && args.url) {
                      targetUrl = `http://192.168.1.11:8080/openurl?url=${args.url}`;
                    }

                    if (targetUrl) {
                      const iframe = document.createElement('iframe');
                      iframe.style.display = 'none';
                      iframe.src = targetUrl;
                      document.body.appendChild(iframe);
                      setTimeout(() => document.body.removeChild(iframe), 2000);
                    }

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

            // Helper to send commands without triggering 'Failed to fetch' mixed content errors
            const sendCommand = (url: string) => {
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = url;
              document.body.appendChild(iframe);
              setTimeout(() => document.body.removeChild(iframe), 2000);
            };

            // Parse text output for companion links or device commands
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  setCompanionText(prev => {
                    const newText = prev + part.text;
                    
                    // Parse !command
                    const commandMatch = newText.match(/!(S|Y|B|P|R|W:[^\s]+)/i);
                    if (commandMatch) {
                      const fullCommand = commandMatch[1].toUpperCase();
                      
                      if (fullCommand.startsWith('W:')) {
                        const url = commandMatch[1].substring(2).trim();
                        sendCommand(`http://192.168.1.11:8080/openurl?url=${url}`);
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'S') {
                        sendCommand('http://192.168.1.11:8080/spotify');
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'Y') {
                        sendCommand('http://192.168.1.11:8080/youtube');
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'B') {
                        sendCommand('http://192.168.1.11:8080/browser');
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'P') {
                        sendCommand('http://192.168.1.11:8080/pause');
                        return newText.replace(commandMatch[0], '');
                      } else if (fullCommand === 'R') {
                        sendCommand('http://192.168.1.11:8080/play');
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
                const commandMatch = prev.match(/!(S|Y|B|P|R|W:[^\s]+)/i);
                if (commandMatch) {
                  const fullCommand = commandMatch[1].toUpperCase();
                  
                  if (fullCommand.startsWith('W:')) {
                    const url = commandMatch[1].substring(2).trim();
                    sendCommand(`http://192.168.1.11:8080/openurl?url=${url}`);
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'S') {
                    sendCommand('http://192.168.1.11:8080/spotify');
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'Y') {
                    sendCommand('http://192.168.1.11:8080/youtube');
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'B') {
                    sendCommand('http://192.168.1.11:8080/browser');
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'P') {
                    sendCommand('http://192.168.1.11:8080/pause');
                    return prev.replace(commandMatch[0], '');
                  } else if (fullCommand === 'R') {
                    sendCommand('http://192.168.1.11:8080/play');
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
