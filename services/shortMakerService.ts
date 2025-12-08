import { invokeGemini } from "./geminiService";
import { ShortMakerManifest, ShortMakerScene } from "../types";
import { stitchVideoFrames, concatenateVideos } from "./ffmpegService";
import { generateSpeech, combineAudioSegments } from "./geminiService";
import { generatePollinationsImage } from "./pollinationsService";

// ==========================================
// 0. BACKGROUND JOB STORE (Singleton)
// ==========================================

export type JobStatus = 'IDLE' | 'SCRIPTING' | 'VISUALIZING' | 'NARRATING' | 'ASSEMBLING' | 'COMPLETED' | 'FAILED';

class ShortMakerJobStore {
    manifest: ShortMakerManifest | null = null;
    logs: string[] = [];
    status: JobStatus = 'IDLE';
    completedImages: number = 0;
    totalImages: number = 0;
    error: string | null = null;
    videoUrl: string | null = null;
    
    // Observers
    private listeners: (() => void)[] = [];

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    reset() {
        this.manifest = null;
        this.logs = [];
        this.status = 'IDLE';
        this.completedImages = 0;
        this.totalImages = 0;
        this.error = null;
        this.videoUrl = null;
        this.notify();
    }

    update(updates: Partial<ShortMakerJobStore>) {
        Object.assign(this, updates);
        this.notify();
    }

    addLog(msg: string) {
        this.logs = [...this.logs, msg];
        this.notify();
    }
}

export const jobStore = new ShortMakerJobStore();

// ==========================================
// 1. GENERATE STORY (Gemini Via Edge)
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

const resolveResolution = (aspectRatio: string): string => {
    switch (aspectRatio) {
        case '16:9': return "1920x1080";
        case '9:16': return "1080x1920";
        case '1:1': return "1080x1080";
        case '4:3': return "1440x1080";
        default: return "1080x1920";
    }
};

export const generateStory = async (req: GenerateStoryRequest): Promise<ShortMakerManifest> => {
  const targetScenesTotal = getTargetSceneCount(req.durationTier || '30s');
  const targetResolution = resolveResolution(req.aspectRatio || (req.mode === 'STORYBOOK' ? '16:9' : '9:16'));
  
  jobStore.update({ status: 'SCRIPTING', totalImages: targetScenesTotal });
  jobStore.addLog(`Starting script generation for ${targetScenesTotal} scenes...`);

  // For short videos, we can do it in one go
  if (targetScenesTotal <= 15) {
      let attempts = 0;
      while(attempts < 3) {
          try {
              const result = await generateStoryBatch(req, targetScenesTotal, 1);
              // Check for empty scenes
              if (!result.scenes || result.scenes.length === 0) {
                  throw new Error("AI returned an empty script.");
              }
              // Fix numbering just in case
              result.scenes = result.scenes.map((s, i) => ({...s, scene_number: i + 1}));
              // Ensure resolution is set correctly in result if LLM didn't (or we force it)
              result.output_settings = {
                  ...(result.output_settings || {}),
                  video_resolution: targetResolution,
                  fps: 30,
                  scene_duration_default: 5,
                  captions: { enabled: true, style: 'BOXED' } // Default
              };
              
              jobStore.update({ manifest: result });
              return result;
          } catch(e: any) {
              // FATAL ERROR CHECK
              const msg = (e.message || JSON.stringify(e)).toLowerCase();
              if (msg.includes("referer") || msg.includes("referrer")) {
                  const errorMsg = "API Key Configuration Error: Your Google API Key has 'HTTP Referrer' restrictions. Edge Functions cannot provide a referrer. Please go to Google Cloud Console and remove the restriction (set to None).";
                  jobStore.addLog(`❌ ${errorMsg}`);
                  throw new Error(errorMsg);
              }
              if (msg.includes("api key") || msg.includes("quota") || msg.includes("permission") || msg.includes("403") || msg.includes("401")) {
                  jobStore.addLog(`❌ Fatal Error: ${e.message}`);
                  throw e; // Do not retry fatal errors
              }

              attempts++;
              console.warn(`Single batch attempt ${attempts} failed`, e);
              jobStore.addLog(`Script gen attempt ${attempts} failed. Retrying...`);
              if(attempts >= 3) throw e;
              await new Promise(r => setTimeout(r, 2000));
          }
      }
      throw new Error("Failed to generate story after retries");
  }

  // For long videos (5m+), we generate in chunks
  let allScenes: ShortMakerScene[] = [];
  const batchSize = 5; 
  const batches = Math.ceil(targetScenesTotal / batchSize);
  
  // Base Manifest Structure
  let baseManifest: ShortMakerManifest = {
      title: "Generating...",
      final_caption: "",
      voice_instruction: { voice: "Fenrir", lang: "en", tone: "standard" },
      output_settings: { 
          video_resolution: targetResolution, 
          fps: 30, 
          scene_duration_default: 5,
          captions: { enabled: true, style: 'BOXED' }
      },
      scenes: []
  };

  for (let i = 0; i < batches; i++) {
      const startScene = (i * batchSize) + 1;
      const count = Math.min(batchSize, targetScenesTotal - allScenes.length);
      
      const context = i === 0 
        ? `This is the START of the video.` 
        : `CONTINUATION. Previous scene ended with: "${allScenes[allScenes.length-1]?.narration_text || ''}". Keep the story flowing.`;
      
      let batchSuccess = false;
      let batchAttempts = 0;

      while(!batchSuccess && batchAttempts < 5) {
        try {
            jobStore.addLog(`Writing Batch ${i+1}/${batches}...`);
            const batchManifest = await generateStoryBatch(req, count, startScene, context);
            
            if (!batchManifest.scenes) batchManifest.scenes = [];

            if (i === 0) {
                // Initialize Base Manifest with strict resolution control
                baseManifest = { 
                    ...batchManifest, 
                    scenes: [],
                    output_settings: {
                        ...(batchManifest.output_settings || {}),
                        video_resolution: targetResolution, // STRICT FORCE
                        fps: 30,
                        scene_duration_default: 5,
                        captions: { enabled: true, style: 'BOXED' }
                    }
                };
            }
            
            // Normalize numbering
            const normalizedScenes = batchManifest.scenes.map((s, idx) => ({
                ...s,
                scene_number: allScenes.length + idx + 1
            }));

            allScenes = [...allScenes, ...normalizedScenes];
            
            // Update Store for Live View
            jobStore.update({
                manifest: {
                    ...baseManifest,
                    scenes: allScenes
                }
            });

            batchSuccess = true;
            
            // TIMED BREAK: Cooling off
            jobStore.addLog(`Cooling down (3s)...`);
            await new Promise(r => setTimeout(r, 3000));

        } catch (e: any) {
            // FATAL ERROR CHECK
            const msg = (e.message || JSON.stringify(e)).toLowerCase();
            
            if (msg.includes("referer") || msg.includes("referrer")) {
                  const errorMsg = "API Key Configuration Error: Your Google API Key has 'HTTP Referrer' restrictions. Please go to Google Cloud Console and set restrictions to 'None'.";
                  jobStore.addLog(`❌ ${errorMsg}`);
                  throw new Error(errorMsg);
            }

            if (msg.includes("api key") || msg.includes("quota") || msg.includes("permission") || msg.includes("403") || msg.includes("401")) {
                jobStore.addLog(`❌ Fatal Error: ${e.message}`);
                throw e; // Break completely out of loop
            }

            batchAttempts++;
            console.error(`Batch ${i+1} attempt ${batchAttempts} failed`, e);
            if (batchAttempts < 5) {
                 jobStore.addLog(`Batch ${i+1} failed, retrying in 3s...`);
                 await new Promise(r => setTimeout(r, 3000 * batchAttempts));
            }
        }
      }

      if (!batchSuccess) {
          jobStore.addLog(`Error: Batch ${i+1} failed permanently.`);
          break; 
      }
  }
  
  if (allScenes.length === 0) {
      throw new Error("Failed to generate any scenes for the script. Please try a different idea.");
  }

  const finalManifest = {
      ...baseManifest,
      scenes: allScenes,
      status: "story_ready" as const,
      seed: req.seed || Math.random().toString(36).substring(7),
      idea_input: req.idea
  };
  
  jobStore.update({ manifest: finalManifest });
  return finalManifest;
};

// Internal function to generate a specific batch of scenes via Edge Function
const generateStoryBatch = async (
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
SYSTEM: You are a professional video content strategist. Output **ONLY** valid JSON. No markdown, no pre-amble.

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
  "output_settings": { "video_resolution": "String", "fps": "Number", "scene_duration_default": "Number" },
  "scenes": [
    {
      "scene_number": "Number (Must start at ${startSceneNumber})",
      "narration_text": "String",
      "visual_description": "String",
      "character_tokens": ["String"],
      "environment_tokens": ["String"],
      "image_prompt": "String",
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
    const response = await withTimeout(
        invokeGemini('generate-story-batch', {
            model: "gemini-2.5-flash",
            contents: userPrompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.4,
                // Removed maxOutputTokens and responseMimeType to be safe and use defaults
            }
        }), 
        90000, 
        "Script generation timed out."
    );

    let text = response.text || "";
    
    // Robust cleaning for JSON
    if (text.includes("```json")) {
        text = text.split("```json")[1].split("```")[0];
    } else if (text.includes("```")) {
        text = text.split("```")[1].split("```")[0];
    }
    text = text.trim();

    if (!text) throw new Error("Empty response from Gemini");
    
    return JSON.parse(text) as ShortMakerManifest;

  } catch (error: any) {
    console.error("generateStoryBatch Error:", error);
    
    if (error.message?.includes('Missing GEMINI_API secret')) {
        throw new Error("Missing API Key. Please add your Google Gemini API Key in the Settings page to continue.");
    }
    if (error.status === 429) throw new Error("Daily AI quota exceeded (Story Generation).");
    if (error.status === 403 || error.message?.includes('PERMISSION_DENIED')) throw new Error("API Key Error: Permission Denied.");
    
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

    // FAILSAFE: Ensure prompt is not empty or malformed
    let basePrompt = scene.image_prompt;
    if (!basePrompt || basePrompt.trim().length < 5) {
        basePrompt = scene.visual_description || scene.narration_text || "A cinematic scene";
    }
    // Truncate to prevent token limit crashes (though Gemini allows large context, safety first)
    if (basePrompt.length > 1500) basePrompt = basePrompt.substring(0, 1500);

    let fullPrompt = `(${style} style), ${basePrompt}, ${characterAnchor}, ${envAnchor}`;

    if (style.toLowerCase().includes('photo') || style.toLowerCase().includes('cinematic')) {
        fullPrompt += `, photorealistic, 8k uhd, cinematic lighting, sharp focus, masterpiece`;
    } else if (style.toLowerCase().includes('anime')) {
        fullPrompt += `, anime art, high quality, vibrant colors, detailed`;
    } else {
        fullPrompt += `, masterpiece, best quality, ultra-detailed`;
    }

    if (model === 'flux') {
        // Updated resolution logic for Flux to match common aspect ratios
        let width = 720; let height = 1280;
        if (aspectRatio === '16:9') { width = 1280; height = 720; }
        if (aspectRatio === '1:1') { width = 1024; height = 1024; }
        if (aspectRatio === '4:3') { width = 1024; height = 768; }
        
        const sceneSeed = globalSeed + scene.scene_number; 
        return await generatePollinationsImage(fullPrompt, width, height, sceneSeed);
    }

    const geminiModelName = model === 'gemini_pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

    try {
        const result = await invokeGemini('generate-image', {
            model: geminiModelName,
            prompt: fullPrompt,
            aspectRatio: aspectRatio
        });
        return result.imageData;

    } catch (e: any) {
        console.error(`Gemini Image Gen Error (${model}):`, e);
        
        const msg = (e.message || JSON.stringify(e)).toLowerCase();
        if (msg.includes("referer") || msg.includes("referrer")) {
             throw new Error("API Key Configuration Error: 'HTTP Referrer' restrictions detected. Remove restrictions in Google Cloud Console.");
        }

        if (e.status === 429) throw new Error("Daily AI quota exceeded (Image Generation).");
        if (e.status === 403 || e.message?.includes('PERMISSION_DENIED')) {
            throw new Error("PERMISSION_DENIED");
        }
        throw e;
    }
};

export const synthesizeAudio = async (
    manifest: ShortMakerManifest, 
    elevenApiKey?: string,
    preferredVoice: string = "Fenrir"
): Promise<{ audioUrl: string, duration: number }> => {
    
    const audioSegments: string[] = [];
    let totalWords = 0;
    
    // Sync status with store
    jobStore.update({ status: 'NARRATING' });

    const MAX_CONCURRENT = 5;
    for (let i = 0; i < manifest.scenes.length; i += MAX_CONCURRENT) {
        jobStore.addLog(`Synthesizing audio batch ${i+1}...`);
        const batch = manifest.scenes.slice(i, i + MAX_CONCURRENT);
        const promises = batch.map(async (scene) => {
            if (!scene.narration_text) return null;
            try {
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
        
        batch.forEach(s => totalWords += (s.narration_text || '').split(' ').length);
        
        // Small break
        await new Promise(r => setTimeout(r, 500));
    }
    
    if (audioSegments.length > 0) {
        const combinedUrl = combineAudioSegments(audioSegments);
        return { audioUrl: combinedUrl, duration: totalWords / 2.5 };
    }
    
    throw new Error("TTS generation failed completely.");
};

export const assembleVideo = async (manifest: ShortMakerManifest, backgroundMusicUrl?: string): Promise<string> => {
    const scenes = manifest.scenes.filter(s => !!s.generated_image_url && !s.generated_image_url.includes('placeholder')).map(s => ({
        imageUrl: s.generated_image_url as string,
        text: s.narration_text || ""
    }));

    if (scenes.length === 0) throw new Error("No valid images generated to assemble video");

    jobStore.update({ status: 'ASSEMBLING' });
    jobStore.addLog("Assembling final video...");

    // Determine output dimensions from manifest resolution settings
    let width = 1080;
    let height = 1920;
    if (manifest.output_settings && manifest.output_settings.video_resolution) {
        const [w, h] = manifest.output_settings.video_resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
            width = w;
            height = h;
        }
    }

    // Default to 'BOXED' if undefined
    const captionSettings = manifest.output_settings.captions || { enabled: true, style: 'BOXED' };

    const CHUNK_SIZE = 15;
    
    if (scenes.length <= CHUNK_SIZE) {
        return await stitchVideoFrames(
            scenes, 
            manifest.generated_audio_url, 
            undefined, 
            width, // explicit width
            height, // explicit height
            backgroundMusicUrl,
            captionSettings // Pass captions
        );
    }

    const videoChunks: string[] = [];
    
    for (let i = 0; i < scenes.length; i += CHUNK_SIZE) {
        const chunkScenes = scenes.slice(i, i + CHUNK_SIZE);
        jobStore.addLog(`Rendering video chunk ${i/CHUNK_SIZE + 1}...`);
        
        try {
            const chunkUrl = await stitchVideoFrames(
                chunkScenes, 
                undefined, // Audio chunking logic needed if splitting audio, usually easier to mix audio at end or split narration. 
                // Note: Splitting audio perfectly for chunks is complex client side. 
                // For long video MVP we might need to rely on per-chunk audio or simple slideshow timing if audio is one big blob.
                // Assuming for now chunks are just visual + silent, mixed later?
                // Actually, existing logic for long video seems to lack audio chunking. 
                // For MVP robustness, let's keep audio undefined here and assume 5000ms visual only per chunk if audio too long?
                // Ideally, `assembleVideo` needs to split audio.
                // For this fix request (Concatenation), we focus on resolution. 
                5000, 
                width, 
                height,
                undefined,
                captionSettings
            ); 
            videoChunks.push(chunkUrl);
        } catch (e) {
            console.error(`Chunk render failed`, e);
            throw new Error(`Render failed at minute ${(i/CHUNK_SIZE)+1}. Please try again.`);
        }
    }

    jobStore.addLog("Merging all video chunks...");
    // Pass audio URL to merge logic if it exists, so it's overlaid on the concatenated video
    return await concatenateVideos(videoChunks, width, height, manifest.generated_audio_url);
};