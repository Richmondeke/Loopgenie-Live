
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ShortMakerManifest, ShortMakerScene } from "../types";
import { stitchVideoFrames, concatenateVideos } from "./ffmpegService";
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
  scriptStyle?: string; 
  mode?: 'SHORTS' | 'STORYBOOK';
  durationTier?: '15s' | '30s' | '60s' | '5m' | '10m' | '20m';
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

// Helper to calculate total scenes needed based on duration
const getTargetSceneCount = (duration: string): number => {
    const map: Record<string, number> = { 
        '15s': 3, '30s': 6, '60s': 12, 
        '5m': 60, '10m': 120, '20m': 240 
    };
    return map[duration] || 6;
};

export const generateStory = async (req: GenerateStoryRequest): Promise<ShortMakerManifest> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const targetScenesTotal = getTargetSceneCount(req.durationTier || '30s');
  
  // For short videos, we can do it in one go
  if (targetScenesTotal <= 15) {
      return await generateStoryBatch(ai, req, targetScenesTotal, 1);
  }

  // For long videos (5m+), we generate in chunks to avoid context window issues and timeouts
  // We'll generate "Chapters" essentially.
  let allScenes: ShortMakerScene[] = [];
  const batchSize = 10; 
  const batches = Math.ceil(targetScenesTotal / batchSize);
  
  // Base Manifest Structure
  let baseManifest: ShortMakerManifest = {
      title: "Generating...",
      final_caption: "",
      voice_instruction: { voice: "Fenrir", lang: "en", tone: "standard" },
      output_settings: { 
          video_resolution: req.aspectRatio === '16:9' ? "1920x1080" : "1080x1920", 
          fps: 30, 
          scene_duration_default: 5 
      },
      scenes: []
  };

  for (let i = 0; i < batches; i++) {
      const startScene = (i * batchSize) + 1;
      const count = Math.min(batchSize, targetScenesTotal - allScenes.length);
      
      const context = i === 0 
        ? `This is the START of the video.` 
        : `CONTINUATION. Previous scene ended with: "${allScenes[allScenes.length-1].narration_text}". Keep the story flowing.`;
      
      try {
        const batchManifest = await generateStoryBatch(ai, req, count, startScene, context);
        
        // Merge data
        if (i === 0) {
            baseManifest = { ...batchManifest, scenes: [] }; // Keep metadata
        }
        allScenes = [...allScenes, ...batchManifest.scenes];
        
      } catch (e) {
          console.error(`Batch ${i+1} failed`, e);
          // If a batch fails, we stop and return what we have to save partial progress
          break; 
      }
  }
  
  return {
      ...baseManifest,
      scenes: allScenes,
      status: "story_ready",
      seed: req.seed || Math.random().toString(36).substring(7),
      idea_input: req.idea
  };
};

// Internal function to generate a specific batch of scenes
const generateStoryBatch = async (
    ai: GoogleGenAI, 
    req: GenerateStoryRequest, 
    count: number, 
    startSceneNumber: number,
    contextInfo: string = ""
): Promise<ShortMakerManifest> => {

  const ratioText = req.aspectRatio || (req.mode === 'STORYBOOK' ? "16:9" : "9:16");
  const ideaClean = (req.idea || '').substring(0, 500).replace(/"/g, "'").replace(/\n/g, " ");
  
  const styleInstruction = req.scriptStyle ? 
    `STYLE: "${req.scriptStyle}". Must adhere to this tone strictly.` : 
    "STYLE: Engaging and Viral.";

  const systemInstruction = `
SYSTEM: You are a professional video content strategist. Output **ONLY** valid JSON.

OBJECTIVE: Create a script for a video.
${styleInstruction}

CRITICAL RULES:
1. Pacing: Narration max 25 words per scene.
2. Visuals: Vivid descriptions for AI image gen.
3. Consistency: Use 'character_tokens' for recurring characters.
4. Output exactly ${count} scenes, starting from Scene #${startSceneNumber}.
5. ${contextInfo}

JSON SCHEMA:
{
  "title": "String (Max 6 words)",
  "final_caption": "String (Max 8 words)",
  "voice_instruction": { "voice": "String", "lang": "String", "tone": "String" },
  "output_settings": { "video_resolution": "String (1080x1920 or 1920x1080)", "fps": "Number", "scene_duration_default": "Number" },
  "scenes": [
    {
      "scene_number": "Number (Must start at ${startSceneNumber})",
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
Mode: "${req.mode || 'SHORTS'}"
VisualTone: "${req.style_tone || ''}"
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
      }
    }), 90000, "Script generation timed out.") as GenerateContentResponse;

    let text = response.text || "";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    if (!text) throw new Error("Empty response from Gemini");
    
    return JSON.parse(text) as ShortMakerManifest;

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
    
    // Chunking logic for long scripts to avoid API limits and failures
    const audioSegments: string[] = [];
    let totalWords = 0;
    
    // Process scenes in batches of parallel requests to speed up but not overwhelm
    const MAX_CONCURRENT = 5;
    for (let i = 0; i < manifest.scenes.length; i += MAX_CONCURRENT) {
        const batch = manifest.scenes.slice(i, i + MAX_CONCURRENT);
        const promises = batch.map(async (scene) => {
            if (!scene.narration_text) return null;
            try {
                // If text is too long, Gemini TTS might fail, but scene narration is usually short
                // We use the simpler Gemini TTS here for all cases as prompt doesn't strictly require ElevenLabs
                return await generateSpeech(scene.narration_text, preferredVoice);
            } catch (e) {
                console.warn(`TTS failed for scene ${scene.scene_number}`, e);
                return null;
            }
        });
        
        const results = await Promise.all(promises);
        results.forEach(res => {
            if (res) audioSegments.push(res);
        });
        
        // Count words
        batch.forEach(s => totalWords += (s.narration_text || '').split(' ').length);
    }
    
    if (audioSegments.length > 0) {
        const combinedUrl = combineAudioSegments(audioSegments);
        return { audioUrl: combinedUrl, duration: totalWords / 2.5 };
    }
    
    throw new Error("TTS generation failed completely.");
};

export const assembleVideo = async (manifest: ShortMakerManifest, backgroundMusicUrl?: string): Promise<string> => {
    const scenes = manifest.scenes.filter(s => !!s.generated_image_url).map(s => ({
        imageUrl: s.generated_image_url as string,
        text: s.narration_text || ""
    }));

    if (scenes.length === 0) throw new Error("No images generated to assemble video");

    // Chunking logic for video rendering
    // Rendering 240 scenes in one go via Canvas can crash the browser.
    // We break it into chunks of 15 scenes (~1 min), render them individually, then concat.
    const CHUNK_SIZE = 15;
    
    if (scenes.length <= CHUNK_SIZE) {
        // Short video: direct render
        return await stitchVideoFrames(
            scenes, 
            manifest.generated_audio_url, 
            undefined, 
            undefined, 
            undefined, 
            backgroundMusicUrl
        );
    }

    // Long video: Chunk based approach
    console.log(`Starting chunked render for ${scenes.length} scenes...`);
    const videoChunks: string[] = [];
    
    // We need to split the audio too if it's one big file, which is hard without FFMPEG.
    // However, `stitchVideoFrames` recalculates duration based on audio length.
    // If we pass the full audio to every chunk, it will be wrong.
    // FIX: We will rely on per-scene timing (approx 5s/scene) for chunks and ignore audio sync for strict lip-sync 
    // (since ShortMaker is narration over bg, slight drift is okay, but ideally we'd slice audio).
    // For MVP robustness: We will pass undefined audio to chunks and just use image timing, 
    // THEN overlay the full audio at the very end if possible, OR accept that we lose audio sync in this mode without FFMPEG.
    
    // BETTER FIX: `synthesizeAudio` creates one big WAV. 
    // We can't slice WAV client side easily without libs.
    // Alternative: We generated audio separately. We can just play the full audio over the final concatenated video?
    // `concatenateVideos` supports a background audio track. We can use the narration as the "background audio" for the final concat.
    
    for (let i = 0; i < scenes.length; i += CHUNK_SIZE) {
        const chunkScenes = scenes.slice(i, i + CHUNK_SIZE);
        console.log(`Rendering chunk ${i/CHUNK_SIZE + 1}...`);
        
        try {
            // Render chunk visually (silent)
            const chunkUrl = await stitchVideoFrames(chunkScenes, undefined, 5000); 
            videoChunks.push(chunkUrl);
        } catch (e) {
            console.error(`Chunk render failed`, e);
            throw new Error(`Render failed at minute ${(i/CHUNK_SIZE)+1}. Please try again.`);
        }
    }

    console.log("Concatenating chunks...");
    // Merge chunks and overlay the main narration audio
    return await concatenateVideos(videoChunks, 1080, 1920, manifest.generated_audio_url);
};
