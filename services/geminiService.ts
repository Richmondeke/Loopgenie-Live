

import { GoogleGenAI, Type } from "@google/genai";
import { ScriptGenerationRequest } from "../types";
import { GEMINI_API_KEYS } from "../constants";

// Helper to get API Key strictly from env, local storage, or constants
export const getApiKey = () => {
    // 1. Try environment variable (Standard practice)
    if (process.env.API_KEY) {
        console.debug("Using Gemini Key from: process.env");
        return process.env.API_KEY;
    }

    // 2. Try Local Storage (User entered in Settings)
    const localKey = localStorage.getItem('genavatar_gemini_key');
    if (localKey) {
        console.debug("Using Gemini Key from: localStorage");
        return localKey;
    }
    
    // 3. Try User provided key from constants (Fallback for demo/client-side apps)
    if (GEMINI_API_KEYS.length > 0 && GEMINI_API_KEYS[0]) {
        console.debug("Using Gemini Key from: constants.ts (Default)");
        return GEMINI_API_KEYS[0];
    }
    
    console.warn("No Gemini API Key found.");
    return "";
};

export const generateScriptContent = async (
  request: ScriptGenerationRequest
): Promise<Record<string, string>> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing. Please check Settings or constants.ts");
  
  const ai = new GoogleGenAI({ apiKey });

  // For avatar videos, we really only care about the 'script' variable.
  const schema = {
    type: Type.OBJECT,
    properties: {
        script: { type: Type.STRING, description: "The spoken script for the video." }
    },
    required: ["script"],
  };

  const prompt = `
    You are a professional video script writer for AI avatars.
    Topic: ${request.topic}
    Tone: ${request.tone}
    
    Write a clear, engaging spoken script for a single speaker. 
    Keep it concise (under 60 seconds reading time).
    Do not include scene directions or camera angles, just the spoken words.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: "You are a creative script writer.",
      },
    });

    const text = response.text;
    if (!text) return { script: "" };
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini generation error:", error);
    
    if (error.status === 403 || error.message?.includes('403') || error.message?.includes('leaked')) {
        throw new Error("API Key Invalid or Leaked. Please update your Gemini API Key in Settings.");
    }
    
    // Handle Quota Exceeded (429) specifically
    if (error.status === 429 || (error.message && error.message.includes('429')) || error.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn("Quota exceeded. Returning fallback script.");
        return { 
            script: `(AI Quota Exceeded) Here is a draft script about ${request.topic}. Please edit this text to suit your needs.` 
        };
    }
    
    throw error;
  }
};

// Helper to convert base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to create a WAV header for raw PCM data
function createWavHeader(pcmDataLength: number, sampleRate: number = 24000, numChannels: number = 1): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  view.setUint8(0, 'R'.charCodeAt(0));
  view.setUint8(1, 'I'.charCodeAt(0));
  view.setUint8(2, 'F'.charCodeAt(0));
  view.setUint8(3, 'F'.charCodeAt(0));
  view.setUint32(4, 36 + pcmDataLength, true); // ChunkSize
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));

  // fmt sub-chunk
  view.setUint8(12, 'f'.charCodeAt(0));
  view.setUint8(13, 'm'.charCodeAt(0));
  view.setUint8(14, 't'.charCodeAt(0));
  view.setUint8(15, ' '.charCodeAt(0));
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  view.setUint8(36, 'd'.charCodeAt(0));
  view.setUint8(37, 'a'.charCodeAt(0));
  view.setUint8(38, 't'.charCodeAt(0));
  view.setUint8(39, 'a'.charCodeAt(0));
  view.setUint32(40, pcmDataLength, true); // Subchunk2Size

  return new Uint8Array(buffer);
}

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data returned from Gemini TTS");
    }

    // Convert raw PCM to WAV
    const pcmBytes = base64ToUint8Array(base64Audio);
    const wavHeader = createWavHeader(pcmBytes.length, 24000, 1);
    
    // Concatenate header and data
    const wavBytes = new Uint8Array(wavHeader.length + pcmBytes.length);
    wavBytes.set(wavHeader);
    wavBytes.set(pcmBytes, wavHeader.length);

    // Convert back to base64 for data URI (or we could return Blob object URL)
    const wavBase64 = btoa(
      Array.from(wavBytes)
        .map((byte) => String.fromCharCode(byte))
        .join('')
    );

    return `data:audio/wav;base64,${wavBase64}`;

  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid/Leaked. Check Settings.");
    }
    if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later.");
     }
     throw error;
  }
};

export const generateVeoVideo = async (
    prompt: string, 
    aspectRatio: '16:9' | '9:16' = '16:9',
    model: string = 'veo-3.1-fast-generate-preview'
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  
  console.log(`Starting Veo generation using ${model}:`, prompt, aspectRatio);

  try {
    let operation = await ai.models.generateVideos({
        model: model,
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            // Pro model supports '1080p' but can handle more complex prompts. Fast is strictly 1080p/720p.
            resolution: '1080p', 
            aspectRatio: aspectRatio
        }
    });

    console.log("Veo operation started:", operation);

    // Poll for completion
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
        operation = await ai.operations.getVideosOperation({operation: operation});
        console.log("Veo polling status:", operation.metadata?.state);
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
        throw new Error("No video URI returned from Veo");
    }

    // The URI needs the API key appended to be downloadable/playable
    return `${videoUri}&key=${apiKey}`;
  } catch (error: any) {
     if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid/Leaked. Check Settings.");
     }
     if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
     }
     throw error;
  }
};

export const generateVeoImageToVideo = async (prompt: string, imageBase64: string): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing.");

    const ai = new GoogleGenAI({ apiKey });
    
    console.log("Starting Veo Image-to-Video generation");
  
    // Dynamically detect MIME type from base64 string
    const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/png'; // Default
    const imageBytes = match ? match[2] : (imageBase64.split(',')[1] || imageBase64);
  
    try {
      // veo-3.1-fast-generate-preview allows starting image
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || "Animate this image", // Prompt is optional but helpful
        image: {
            imageBytes: imageBytes,
            mimeType: mimeType
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9' // Usually output ratio must match or be standard. Veo fast supports 16:9 or 9:16.
        }
      });
  
      console.log("Veo Image-to-Video operation started:", operation);
  
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }
  
      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
          throw new Error("No video URI returned from Veo Image-to-Video");
      }
  
      return `${videoUri}&key=${apiKey}`;
    } catch (error: any) {
      if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid/Leaked. Check Settings.");
      }
      if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
          throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
       }
       throw error;
    }
  };

export const generateVeoProductVideo = async (
    prompt: string, 
    imagesBase64: string[], 
    resolution: '720p' | '1080p' = '720p'
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  
  console.log("Starting Veo Product Video generation with", imagesBase64.length, "images. Resolution:", resolution);

  // Construct reference images payload
  const referenceImagesPayload: any[] = [];
  
  for (const img of imagesBase64) {
    // Dynamically detect MIME type from base64 string
    const match = img.match(/^data:(.+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const imageBytes = match ? match[2] : (img.split(',')[1] || img);

    referenceImagesPayload.push({
      image: {
        imageBytes: imageBytes,
        mimeType: mimeType,
      },
      referenceType: 'ASSET', // Use generic ASSET type
    });
  }

  try {
    // 'veo-3.1-generate-preview' supports multiple reference images
    // Constraints: 16:9 aspect ratio and 720p resolution are required for this feature
    // Note: If user selected 1080p, we try to pass it, but if model rejects, we might fallback or catch error.
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: resolution, // Pass user selection
        aspectRatio: '16:9',
        referenceImages: referenceImagesPayload
      }
    });

    console.log("Veo Product operation started:", operation);

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      console.log("Veo polling status:", operation.metadata?.state);
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
        throw new Error("No video URI returned from Veo Product Generation");
    }

    return `${videoUri}&key=${apiKey}`;
  } catch (error: any) {
    console.error("Veo Product Video Error:", error);
    if (error.status === 403 || error.message?.includes('403')) {
        throw new Error("API Key Invalid/Leaked. Check Settings.");
    }
    if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
     }
     throw error;
  }
};

// NEW: Generate prompts for multi-shot video sequence
export const generateProductShotPrompts = async (imageBase64: string, userIdea: string): Promise<string[]> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const ai = new GoogleGenAI({ apiKey });

    // Detect MIME and cleanup
    const match = imageBase64.match(/^data:(.+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const imageBytes = match ? match[2] : (imageBase64.split(',')[1] || imageBase64);

    const systemInstruction = `
    You are a professional video director. Your task is to look at a product image and a user idea, then generate 3 distinct video prompts for Google Veo to create a compelling 15-second marketing sequence.
    
    The 3 shots should be:
    1. **Showcase**: A clean, cinematic 360 orbit or pan of the product to show details.
    2. **Interaction**: A shot showing the product being held, used, or interacted with by a human hand or model (UGC style).
    3. **Lifestyle/Creative**: A creative shot of the product in a relevant environment (e.g. on a desk, outdoors, in a studio).
    
    OUTPUT FORMAT:
    Return strictly a JSON array of 3 strings. Example:
    ["Cinematic orbit of a red soda can on a wet table", "A hand picking up the red soda can", "The soda can sitting on a beach towel at sunset"]
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: imageBytes } },
                    { text: `User Idea: ${userIdea}. Generate 3 Veo video prompts.` }
                ]
            },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json"
            }
        });

        const text = response.text;
        if (!text) return ["Cinematic product shot", "Product being used", "Product in environment"];

        const prompts = JSON.parse(text);
        if (Array.isArray(prompts)) return prompts.slice(0, 3);
        return [];
    } catch (e) {
        console.error("Failed to generate shot prompts", e);
        return [
            `Cinematic shot of ${userIdea}`,
            `Close up detail shot of ${userIdea}`,
            `Lifestyle shot of ${userIdea}`
        ];
    }
};
