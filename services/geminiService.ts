import { ScriptGenerationRequest } from "../types";
import { supabase } from "../supabaseClient";

// Generic Helper to call the Edge Function
export const invokeGemini = async (action: string, payload: any) => {
    const { data, error } = await supabase.functions.invoke('gemini-api', {
        body: { action, payload }
    });

    if (error) {
        console.error(`Gemini Edge Function Error (${action}):`, error);
        throw new Error(error.message || "Failed to contact AI service.");
    }
    
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
};

// ... base64ToUint8Array & createWavHeader ... (Helpers kept for Client-side audio processing)
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  return bytes;
}

function createWavHeader(pcmDataLength: number, sampleRate: number = 24000, numChannels: number = 1): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  view.setUint8(0, 'R'.charCodeAt(0)); view.setUint8(1, 'I'.charCodeAt(0)); view.setUint8(2, 'F'.charCodeAt(0)); view.setUint8(3, 'F'.charCodeAt(0));
  view.setUint32(4, 36 + pcmDataLength, true);
  view.setUint8(8, 'W'.charCodeAt(0)); view.setUint8(9, 'A'.charCodeAt(0)); view.setUint8(10, 'V'.charCodeAt(0)); view.setUint8(11, 'E'.charCodeAt(0));
  view.setUint8(12, 'f'.charCodeAt(0)); view.setUint8(13, 'm'.charCodeAt(0)); view.setUint8(14, 't'.charCodeAt(0)); view.setUint8(15, ' '.charCodeAt(0));
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true);
  view.setUint8(36, 'd'.charCodeAt(0)); view.setUint8(37, 'a'.charCodeAt(0)); view.setUint8(38, 't'.charCodeAt(0)); view.setUint8(39, 'a'.charCodeAt(0));
  view.setUint32(40, pcmDataLength, true);
  return new Uint8Array(buffer);
}

export const combineAudioSegments = (audioDataUris: string[]): string => {
    if (audioDataUris.length === 0) return '';
    const pcmChunks: Uint8Array[] = [];
    let totalPcmLength = 0;
    for (const uri of audioDataUris) {
        try {
            const base64 = uri.split(',')[1] || uri;
            const bytes = base64ToUint8Array(base64);
            if (bytes.length > 44) {
                const pcm = bytes.slice(44);
                pcmChunks.push(pcm);
                totalPcmLength += pcm.length;
            }
        } catch (e) { console.warn("Failed to decode audio segment", e); }
    }
    if (totalPcmLength === 0) return '';
    const combinedPcm = new Uint8Array(totalPcmLength);
    let offset = 0;
    for (const chunk of pcmChunks) { combinedPcm.set(chunk, offset); offset += chunk.length; }
    const header = createWavHeader(totalPcmLength, 24000, 1); 
    const finalBytes = new Uint8Array(header.length + combinedPcm.length);
    finalBytes.set(header); finalBytes.set(combinedPcm, header.length);
    return `data:audio/wav;base64,${btoa(Array.from(finalBytes).map((byte) => String.fromCharCode(byte)).join(''))}`;
};

// --- Secure Implementations ---

export const getApiKey = () => {
    // This function is deprecated for direct use but kept if needed for legacy checks
    // The new flow uses the Edge Function
    return ""; 
};

export const generateScriptContent = async (request: ScriptGenerationRequest): Promise<Record<string, string>> => {
  // Using string literals for schema types to avoid client-side dependency on @google/genai
  const schema = { 
    type: 'OBJECT', 
    properties: { 
        script: { type: 'STRING' } 
    }, 
    required: ["script"] 
  };
  
  const prompt = `Topic: ${request.topic}. Tone: ${request.tone}. Write a 60s script.`;

  return await invokeGemini('generate-script', {
      prompt,
      schema
  });
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const result = await invokeGemini('generate-speech', { text, voiceName });
  
  // Reconstruct WAV from raw PCM returned by edge (to keep edge function light)
  const pcmBytes = base64ToUint8Array(result.audioData);
  const wavHeader = createWavHeader(pcmBytes.length, 24000, 1);
  const wavBytes = new Uint8Array(wavHeader.length + pcmBytes.length);
  wavBytes.set(wavHeader); wavBytes.set(pcmBytes, wavHeader.length);

  return `data:audio/wav;base64,${btoa(Array.from(wavBytes).map((byte) => String.fromCharCode(byte)).join(''))}`;
};

export const analyzeProductImage = async (base64Image: string): Promise<string> => {
    const result = await invokeGemini('analyze-image', {
        imageBase64: base64Image,
        prompt: "Analyze this product image. Provide a detailed, concise description suitable for generating a new high-fashion photo of it."
    });
    return result.text;
};

export const generateFashionImage = async (prompt: string): Promise<string> => {
    const result = await invokeGemini('generate-image', {
        prompt,
        aspectRatio: "3:4",
        model: "gemini-2.5-flash-image"
    });
    return result.imageData;
};

// Mock/Placeholder for Veo (would also move to Edge in production)
export const generateVeoVideo = async (prompt: string): Promise<string> => { return ""; }
export const generateVeoImageToVideo = async (p: string, i: string): Promise<string> => { return ""; }
export const generateVeoProductVideo = async (p: string, i: string[], r: any): Promise<string> => { return ""; }
export const generateProductShotPrompts = async (i: string, u: string): Promise<string[]> => { return []; }