
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ShortMakerManifest, ShortMakerScene } from "../types";
import { stitchVideoFrames } from "./ffmpegService";
import { generatePollinationsImage } from "./pollinationsService";
import { generateSpeech, getApiKey } from "./geminiService";

// ==========================================
// 1. GENERATE STORY (Gemini Text)
// ==========================================

export interface GenerateStoryRequest {
  idea: string;
  seed?: string;
  reference_image_url?: string;
  voice_preference?: any;
  style_tone?: string;
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
  
  // 1. Determine constraints based on user input
  const durationMap: Record<string, number> = {
      '15s': 3,
      '30s': 6,
      '60s': 12
  };
  const targetScenes = durationMap[req.durationTier || '30s'] || 5;
  const ratioText = req.aspectRatio || (req.mode === 'STORYBOOK' ? "16:9" : "9:16");

  // CRITICAL FIX: Sanitize reference_image_url to ensure no huge Base64 strings are passed in text prompt
  const refImageClean = req.reference_image_url && req.reference_image_url.startsWith('data:') 
    ? '(Image Provided as Reference)' 
    : (req.reference_image_url || '');

  // CRITICAL FIX: Sanitize idea to prevent length explosion or JSON breaking
  const ideaClean = (req.idea || '').substring(0, 500).replace(/"/g, "'").replace(/\n/g, " ");

  const systemInstruction = `
SYSTEM: You are a deterministic content generator. Receive a single short idea and output **ONLY** valid JSON matching the manifest schema below. No explanation, no extra fields, no prose. Use low temperature for determinism.

CONSTRAINTS (CRITICAL):
- Output MUST be valid JSON.
- Total JSON length MUST be under 30000 characters.
- title: Max 6 words.
- final_caption: Max 8 words.
- scenes: Exactly ${targetScenes} scenes.
- narration_text: Max 20 words per scene. Keep it punchy.
- visual_description: Max 15 words per scene. Concise.
- image_prompt: Max 30 words per scene. Focus on visual details of the character and setting.
- character_tokens: Max 3 descriptive items (e.g. "young boy red cap", "robotic cat").
- environment_tokens: Max 3 descriptive items (e.g. "cyberpunk city rain", "sunny meadow").

Do not be verbose. Be extremely concise.
  `;

  const userPrompt = `
InputIdea: "${ideaClean}"
OptionalSeed: "${req.seed || ''}"
ReferenceImage: "${refImageClean}"
VoicePref: "${JSON.stringify(req.voice_preference || {})}"
StyleTone: "${req.style_tone || ''}"
Mode: "${req.mode || 'SHORTS'}"
TargetDuration: "${req.durationTier || '30s'}"
AspectRatio: "${ratioText}"
  `;

  // Schema Definition for Strict JSON
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      final_caption: { type: Type.STRING },
      voice_instruction: {
        type: Type.OBJECT,
        properties: {
          voice: { type: Type.STRING },
          lang: { type: Type.STRING },
          tone: { type: Type.STRING }
        }
      },
      output_settings: {
        type: Type.OBJECT,
        properties: {
          video_resolution: { type: Type.STRING },
          fps: { type: Type.NUMBER },
          scene_duration_default: { type: Type.NUMBER }
        }
      },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            scene_number: { type: Type.NUMBER },
            duration_seconds: { type: Type.NUMBER },
            narration_text: { type: Type.STRING },
            visual_description: { type: Type.STRING },
            character_tokens: { type: Type.ARRAY, items: { type: Type.STRING } },
            environment_tokens: { type: Type.ARRAY, items: { type: Type.STRING } },
            camera_directive: { type: Type.STRING },
            image_prompt: { type: Type.STRING },
            transition_to_next: { type: Type.STRING },
            timecodes: {
                type: Type.OBJECT,
                properties: {
                    start_second: { type: Type.NUMBER },
                    end_second: { type: Type.NUMBER }
                }
            }
          }
        }
      }
    },
    required: ["title", "scenes", "output_settings", "voice_instruction"]
  };

  try {
    // 30 Seconds timeout for story generation
    const response = await withTimeout(ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
        maxOutputTokens: 8192 
      }
    }), 30000, "Script generation timed out. Please try again or select a shorter duration.") as GenerateContentResponse;

    let text = response.text || "";
    
    // Cleanup: Remove markdown code blocks if present (sometimes model adds them despite config)
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    if (!text) throw new Error("Empty response from Gemini");
    
    // Safety check for parsing
    try {
        const manifest = JSON.parse(text) as ShortMakerManifest;
        
        // Client-side validation
        if (!manifest.scenes || Math.abs(manifest.scenes.length - targetScenes) > 2) {
             // We allow a small margin of error (e.g. +/- 2 scenes) but warn
             console.warn(`Manifest has ${manifest.scenes?.length} scenes, expected ${targetScenes}.`);
        }
        
        return {
            ...manifest,
            status: "story_ready",
            seed: req.seed || Math.random().toString(36).substring(7),
            idea_input: req.idea
        };
    } catch (parseError) {
        console.error("JSON Parse Error in Story Generation:", parseError);
        console.log("Raw Text Received (First 500 chars):", text.substring(0, 500) + "..."); 
        
        if (parseError instanceof SyntaxError && text.length > 8000) {
             throw new Error("Story generation was too long and got cut off. Try a shorter duration.");
        }
        
        throw new Error("Failed to parse story manifest. Please try again.");
    }

  } catch (error: any) {
    if (error.status === 429) {
        throw new Error("Daily AI quota exceeded (Story Generation).");
    }
    throw error;
  }
};

// ==========================================
// 2. GENERATE IMAGES (Pollinations AI)
// ==========================================

export const generateSceneImage = async (
    scene: ShortMakerScene, 
    globalSeed: string, 
    styleTone?: string,
    aspectRatio: string = '9:16'
): Promise<string> => {
    
    // Construct sophisticated prompt for consistency and realism
    const style = styleTone || 'Cinematic';
    
    const characterAnchor = scene.character_tokens.length > 0 
        ? `Consistent character features: ${scene.character_tokens.join(', ')}` 
        : '';
        
    const envAnchor = scene.environment_tokens.length > 0
        ? `in ${scene.environment_tokens.join(', ')}`
        : '';

    // Base prompt: Style first, then subject, then details
    let fullPrompt = `(${style} style), ${scene.image_prompt}, ${characterAnchor}, ${envAnchor}`;

    // Add quality modifiers based on style
    if (style.toLowerCase().includes('photo') || style.toLowerCase().includes('realistic') || style.toLowerCase().includes('cinematic')) {
        fullPrompt += `, photorealistic, 8k uhd, dslr, soft cinematic lighting, highly detailed, film grain, Fujifilm XT3, sharp focus, masterpiece`;
    } else if (style.toLowerCase().includes('anime')) {
        fullPrompt += `, studio ghibli style, anime art, high quality, vibrant colors, detailed`;
    } else if (style.toLowerCase().includes('watercolor') || style.toLowerCase().includes('illustration')) {
        fullPrompt += `, watercolor painting, soft edges, intricate details, storybook illustration, elegant strokes`;
    } else if (style.toLowerCase().includes('oil')) {
        fullPrompt += `, oil painting, textured brushstrokes, classical art, masterpiece`;
    } else {
        fullPrompt += `, masterpiece, best quality, ultra-detailed, sharp focus`;
    }

    // Add negative-like constraints (Flux handles these via natural language mostly)
    fullPrompt += `, perfect composition, no text, no distortion.`;

    // Calculate dimensions based on Aspect Ratio
    let width = 720;
    let height = 1280;

    switch (aspectRatio) {
        case '16:9':
            width = 1280;
            height = 720;
            break;
        case '1:1':
            width = 1024;
            height = 1024;
            break;
        case '4:3':
            width = 1024;
            height = 768;
            break;
        case '9:16':
        default:
            width = 720;
            height = 1280;
            break;
    }

    // We use globalSeed + scene_number to ensure determinism but variation per scene
    const seed = `${globalSeed}-${scene.scene_number}`;

    return await generatePollinationsImage(fullPrompt, width, height, seed);
};

// ==========================================
// 3. SYNTHESIZE AUDIO (ElevenLabs or Gemini TTS)
// ==========================================

export const synthesizeAudio = async (
    manifest: ShortMakerManifest, 
    elevenApiKey?: string
): Promise<{ audioUrl: string, duration: number }> => {
    
    // 1. Try Gemini TTS (Free/Built-in) first if no ElevenLabs key or as default
    if (!elevenApiKey) {
        console.log("No ElevenLabs key found, using Gemini TTS...");
        const fullText = manifest.scenes.map(s => s.narration_text).join(". ");
        
        try {
            // Add timeout for Gemini TTS as well
            const audioUrl = await withTimeout(
                generateSpeech(fullText, "Fenrir"), 
                20000, 
                "TTS Generation timed out"
            ); 
            
            // Estimate duration (approx 150 words per minute -> 2.5 words per sec)
            const wordCount = fullText.split(' ').length;
            const estDuration = Math.max(25, wordCount / 2.5);
            
            return { audioUrl, duration: estDuration };
        } catch (e) {
            console.error("Gemini TTS Failed inside synthesizeAudio", e);
            throw e; // Bubble up to be caught by runner
        }
    }

    // 2. Try ElevenLabs if key exists
    const fullText = manifest.scenes
        .map(s => s.narration_text)
        .join(' <break time="0.5s" /> ');

    const voiceId = "pNInz6obpgDQGcFmaJgB"; // Example voice ID
    
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': elevenApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: fullText,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            throw new Error("ElevenLabs API Error");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve) => {
            const audio = new Audio(url);
            audio.onloadedmetadata = () => {
                resolve({ audioUrl: url, duration: audio.duration });
            };
            audio.onerror = () => {
                 resolve({ audioUrl: url, duration: 25 }); // Fallback
            };
        });

    } catch (error) {
        console.warn("ElevenLabs failed, falling back to Gemini TTS:", error);
        // Fallback to Gemini
        const text = manifest.scenes.map(s => s.narration_text).join(". ");
        const url = await withTimeout(generateSpeech(text, "Fenrir"), 20000, "Fallback TTS timed out");
        return { audioUrl: url, duration: 25 };
    }
};

// ==========================================
// 4. ASSEMBLE VIDEO (FFMPEG / Client-Side)
// ==========================================

export const assembleVideo = async (manifest: ShortMakerManifest): Promise<string> => {
    // Extract asset URLs from manifest
    const images = manifest.scenes
        .map(s => s.generated_image_url)
        .filter(url => !!url) as string[];
        
    const audioUrl = manifest.generated_audio_url;

    if (images.length === 0) {
        throw new Error("No images generated to assemble video");
    }

    // Use the FFMPEG service to stitch inputs
    return await stitchVideoFrames(images, audioUrl);
};
