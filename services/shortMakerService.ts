
import { invokeGemini, generateVeoVideo, generateSoraVideo, proxyAsset } from "./geminiService";
import { ShortMakerManifest, ShortMakerScene } from "../types";
import { stitchVideoFrames, concatenateVideos, AdvancedScene } from "./ffmpegService";
import { generateSpeech } from "./geminiService";
import { generatePollinationsImage } from "./pollinationsService";
import { searchPexels } from "./mockAssetService";

// Re-export for consumption in components
export { generateSoraVideo };

// Helper: Convert URL to Base64 if needed
const urlToBase64 = async (url: string): Promise<string | undefined> => {
    if (!url) return undefined;
    if (url.startsWith('data:')) return url;
    try {
        // Use the proxy to avoid CORS issues
        const dataUri = await proxyAsset(url);
        if (dataUri.startsWith('data:')) {
            return dataUri;
        }

        // Fallback for non-proxied or failed proxy
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(undefined);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Failed to convert image to base64 for reference:", e);
        return undefined;
    }
};

// Helper: Clean Markdown Code Blocks from JSON String
const cleanJson = (text: string) => {
    if (!text) return "";
    let clean = text.trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(json)?\s*/i, '');
        clean = clean.replace(/\s*```$/, '');
    }
    return clean;
};

// ==========================================
// 0. BACKGROUND JOB STORE (Singleton)
// ==========================================

export type JobStatus = 'IDLE' | 'SCRIPTING' | 'VISUALIZING' | 'REVIEWING' | 'ANIMATING' | 'NARRATING' | 'ASSEMBLING' | 'COMPLETED' | 'FAILED';

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
// 1. GENERATE STORY
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

    const manifest = await generateStoryBatch(req, targetScenesTotal, 1);

    manifest.scenes = manifest.scenes.map((s, i) => ({ ...s, scene_number: i + 1 }));
    manifest.output_settings = { ...manifest.output_settings, video_resolution: targetResolution };

    jobStore.update({ manifest });
    return manifest;
};

const generateStoryBatch = async (
    req: GenerateStoryRequest,
    count: number,
    startSceneNumber: number,
    contextInfo: string = ""
): Promise<ShortMakerManifest> => {
    const ratioText = req.aspectRatio || (req.mode === 'STORYBOOK' ? "16:9" : "9:16");
    const systemInstruction = `
SYSTEM: Professional video content strategist and world-building expert. Output **ONLY** valid JSON.
OBJECTIVE: Create a high-quality storyboard for a video script with exactly ${count} scenes.
VISUAL CONSISTENCY IS MANDATORY:
1. 'character_tokens': For each character, define fixed, highly detailed physical traits (e.g., "curly red hair", "jagged scar above left eye", "navy wool coat with gold buttons"). These MUST be identical across all scenes where the character appears.
2. 'environment_tokens': Define specific, unchanging visual elements for the setting (e.g., "glowing purple flora", "rusted iron pipes on walls", "dystopian orange smog"). These MUST be consistent across scenes in the same location.
3. 'visual_description': Provide a full, cinematic description of the frame.
4. 'image_prompt': A concise prompt for AI image generation, incorporating the tokens.
RULES:
1. Max 25 words per scene for narration text.
2. 'camera_directive': Short, specific motion (e.g., "Pan Right", "Slow Zoom In", "Orbit", "Static").
3. Use 'character_tokens' and 'environment_tokens' for EVERY scene to ensure visual grounding.
4. Generate exactly ${count} distinct scenes.
JSON SCHEMA: { "title": "String", "scenes": [ { "scene_number": "Number", "narration_text": "String", "image_prompt": "String", "camera_directive": "String", "visual_description": "String", "character_tokens": ["String"], "environment_tokens": ["String"] } ] }
`;
    const response = await withTimeout(
        invokeGemini('generate-story-batch', {
            model: "gemini-3-flash-preview",
            contents: `Create a script for a video. Topic/Idea: ${req.idea}. Mode: ${req.mode}. Aspect Ratio: ${ratioText}. REQUIRED: Generate exactly ${count} scenes.`,
            config: { temperature: 0.4 },
            systemInstruction
        }),
        90000, "Script timeout"
    );

    // Clean potentially markdown-wrapped JSON
    const jsonStr = cleanJson(response.text);

    try {
        const parsed = JSON.parse(jsonStr) as ShortMakerManifest;
        // Safety check: if result has fewer scenes than requested, try to pad/duplicate or just accept.
        if (parsed.scenes && parsed.scenes.length < count) {
            console.warn(`AI generated ${parsed.scenes.length} scenes, requested ${count}.`);
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse script JSON:", jsonStr);
        throw new Error("AI returned invalid script format. Please retry.");
    }
};

// ==========================================
// 2. IMAGE GENERATION
// ==========================================

export const generateSceneImage = async (
    scene: ShortMakerScene,
    globalSeed: string,
    styleTone?: string,
    aspectRatio: string = '9:16',
    model: 'nano_banana' | 'flux' | 'gemini_pro' | 'veo' | 'sora' = 'nano_banana',
    source: 'AI' | 'PEXELS' = 'AI',
    anchorImageUrl?: string,
    pexelsType: 'image' | 'video' = 'image'
): Promise<{ url: string; type: 'image' | 'video' }> => {

    const style = styleTone || 'Cinematic';

    let basePrompt = scene.image_prompt;
    if (!basePrompt || basePrompt.trim().length < 5) {
        basePrompt = scene.visual_description || scene.narration_text || "A cinematic scene";
    }

    // SAFETY SANITIZATION
    basePrompt = basePrompt.replace(/['"]/g, '');

    if (source === 'PEXELS') {
        try {
            const searchTerms = basePrompt.split(',')[0].substring(0, 100);
            const results = await searchPexels(searchTerms, pexelsType);
            if (results && results.length > 0) return { url: results[0].fullUrl, type: results[0].type as 'image' | 'video' };
        } catch (e) { }
    }

    if (basePrompt.length > 1000) basePrompt = basePrompt.substring(0, 1000);

    let charTokens = scene.character_tokens?.join(', ') || '';
    let envTokens = scene.environment_tokens?.join(', ') || '';

    // CRITICAL: Inject orientation specific framing to prevent "landscape squeezes"
    const orientationFraming = aspectRatio === '9:16'
        ? "Vertical portrait orientation, mobile-first vertical composition, vertical framing, shot for mobile phone screens."
        : aspectRatio === '16:9'
            ? "Landscape widescreen orientation, 16:9 cinematic framing, horizontal composition."
            : "";

    let fullPrompt = `${style} style. ${orientationFraming} ${basePrompt}`;
    if (charTokens) fullPrompt += `. Character visual features: ${charTokens}`;
    if (envTokens) fullPrompt += `. Environment visual features: ${envTokens}`;

    // Helper to call Gemini Image Gen
    const callGeminiImage = async (modelName: string) => {
        let referenceBase64: string | undefined = undefined;
        let effectivePrompt = fullPrompt;

        if (anchorImageUrl) {
            referenceBase64 = await urlToBase64(anchorImageUrl);

            // STRONG INSTRUCTION for Reference Image Separation
            // We want the character from the image, but the scene from the prompt.
            // Updated to include the orientation framing to ensure consistency in framing too.
            effectivePrompt = `STORYBOARD GENERATION.
${orientationFraming}
TARGET SCENE: ${basePrompt}.
REFERENCE IDENTITY: The attached image shows the MAIN CHARACTER.
VISUAL TOKENS:
${charTokens ? `- Character: ${charTokens}` : ""}
${envTokens ? `- Environment: ${envTokens}` : ""}
INSTRUCTION:
1. IF the Target Scene describes the Main Character, preserve their facial features, hair, and clothing from the reference and tokens.
2. IF the Target Scene describes a DIFFERENT character, DO NOT apply the reference identity.
3. ADAPT the composition, lighting, and pose to the Target Scene description.
Style: ${style}.`;
        }

        const result = await invokeGemini('generate-image', {
            model: modelName,
            prompt: effectivePrompt,
            aspectRatio: aspectRatio,
            referenceImageBase64: referenceBase64
        });
        return result.imageData;
    };

    // Helper to call Flux
    const callFlux = async () => {
        const width = aspectRatio === '16:9' ? 1280 : 720;
        const height = aspectRatio === '16:9' ? 720 : 1280;
        return await generatePollinationsImage(fullPrompt, width, height, globalSeed + scene.scene_number);
    };

    // VEO / PRO / SORA WORKFLOW: Pro -> Flash -> Flux
    // For Sora/Veo mode in the editor, we still need static frames first, so we use high-quality image generation.
    if (model === 'veo' || model === 'gemini_pro' || model === 'sora') {
        try {
            // 1. Try Gemini 3 Pro (High Quality)
            return { url: await callGeminiImage('gemini-3-pro-image-preview'), type: 'image' };
        } catch (e: any) {
            console.warn("Gemini 3 Pro failed, trying Flash...", e.message);
            try {
                // 2. Fallback to Gemini 2.5 Flash
                return { url: await callGeminiImage('gemini-2.5-flash-image'), type: 'image' };
            } catch (e2: any) {
                console.warn("Gemini Flash failed, trying Flux...", e2.message);
                // 3. Fallback to Flux
                return { url: await callFlux(), type: 'image' };
            }
        }
    }

    // NANO BANANA WORKFLOW: Flash -> Flux
    else if (model === 'nano_banana') {
        try {
            return { url: await callGeminiImage('gemini-2.5-flash-image'), type: 'image' };
        } catch (e: any) {
            console.warn("Gemini Flash failed, falling back to Flux...", e.message);
            return { url: await callFlux(), type: 'image' };
        }
    }

    // FLUX DIRECT
    else {
        return { url: await callFlux(), type: 'image' };
    }
};

// ==========================================
// 3. ANIMATION (VEO)
// ==========================================

export const animateSceneWithVeo = async (
    imageUrl: string | undefined, // Made optional for T2V fallback 
    prompt: string,
    aspectRatio: string = '9:16'
): Promise<string> => {
    let imageBase64: string | undefined = undefined;

    if (imageUrl) {
        try {
            imageBase64 = await urlToBase64(imageUrl);
        } catch (e) {
            console.warn("Failed to process image for Veo animation, attempting Text-to-Video fallback.");
        }
    }

    // If imageBase64 is undefined, generateVeoVideo will use Text-to-Video mode automatically
    const videoDataUrl = await generateVeoVideo(prompt, imageBase64, aspectRatio);
    return videoDataUrl;
};

// ==========================================
// 4. AUDIO & ASSEMBLY
// ==========================================

export const synthesizeAudio = async (
    manifest: ShortMakerManifest,
    elevenApiKey?: string,
    preferredVoice: string = "Fenrir"
): Promise<ShortMakerManifest> => {
    jobStore.update({ status: 'NARRATING' });
    const fullScript = manifest.scenes.map(s => s.narration_text).filter(t => !!t).join(" ");

    if (!fullScript.trim()) return manifest;

    try {
        const audioUrl = await generateSpeech(fullScript, preferredVoice);
        const updatedManifest = {
            ...manifest,
            scenes: manifest.scenes.map(s => ({ ...s, generated_audio_url: undefined })),
            generated_audio_url: audioUrl
        };
        jobStore.update({ manifest: updatedManifest });
        return updatedManifest;
    } catch (e: any) {
        throw e;
    }
};

export const assembleVideo = async (manifest: ShortMakerManifest, backgroundMusicUrl?: string): Promise<string> => {
    const hasVeoVideos = manifest.scenes.every(s => s.generated_video_url);

    jobStore.update({ status: 'ASSEMBLING' });
    jobStore.addLog(hasVeoVideos ? "Concatenating Veo clips..." : "Stitching images...");

    if (hasVeoVideos) {
        const videoUrls = manifest.scenes
            .filter(s => !!s.generated_video_url)
            .map(s => s.generated_video_url as string);

        let width = 1080; let height = 1920;
        if (manifest.output_settings?.video_resolution) {
            const [w, h] = manifest.output_settings.video_resolution.split('x').map(Number);
            width = w; height = h;
        }

        return await concatenateVideos(videoUrls, width, height, manifest.generated_audio_url || backgroundMusicUrl);

    } else {
        // Fallback: If not all videos are present, stitch the images instead
        const scenes: AdvancedScene[] = manifest.scenes
            .filter(s => !!s.generated_image_url)
            .map(s => ({
                imageUrl: s.generated_image_url as string,
                text: s.narration_text || "",
            }));

        if (scenes.length === 0) throw new Error("No assets to assemble");

        let width = 1080; let height = 1920;
        if (manifest.output_settings?.video_resolution) {
            const [w, h] = manifest.output_settings.video_resolution.split('x').map(Number);
            width = w; height = h;
        }

        const captionSettings = manifest.output_settings.captions || { enabled: true, style: 'BOXED' };
        const animationStyle = manifest.output_settings.animation || 'ZOOM';

        return await stitchVideoFrames(
            scenes,
            manifest.generated_audio_url,
            5000,
            width,
            height,
            backgroundMusicUrl,
            captionSettings,
            animationStyle
        );
    }
};
