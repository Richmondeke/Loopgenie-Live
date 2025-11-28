
import { GoogleGenAI, Type } from "@google/genai";
import { ScriptGenerationRequest } from "../types";
import { GEMINI_API_KEYS } from "../constants";

// Helper to get API Key from env, local storage, or rotation pool
export const getApiKey = () => {
    // 1. Priority: Local Storage (User Setting / BYOK)
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey && localKey.trim().length > 0) {
        return localKey;
    }

    // 2. Priority: Default Key Pool (Rotation)
    // Filters out empty strings from env or constants
    const validKeys = GEMINI_API_KEYS.filter(k => k && k.trim().length > 0);
    
    if (validKeys.length > 0) {
        // Simple random rotation to distribute load
        return validKeys[Math.floor(Math.random() * validKeys.length)];
    }

    // 3. Fallback: Check process.env directly if not in array (legacy safety)
    if (process.env.API_KEY) {
        return process.env.API_KEY;
    }

    // If we reach here, no key is available.
    throw new Error("Google Gemini API Key is missing. Please add your key in Settings to continue.");
};

export const generateScriptContent = async (
  request: ScriptGenerationRequest
): Promise<Record<string, string>> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
    if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later.");
     }
     throw error;
  }
};

export const generateVeoVideo = async (prompt: string, aspectRatio: '16:9' | '9:16' = '16:9'): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("Starting Veo generation for:", prompt, aspectRatio);

  try {
    // veo-3.1-fast-generate-preview for general text-to-video
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
            numberOfVideos: 1,
            resolution: '1080p', // Fast supports 1080p
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
     if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
     }
     throw error;
  }
};

export const generateVeoImageToVideo = async (prompt: string, imageBase64: string): Promise<string> => {
    const apiKey = getApiKey();
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
      if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
          throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
       }
       throw error;
    }
  };

export const generateVeoProductVideo = async (prompt: string, imagesBase64: string[]): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("Starting Veo Product Video generation with", imagesBase64.length, "images");

  // Construct reference images payload
  const referenceImagesPayload: any[] = [];
  
  for (const img of imagesBase64) {
    // Dynamically detect MIME type from base64 string
    // Format is usually: "data:image/png;base64,iVBOR..."
    const match = img.match(/^data:(.+);base64,(.+)$/);
    const mimeType = match ? match[1] : 'image/jpeg'; // Default to jpeg if parsing fails
    const imageBytes = match ? match[2] : (img.split(',')[1] || img);

    referenceImagesPayload.push({
      image: {
        imageBytes: imageBytes,
        mimeType: mimeType,
      },
      referenceType: 'ASSET', // Use generic ASSET type for reference images
    });
  }

  try {
    // Note: 'veo-3.1-generate-preview' supports multiple reference images
    // Constraints: 16:9 aspect ratio and 720p resolution are required for this feature
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9',
        referenceImages: referenceImagesPayload
      }
    });

    console.log("Veo Product operation started:", operation);

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
        throw new Error("No video URI returned from Veo Product Generation");
    }

    return `${videoUri}&key=${apiKey}`;
  } catch (error: any) {
    if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Daily AI quota exceeded. Please try again later or check your billing.");
     }
     throw error;
  }
};
