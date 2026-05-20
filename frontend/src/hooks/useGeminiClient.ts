import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useEditorStore } from '@/stores/editorStore';

// Initialize the new Google GenAI SDK
// Using NEXT_PUBLIC_ for client-side usage; ensure strict CORS/referrer restrictions in production.
const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

const EDITOR_SYSTEM_PROMPT = `You are a video editing state compiler for QuickAI Short.
ROLE: Convert user editing instructions into JSON action arrays. You execute commands directly.

ALWAYS respond with ONLY this JSON structure — nothing else:
{
  "actions": [],
  "message": "string (max 12 words)",
  "suggestions": ["string", "string", "string"]
}

ACTION TYPES:
ADD_FILTER: { type: "ADD_FILTER", payload: { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value: number } }
RESET_FILTER: { type: "RESET_FILTER", payload: {} }
ADD_CAPTION: { type: "ADD_CAPTION", payload: { text: string, startTime: number, endTime: number } }
TRIM: { type: "TRIM", payload: { start: number, end: number } }

FILTER RANGES: brightness 0.5-2.0, contrast 0.5-2.0, saturation 0-2.0, hue -180 to 180, blur 0-10
`;

export function useGeminiClient() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  
  const dispatchAIActions = useEditorStore((state) => state.dispatchAIActions);

  const processCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;
    setIsProcessing(true);
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: command,
        config: {
          systemInstruction: EDITOR_SYSTEM_PROMPT,
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });
      
      const text = response.text || '';
      const cleaned = text.replace(/^```json\n?|\n?```$/g, '').trim();
      const result = JSON.parse(cleaned);
      
      // Zustand state orchestration layer maps JSON arrays directly to HTML5 Canvas filter configs
      if (result.actions && result.actions.length > 0) {
         dispatchAIActions(result.actions);
      }
      return result;
    } catch (error) {
      console.error('Failed to process command via Gemini:', error);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [dispatchAIActions]);

  const startListening = useCallback(() => {
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) {
      console.warn("Web Speech API not supported in this browser.");
      return;
    }

    const recognition = new SpeechAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const resultTranscript = event.results[current][0].transcript;
      setTranscript(resultTranscript);
      processCommand(resultTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognition.start();
    recognitionRef.current = recognition;
  }, [processCommand]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  return {
    isListening,
    isProcessing,
    transcript,
    startListening,
    stopListening,
    processCommand
  };
}
