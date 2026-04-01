
import { ScriptGenerationRequest } from "../types";

import { FIREBASE_FUNCTION_URL } from "../constants";

// Generic Helper to call the Cloud Function with Retry
export const invokeGemini = async (action: string, payload: any) => {
    let userApiKey = localStorage.getItem('genavatar_gemini_key');
    if (userApiKey && !userApiKey.trim()) {
        userApiKey = null;
    } else if (userApiKey) {
        userApiKey = userApiKey.trim();
    }

    const kieApiKey = localStorage.getItem('genavatar_kie_key');

    let retries = 3;
    while (retries > 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const response = await fetch(FIREBASE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    action,
                    payload: { ...payload, apiKey: userApiKey, kieApiKey: kieApiKey }
                })
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                let detailedMessage = errorData.error || `HTTP Error ${response.status}: Failed to contact AI service.`;

                // Detect 429 / Resource Exhausted
                if (detailedMessage.includes('RESOURCE_EXHAUSTED') || response.status === 429) {
                    detailedMessage = "AI Quota Exceeded. The shared system key is at its limit. Please wait a few minutes or add your own Gemini API Key in Settings to continue without limits.";
                }

                throw new Error(detailedMessage);
            }

            const data = await response.json();

            if (data && data.error) {
                // Action specific error handling
                if (action === 'generate-image' && data.error === 'No image generated.') {
                    throw new Error("AI Refusal: The model refused to generate an image for this prompt. Try rephrasing or simplifying your request.");
                }
                throw new Error(data.error);
            }

            return data;

        } catch (error: any) {
            console.warn(`Gemini invoke attempt ${4 - retries} failed for ${action}:`, error.message);

            // Do not retry on Quota or Refusal
            if (error.message.includes("Quota") || error.message.includes("Refusal")) {
                throw error;
            }

            retries--;
            if (retries === 0) {
                console.error(`Gemini Cloud Function Error (${action}):`, error);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
        }
    }
};

// ... base64ToUint8Array & createWavHeader (Helpers) ...
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

export const getApiKey = () => { return ""; };

export const generateScriptContent = async (request: ScriptGenerationRequest): Promise<Record<string, string>> => {
    const schema = {
        type: 'OBJECT',
        properties: { script: { type: 'STRING' } },
        required: ["script"]
    };
    const prompt = `Topic: ${request.topic}. Tone: ${request.tone}. Write a 60s script.`;
    return await invokeGemini('generate-script', { prompt, schema });
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
    const result = await invokeGemini('generate-speech', { text, voiceName });
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

export const extractVisualConsistencyTokens = async (base64Image: string): Promise<string> => {
    const result = await invokeGemini('analyze-image', {
        imageBase64: base64Image,
        prompt: "Analyze this image and describe the MAIN CHARACTER and SETTING in extreme detail (clothing, specific colors, facial features, lighting style). Output a comma-separated list of visual descriptors that can be used to generate this exact character in other poses."
    });
    return result.text;
};

export const generateFashionImage = async (prompt: string, referenceImage?: string): Promise<string> => {
    const result = await invokeGemini('generate-image', {
        prompt,
        aspectRatio: "3:4",
        model: "gemini-2.5-flash-image",
        referenceImageBase64: referenceImage
    });
    return result.imageData;
};

// VEO VIDEO GENERATION
export const generateVeoVideo = async (prompt: string, imageBase64?: string, aspectRatio: string = '9:16'): Promise<string> => {
    const result = await invokeGemini('generate-veo', {
        prompt,
        imageBase64,
        aspectRatio
    });
    return `data:video/mp4;base64,${result.videoData}`;
};

// SORA VIDEO GENERATION (KIE.AI)
export const generateSoraVideo = async (prompt: string, imageBase64?: string, aspectRatio: string = '9:16'): Promise<string> => {
    const result = await invokeGemini('generate-sora', {
        prompt,
        imageBase64,
        aspectRatio
    });
    return result.videoUrl;
};

// Deprecated Mock/Placeholder
export const generateVeoImageToVideo = async (p: string, i: string): Promise<string> => { return ""; }
export const generateVeoProductVideo = async (p: string, i: string[], r: any): Promise<string> => { return ""; }
export const generateProductShotPrompts = async (i: string, u: string): Promise<string[]> => { return []; }

// Helper: Proxy an asset (image/video/audio) through the Cloud Function to avoid CORS
export const proxyAsset = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.startsWith('data:')) return url;

    // Only proxy if it's not from our own domain or firebase storage (which should have CORS set)
    const isInternal = url.includes(window.location.host) || url.includes('firebasestorage.googleapis.com');
    if (isInternal) return url;

    try {
        const result = await invokeGemini('proxy-webhook', {
            url,
            method: 'GET'
        });

        if (result && result.details && result.success) {
            return result.details; // This will be the data:URI containing base64 content
        }
        return url;
    } catch (e) {
        console.warn("Proxy asset failed, falling back to original URL:", e);
        return url;
    }
};
