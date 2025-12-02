
import { GoogleGenAI, Type } from "@google/genai";
import { ScriptGenerationRequest } from "../types";
import { GEMINI_API_KEYS } from "../constants";

// Helper to get API Key strictly from env, local storage, or constants
export const getApiKey = () => {
    // 1. Try environment variable
    if (process.env.API_KEY) {
        return process.env.API_KEY;
    }
    // 2. Try Local Storage
    const localKey = localStorage.getItem('genavatar_gemini_key');
    if (localKey) {
        return localKey;
    }
    // 3. Try User provided key from constants
    if (GEMINI_API_KEYS.length > 0 && GEMINI_API_KEYS[0]) {
        return GEMINI_API_KEYS[0];
    }
    return "";
};

// ... generateScriptContent ... (omitted, unchanged logic)
export const generateScriptContent = async (request: ScriptGenerationRequest): Promise<Record<string, string>> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing. Please check Settings or constants.ts");
  
  const ai = new GoogleGenAI({ apiKey });
  // ... Schema setup ...
  const schema = { type: Type.OBJECT, properties: { script: { type: Type.STRING } }, required: ["script"] };
  const prompt = `Topic: ${request.topic}. Tone: ${request.tone}. Write a 60s script.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: schema }
    });
    return JSON.parse(response.text || '{"script":""}');
  } catch (error: any) {
    if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid/Leaked. Check Settings.");
    }
    throw error;
  }
};

// ... base64ToUint8Array & createWavHeader ... (omitted, unchanged)
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
}

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text: text }] },
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } } }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned from Gemini TTS");

    const pcmBytes = base64ToUint8Array(base64Audio);
    const wavHeader = createWavHeader(pcmBytes.length, 24000, 1);
    const wavBytes = new Uint8Array(wavHeader.length + pcmBytes.length);
    wavBytes.set(wavHeader); wavBytes.set(pcmBytes, wavHeader.length);

    return `data:audio/wav;base64,${btoa(Array.from(wavBytes).map((byte) => String.fromCharCode(byte)).join(''))}`;

  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    // Specific error handling for Referrer Block
    if (error.message?.includes('API_KEY_HTTP_REFERRER_BLOCKED') || (error.details && JSON.stringify(error.details).includes('API_KEY_HTTP_REFERRER_BLOCKED'))) {
        throw new Error("Security Error: Your API Key is restricted to a different domain. Please remove domain restrictions in Google Cloud Console or add this domain.");
    }
    if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid or Restricted. Check Settings.");
    }
    if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded.");
     }
     throw error;
  }
};

/**
 * Analyzes video frames to reverse-engineer a prompt.
 * @param frameDataUrls Array of base64 image strings from the video
 */
export const analyzeVideoFrames = async (frameDataUrls: string[]): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const ai = new GoogleGenAI({ apiKey });

    // Prepare parts: Instructions + Images
    const parts: any[] = [
        { text: "You are an expert video director. Analyze these 3 frames from a video (Start, Middle, End). Describe the visual style, camera movement, lighting, subject action, and atmosphere in a single, highly detailed prompt that could be used to generate a similar video. Focus on the visual aesthetics. Output ONLY the prompt." }
    ];

    for (const dataUrl of frameDataUrls) {
        const base64 = dataUrl.split(',')[1];
        const mimeType = dataUrl.split(';')[0].split(':')[1];
        parts.push({
            inlineData: {
                mimeType: mimeType,
                data: base64
            }
        });
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Flash is great for multi-modal vision
            contents: { parts: parts }
        });

        return response.text || "A cinematic video of...";
    } catch (error) {
        console.error("Frame analysis failed:", error);
        throw new Error("Failed to analyze video frames.");
    }
};

export const generateVeoVideo = async (prompt: string, config: { aspectRatio: string }, model: string = 'veo-3.1-fast-generate-preview'): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const ai = new GoogleGenAI({ apiKey });

    // Ensure valid ratio for Veo
    let ratio = config.aspectRatio || '16:9';
    if (ratio !== '16:9' && ratio !== '9:16') ratio = '16:9'; // Fallback as Veo is strict

    console.log(`Generating Veo Video with model: ${model}, ratio: ${ratio}, prompt: ${prompt.substring(0, 50)}...`);

    try {
        let operation = await ai.models.generateVideos({
            model: model,
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: ratio 
            }
        });

        // Poll for completion
        let pollingAttempts = 0;
        while (!operation.done && pollingAttempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
            pollingAttempts++;
            console.log("Veo Polling...", pollingAttempts);
        }

        if (!operation.done) throw new Error("Video generation timed out.");

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) throw new Error("No video URI returned.");

        // Fetch the actual bytes to avoid expiring links and need for API Key in URL
        const downloadUrl = `${videoUri}&key=${apiKey}`;
        const res = await fetch(downloadUrl);
        if(!res.ok) throw new Error("Failed to download generated video bytes.");
        
        const blob = await res.blob();
        return URL.createObjectURL(blob);

    } catch (error: any) {
        console.error("Veo Generation Error:", error);
        if (error.status === 429) throw new Error("Veo API quota exceeded.");
        throw error;
    }
};

// ... generateFashionImage & other mocks ... (omitted, unchanged)
export const generateFashionImage = async (merch: string, set: string, mod: string): Promise<string> => { return ""; }
export const generateVeoImageToVideo = async (p: string, i: string): Promise<string> => { return ""; }
export const generateVeoProductVideo = async (p: string, i: string[], r: any): Promise<string> => { return ""; }
export const generateProductShotPrompts = async (i: string, u: string): Promise<string[]> => { return []; }
