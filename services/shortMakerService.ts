
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ShortMakerManifest, ShortMakerScene } from "../types";
import { stitchVideoFrames } from "./ffmpegService";
import { generateSpeech, getApiKey, combineAudioSegments } from "./geminiService";
import { generatePollinationsImage } from "./pollinationsService";

// ==========================================
// 1. GENERATE STORY (Gemini Text)
// ==========================================

export interface GenerateStoryRequest {
  idea: string;
  seed?: string;
  reference_image_url?: string;
  voice_preference?: any;
  style_tone?: string;
  scriptStyle?: string; // NEW: Script Style (Viral, Funny, etc.)
  mode?: 'SHORTS' | 'STORYBOOK';
  durationTier?: '15s' | '30s' | '60s';
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3';
}

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.then(res => { clearTimeout(timer); return res; }),
        timeoutPromise
    ]);
};

export const generateStory = async (req: GenerateStoryRequest): Promise<ShortMakerManifest> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  const durationMap: Record<string, number> = { '15s': 3, '30s': 6, '60s': 12 };
  const targetScenes = durationMap[req.durationTier || '30s'] || 5;
  const ratioText = req.aspectRatio || (req.mode === 'STORYBOOK' ? "16:9" : "9:16");
  const ideaClean = (req.idea || '').substring(0, 500).replace(/"/g, "'").replace(/\n/g, " ");
  
  // Specific instruction based on selected script style
  const styleInstruction = req.scriptStyle ? 
    `STYLE: "${req.scriptStyle}". Must adhere to this tone strictly.` : 
    "STYLE: Engaging and Viral.";

  const systemInstruction = `
SYSTEM: You are a professional TikTok/Shorts content strategist. Receive an idea and output **ONLY** valid JSON.

OBJECTIVE: Create a highly engaging, fast-paced video script optimized for retention.
${styleInstruction}

CRITICAL RULES:
1. **The Hook**: Scene 1 narration MUST be a strong hook (question, shocking statement, or "Stop scrolling").
2. **Pacing**: Narration should be punchy, max 20 words per scene.
3. **Visuals**: Descriptions must be vivid and specific for AI image generation.
4. **Consistency**: Use 'character_tokens' to keep the main subject consistent across scenes.
5. **Length**: Exactly ${targetScenes} scenes.

JSON SCHEMA:
{
  "title": "String (Max 6 words)",
  "final_caption": "String (Max 8 words)",
  "voice_instruction": { "voice": "String", "lang": "String", "tone": "String" },
  "output_settings": { "video_resolution": "String", "fps": "Number" },
  "scenes": [
    {
      "scene_number": "Number",
      "narration_text": "String (The spoken script)",
      "visual_description": "String (Brief logic)",
      "character_tokens": ["String", "String"],
      "environment_tokens": ["String", "String"],
      "image_prompt": "String (Detailed AI art prompt)",
      "timecodes": { "start_second": "Number", "end_second": "Number" }
    }
  ]
}
`;

  const userPrompt = `
Idea: "${ideaClean}"
Seed: "${req.seed || ''}"
VoicePref: "${JSON.stringify(req.voice_preference || {})}"
VisualTone: "${req.style_tone || ''}"
Mode: "${req.mode || 'SHORTS'}"
Duration: "${req.durationTier || '30s'}"
AspectRatio: "${ratioText}"
  `;

  try {
    const response = await withTimeout(ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 8192,
        tools: [{ googleSearch: {} }] 
      }
    }), 90000, "Script generation timed out.") as GenerateContentResponse;

    let text = response.text || "";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    if (!text) throw new Error("Empty response from Gemini");
    
    try {
        const manifest = JSON.parse(text) as ShortMakerManifest;
        return {
            ...manifest,
            status: "story_ready",
            seed: req.seed || Math.random().toString(36).substring(7),
            idea_input: req.idea
        };
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        throw new Error("Failed to parse story manifest. Please try again.");
    }

  } catch (error: any) {
    if (error.status === 429) throw new Error("Daily AI quota exceeded (Story Generation).");
    throw error;
  }
};

export const generateSceneImage = async (
    scene: ShortMakerScene, 
    globalSeed: string, 
    styleTone?: string,
    aspectRatio: string = '9:16',
    model: 'nano_banana' | 'flux' | 'gemini_pro' = 'nano_banana'
): Promise<string> => {
    
    const style = styleTone || 'Cinematic';
    const characterAnchor = scene.character_tokens.length > 0 ? `Consistent character features: ${scene.character_tokens.join(', ')}` : '';
    const envAnchor = scene.environment_tokens.length > 0 ? `in ${scene.environment_tokens.join(', ')}` : '';

    let fullPrompt = `(${style} style), ${scene.image_prompt}, ${characterAnchor}, ${envAnchor}`;

    if (style.toLowerCase().includes('photo') || style.toLowerCase().includes('cinematic')) {
        fullPrompt += `, photorealistic, 8k uhd, cinematic lighting, sharp focus, masterpiece`;
    } else if (style.toLowerCase().includes('anime')) {
        fullPrompt += `, anime art, high quality, vibrant colors, detailed`;
    } else {
        fullPrompt += `, masterpiece, best quality, ultra-detailed`;
    }

    if (model === 'flux') {
        let width = 720; let height = 1280;
        if (aspectRatio === '16:9') { width = 1280; height = 720; }
        if (aspectRatio === '1:1') { width = 1024; height = 1024; }
        const sceneSeed = globalSeed + scene.scene_number; 
        return await generatePollinationsImage(fullPrompt, width, height, sceneSeed);
    }

    const geminiModelName = model === 'gemini_pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    try {
        const response = await ai.models.generateContent({
            model: geminiModelName,
            contents: { parts: [{ text: fullPrompt }] },
            config: { imageConfig: { aspectRatio: aspectRatio } }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
             if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        throw new Error("No image data in response");

    } catch (e: any) {
        console.error(`Gemini Image Gen Error (${model}):`, e);
        if (e.status === 429) throw new Error("Daily AI quota exceeded (Image Generation).");
        throw e;
    }
};

export const synthesizeAudio = async (
    manifest: ShortMakerManifest, 
    elevenApiKey?: string,
    preferredVoice: string = "Fenrir"
): Promise<{ audioUrl: string, duration: number }> => {
    
    if (!elevenApiKey) {
        try {
            // STRATEGY A: Full Script
            const fullText = manifest.scenes.map(s => s.narration_text).join(". ");
            const audioUrl = await withTimeout(generateSpeech(fullText, preferredVoice), 25000, "TTS Generation timed out"); 
            const wordCount = fullText.split(' ').length;
            return { audioUrl, duration: Math.max(25, wordCount / 2.5) };

        } catch (e) {
            console.warn("Full TTS failed, switching to segments...", e);
            // STRATEGY B: Segments
            const audioSegments: string[] = [];
            let totalWords = 0;
            for (const scene of manifest.scenes) {
                if (!scene.narration_text) continue;
                totalWords += scene.narration_text.split(' ').length;
                try {
                    const segUrl = await generateSpeech(scene.narration_text, preferredVoice); 
                    audioSegments.push(segUrl);
                } catch (innerErr) { console.error(`Scene ${scene.scene_number} audio failed`, innerErr); }
            }
            
            if (audioSegments.length > 0) {
                const combinedUrl = combineAudioSegments(audioSegments);
                return { audioUrl: combinedUrl, duration: totalWords / 2.5 };
            }
            throw new Error("All TTS attempts failed");
        }
    }

    // ElevenLabs Fallback (Simplified)
    const fullText = manifest.scenes.map(s => s.narration_text).join(' <break time="0.5s" /> ');
    // ... ElevenLabs Fetch Logic (omitted for brevity, same as before) ...
    throw new Error("ElevenLabs not configured fully in this snippet"); 
};

export const assembleVideo = async (manifest: ShortMakerManifest, backgroundMusicUrl?: string): Promise<string> => {
    const scenes = manifest.scenes.filter(s => !!s.generated_image_url).map(s => ({
        imageUrl: s.generated_image_url as string,
        text: s.narration_text || ""
    }));
    const audioUrl = manifest.generated_audio_url;
    if (scenes.length === 0) throw new Error("No images generated to assemble video");
    return await stitchVideoFrames(scenes, audioUrl, undefined, undefined, undefined, backgroundMusicUrl);
};
