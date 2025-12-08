import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Video, Play, Music, Image as ImageIcon, Loader2, Save, Wand2, RefreshCw, BookOpen, Smartphone, CheckCircle, Clock, Film, ChevronRight, AlertCircle, Download, Layout, RectangleHorizontal, RectangleVertical, Square, Edit2, Key, Aperture, Pause, Volume2, Upload, Trash2, Mic, History, ShieldAlert, Subtitles } from 'lucide-react';
import { ShortMakerManifest, ProjectStatus, Template, APP_COSTS } from '../types';
import { generateStory, generateSceneImage, synthesizeAudio, assembleVideo, jobStore } from '../services/shortMakerService';
import { getApiKey, generateSpeech } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface ShortMakerEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

type ProductionStep = 'INPUT' | 'SCRIPT' | 'VISUALS' | 'AUDIO' | 'ASSEMBLY' | 'COMPLETE';
type DurationTier = '15s' | '30s' | '60s' | '5m' | '10m' | '20m';
type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3';
type VisualModel = 'nano_banana' | 'flux' | 'gemini_pro';
type CaptionStyle = 'BOXED' | 'OUTLINE' | 'MINIMAL' | 'HIGHLIGHT';

const VOICES = [
    { id: 'Fenrir', label: 'Fenrir', gender: 'Male', tone: 'Deep, Epic', desc: 'Movie trailer voice' },
    { id: 'Kore', label: 'Kore', gender: 'Female', tone: 'Calm, Soothing', desc: 'Relaxing storybooks' },
    { id: 'Puck', label: 'Puck', gender: 'Male', tone: 'Energetic', desc: 'High energy TikToks' },
    { id: 'Charon', label: 'Charon', gender: 'Male', tone: 'Deep, Steady', desc: 'News & Documentary' },
    { id: 'Zephyr', label: 'Zephyr', gender: 'Female', tone: 'Gentle', desc: 'Educational content' },
];

const SCRIPT_STYLES = [
    { id: 'Viral Hook', label: 'Viral / Hook-Heavy', desc: 'Fast paced, starts with a question.' },
    { id: 'Corporate', label: 'Professional / Corporate', desc: 'Clean, informative, trustworthy.' },
    { id: 'Thriller', label: 'Scary / Thriller', desc: 'Suspenseful, dark, slow pacing.' },
    { id: 'Funny', label: 'Funny / Witty', desc: 'Lighthearted, jokes, punchy.' },
    { id: 'Emotional', label: 'Emotional / Sad', desc: 'Touching, slow, meaningful.' },
    { id: 'Educational', label: 'Educational / Fact-Based', desc: 'Clear, concise, explanatory.' },
    { id: 'Documentary', label: 'Mini-Documentary', desc: 'In-depth, structured storytelling.' },
];

const CAPTION_STYLES: { id: CaptionStyle; label: string }[] = [
    { id: 'BOXED', label: 'Boxed (Default)' },
    { id: 'OUTLINE', label: 'Outline (Meme)' },
    { id: 'MINIMAL', label: 'Minimal (Clean)' },
    { id: 'HIGHLIGHT', label: 'Highlight (Pop)' },
];

const StepIndicator = ({ current, target, label, icon: Icon }: { current: ProductionStep, target: ProductionStep, label: string, icon: any }) => {
    const steps: ProductionStep[] = ['INPUT', 'SCRIPT', 'VISUALS', 'AUDIO', 'ASSEMBLY', 'COMPLETE'];
    const cIdx = steps.indexOf(current);
    const tIdx = steps.indexOf(target);
    
    const isActive = current === target;
    const isDone = cIdx > tIdx;
    
    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isActive ? 'bg-gray-800 border border-gray-700' : 'opacity-60'}`}>
            <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-600 text-white' : isDone ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                <Icon size={16} />
            </div>
            <div className="flex-1">
                <div className={`text-xs font-bold ${isActive ? 'text-white' : 'text-gray-400'}`}>{label}</div>
                {isActive && <div className="h-1 w-full bg-gray-700 rounded-full mt-1 overflow-hidden"><div className="h-full bg-indigo-500 animate-pulse w-1/2"></div></div>}
            </div>
            {isDone && <CheckCircle size={14} className="text-green-500" />}
        </div>
    );
};

export const ShortMakerEditor: React.FC<ShortMakerEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const isStorybook = template.mode === 'STORYBOOK';
    const [step, setStep] = useState<ProductionStep>('INPUT');
    const [manifest, setManifest] = useState<ShortMakerManifest | null>(null);
    
    // Input State
    const [idea, setIdea] = useState('');
    const [scriptStyle, setScriptStyle] = useState('Viral Hook');
    const [style, setStyle] = useState(isStorybook ? 'Watercolor Illustration' : 'Cinematic');
    const [seed, setSeed] = useState('');
    
    // Controls
    const [duration, setDuration] = useState<DurationTier>('30s');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(isStorybook ? '16:9' : '9:16');
    const [visualModel, setVisualModel] = useState<VisualModel>('nano_banana');
    
    // Captions State
    const [captionsEnabled, setCaptionsEnabled] = useState(true);
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('BOXED');

    // Audio Settings
    const [selectedVoice, setSelectedVoice] = useState('Fenrir');
    const [bgMusic, setBgMusic] = useState<string | null>(null);
    const [bgMusicName, setBgMusicName] = useState<string>('');
    
    // Preview State
    const [playingVoicePreview, setPlayingVoicePreview] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    // Progress & Failsafes
    const [logs, setLogs] = useState<string[]>([]);
    const [completedImages, setCompletedImages] = useState<number>(0);
    const [totalVisualsToGen, setTotalVisualsToGen] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [hasDraft, setHasDraft] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Helper for safe scenes access
    const safeScenes = manifest?.scenes || [];

    // --- EFFECT: Reset Aspect Ratio on Template Change ---
    useEffect(() => {
        setAspectRatio(template.mode === 'STORYBOOK' ? '16:9' : '9:16');
        setStyle(template.mode === 'STORYBOOK' ? 'Watercolor Illustration' : 'Cinematic');
    }, [template.mode]);

    // --- EFFECT: SYNC WITH JOB STORE ---
    useEffect(() => {
        // 1. Initial State Load from Background Store
        if (jobStore.status !== 'IDLE' && jobStore.status !== 'COMPLETED' && jobStore.status !== 'FAILED') {
            console.log("Found active background job, restoring state...");
            setIsProcessing(true);
            setManifest(jobStore.manifest);
            setLogs(jobStore.logs);
            setStep(mapStatusToStep(jobStore.status));
            setCompletedImages(jobStore.completedImages);
            setTotalVisualsToGen(jobStore.totalImages);
        } else {
            // Check LocalStorage Draft if no active memory job
            try {
                const savedDraft = localStorage.getItem('shortmaker_draft');
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && parsed.manifest) setHasDraft(true);
                }
            } catch (e) {
                console.warn("Failed to check draft:", e);
                localStorage.removeItem('shortmaker_draft');
            }
        }

        // 2. Subscribe to updates
        const unsubscribe = jobStore.subscribe(() => {
            setManifest(jobStore.manifest);
            setLogs([...jobStore.logs]); // Spread to force react update
            setCompletedImages(jobStore.completedImages);
            setTotalVisualsToGen(jobStore.totalImages);
            
            if (jobStore.status === 'FAILED') {
                setIsProcessing(false);
                setErrorMsg(jobStore.error || "Unknown Error");
            } else {
                setStep(mapStatusToStep(jobStore.status));
                if (jobStore.videoUrl) setVideoUrl(jobStore.videoUrl);
            }
        });

        return () => unsubscribe();
    }, []);

    const mapStatusToStep = (status: string): ProductionStep => {
        if (status === 'SCRIPTING') return 'SCRIPT';
        if (status === 'VISUALIZING') return 'VISUALS';
        if (status === 'NARRATING') return 'AUDIO';
        if (status === 'ASSEMBLING') return 'ASSEMBLY';
        if (status === 'COMPLETED') return 'COMPLETE';
        return 'INPUT';
    };

    // Auto-save draft on manifest change - CRASH FIX: Strip images to avoid QuotaExceededError
    useEffect(() => {
        if (manifest) {
            try {
                // Create a lightweight version of the manifest for saving
                const lightweightManifest = {
                    ...manifest,
                    scenes: manifest.scenes.map(s => ({
                        ...s,
                        generated_image_url: undefined // Don't save base64 images to local storage
                    })),
                    generated_audio_url: undefined, // Don't save heavy audio blobs
                };

                localStorage.setItem('shortmaker_draft', JSON.stringify({
                    manifest: lightweightManifest,
                    step: step === 'COMPLETE' ? 'INPUT' : step, // Reset to input if completed
                    duration,
                    idea,
                    videoUrl: null // Don't save video blob
                }));
            } catch (e) {
                console.warn("Failed to save draft to localStorage (likely quota exceeded). Ignoring.", e);
            }
        }
    }, [manifest, step, duration, idea]);

    // Cost Calc
    const getCost = (d: DurationTier) => {
        switch(d) {
            case '15s': return 5;
            case '30s': return 9;
            case '60s': return 16;
            case '5m': return 60;
            case '10m': return 100;
            case '20m': return 180;
            default: return 9;
        }
    };
    const COST = getCost(duration);

    useEffect(() => {
        return () => {
            if (previewAudioRef.current) previewAudioRef.current.pause();
        };
    }, []);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
        jobStore.addLog(msg);
        if (scrollRef.current) {
            setTimeout(() => {
                if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }, 50);
        }
    };

    const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 15 * 1024 * 1024) {
                alert("File too large. Please upload an MP3 under 15MB.");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setBgMusic(reader.result as string);
                setBgMusicName(file.name);
            };
            reader.readAsDataURL(file);
        }
    };

    const playVoicePreview = async (e: React.MouseEvent, voiceId: string) => {
        e.stopPropagation();
        
        if (playingVoicePreview === voiceId) {
            previewAudioRef.current?.pause();
            setPlayingVoicePreview(null);
            return;
        }

        if (previewAudioRef.current) previewAudioRef.current.pause();
        setPlayingVoicePreview(voiceId);

        try {
            const previewText = "Hello creator, this is a preview of my voice.";
            const url = await generateSpeech(previewText, voiceId);
            
            const audio = new Audio(url);
            previewAudioRef.current = audio;
            audio.onended = () => setPlayingVoicePreview(null);
            audio.onerror = () => setPlayingVoicePreview(null);
            audio.play();
        } catch (e: any) {
            console.error("Preview failed", e);
            setPlayingVoicePreview(null);
            alert(e.message || "Failed to preview voice.");
        }
    };

    const restoreDraft = () => {
        try {
            const savedDraft = localStorage.getItem('shortmaker_draft');
            if (savedDraft) {
                const data = JSON.parse(savedDraft);
                if (data.manifest) {
                    setManifest(data.manifest);
                    const needsRegen = data.manifest.scenes.some((s: any) => !s.generated_image_url);
                    if (needsRegen) {
                        setStep('SCRIPT'); 
                        addLog("📂 Draft restored. Visuals need regeneration (images are not saved in drafts).");
                    } else {
                        addLog("📂 Draft restored.");
                    }
                }
                if (data.duration) setDuration(data.duration);
                if (data.idea) setIdea(data.idea);
            }
        } catch (e) {
            console.error("Failed to restore draft", e);
            alert("Corrupted draft found and cleared.");
            localStorage.removeItem('shortmaker_draft');
            setHasDraft(false);
        }
    };

    const clearDraft = () => {
        if(confirm("Are you sure? This will delete your current progress.")) {
            jobStore.reset();
            localStorage.removeItem('shortmaker_draft');
            setManifest(null);
            setStep('INPUT');
            setVideoUrl(null);
            setLogs([]);
            setHasDraft(false);
        }
    };

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const generateImageWithRetry = async (
        scene: any, 
        globalSeed: string, 
        style: string, 
        aspectRatio: string, 
        model: VisualModel
    ) => {
        let url = '';
        let attempts = 0;
        const maxAttempts = 3;

        while (!url && attempts < maxAttempts) {
            try {
                url = await generateSceneImage(scene, globalSeed, style, aspectRatio, model);
            } catch (err: any) {
                if (err.message?.includes('PERMISSION_DENIED') || err.message?.includes('403')) {
                     console.warn(`Permission denied for ${model}, switching to fallback.`);
                     throw new Error('PERMISSION_DENIED');
                }
                attempts++;
                const delay = attempts * 2000;
                console.warn(`Scene ${scene.scene_number} retry ${attempts} (${model})...`);
                await sleep(delay);
            }
        }
        return url;
    };

    const runProduction = async (resume: boolean = false) => {
        if (!idea.trim()) return;
        setIsProcessing(true);
        setErrorMsg('');
        setIsSaved(false);
        
        if (!resume) jobStore.reset();

        let currentVisualModel = visualModel;

        if (!resume) {
            setStep('SCRIPT');
            setLogs([]);
            setCompletedImages(0);
            setManifest(null);
            setVideoUrl(null);
            setTotalVisualsToGen(0);
        } else {
            addLog("🔄 Resuming production...");
        }

        try {
            // STEP 1: SCRIPT
            let currentManifest: ShortMakerManifest | null = resume ? manifest : null;

            if (!currentManifest) {
                setStep('SCRIPT');
                const isLongForm = ['5m', '10m', '20m'].includes(duration);
                addLog(`🧠 Dreaming up ${scriptStyle} story (${duration})... ${isLongForm ? '(Long-form mode active)' : ''}`);
                
                currentManifest = await generateStory({
                    idea,
                    seed: seed || undefined,
                    style_tone: style,
                    mode: template.mode,
                    durationTier: duration,
                    aspectRatio: aspectRatio,
                    voice_preference: { voice: selectedVoice },
                    scriptStyle: scriptStyle
                });
                
                // Set default caption settings based on UI selection
                currentManifest.output_settings.captions = {
                    enabled: captionsEnabled,
                    style: captionStyle
                };
                
                setManifest(currentManifest);
                addLog(`✅ Script ready: "${currentManifest.title}" with ${currentManifest.scenes.length} scenes.`);
            }

            if (!currentManifest) throw new Error("Failed to initialize story.");

            // STEP 2: VISUALS
            setStep('VISUALS');
            jobStore.update({ status: 'VISUALIZING' });
            
            const workingScenes = [...currentManifest.scenes];
            const generationSeed = currentManifest.seed || Math.random().toString();
            
            // Failsafe: Filter out already generated scenes
            const missingScenes = workingScenes.filter(s => !s.generated_image_url || s.generated_image_url.includes('placeholder'));
            
            jobStore.update({ 
                manifest: currentManifest, 
                totalImages: workingScenes.length,
                completedImages: workingScenes.length - missingScenes.length 
            });
            
            setTotalVisualsToGen(workingScenes.length);
            setCompletedImages(workingScenes.length - missingScenes.length);

            if (missingScenes.length > 0) {
                addLog(`🎨 Generating visuals (${missingScenes.length} remaining)...`);
                
                const BATCH_SIZE = 2;
                for (let i = 0; i < missingScenes.length; i += BATCH_SIZE) {
                    const batch = missingScenes.slice(i, i + BATCH_SIZE);
                    
                    await Promise.all(batch.map(async (scene) => {
                        const idx = workingScenes.findIndex(s => s.scene_number === scene.scene_number);
                        if (idx === -1) return; 

                        let url = '';
                        try {
                            url = await generateImageWithRetry(scene, generationSeed, style, aspectRatio, currentVisualModel);
                        } catch (err: any) {
                             if (err.message === 'PERMISSION_DENIED') {
                                 if (currentVisualModel !== 'flux') {
                                    addLog(`⚠️ Permissions issue. Switching to Flux for subsequent images.`);
                                    currentVisualModel = 'flux';
                                 }
                                 // Immediate retry with Flux for this scene to save time
                                 try {
                                     url = await generateSceneImage(scene, generationSeed, style, aspectRatio, 'flux');
                                 } catch(e) {}
                             }
                        }

                        if (url) {
                            workingScenes[idx].generated_image_url = url;
                        } 
                        // If failed, we leave as null/undefined to catch in the Rescue Phase
                        
                        // Update Store incrementally
                        const currentCount = workingScenes.filter(s => !!s.generated_image_url && !s.generated_image_url.includes('placeholder')).length;
                        jobStore.update({
                            manifest: { ...currentManifest!, scenes: [...workingScenes] },
                            completedImages: currentCount
                        });
                    }));
                    
                    if (i + BATCH_SIZE < missingScenes.length) {
                        await sleep(1000); 
                    }
                }
            }

            // --- RESCUE PHASE ---
            const failedScenes = workingScenes.filter(s => !s.generated_image_url);
            if (failedScenes.length > 0) {
                addLog(`⚠️ ${failedScenes.length} scenes missed in first pass. Entering rescue mode...`);
                
                for (const scene of failedScenes) {
                    const idx = workingScenes.findIndex(s => s.scene_number === scene.scene_number);
                    if (idx === -1) continue;

                    addLog(`⛑️ Rescuing Scene ${scene.scene_number} with fallback...`);
                    try {
                        // Force Flux for rescue as it is usually more robust for fallback
                        const url = await generateSceneImage(scene, generationSeed, style, aspectRatio, 'flux');
                        if (url) {
                            workingScenes[idx].generated_image_url = url;
                            addLog(`✅ Scene ${scene.scene_number} rescued.`);
                        } else {
                            throw new Error("Rescue failed");
                        }
                    } catch (e) {
                        console.error(`Rescue failed for scene ${scene.scene_number}`, e);
                        workingScenes[idx].generated_image_url = `https://via.placeholder.com/1080x1920/000000/FFFFFF?text=Scene+${scene.scene_number}+Failed`;
                        addLog(`❌ Scene ${scene.scene_number} permanently failed.`);
                    }
                    
                    jobStore.update({
                        manifest: { ...currentManifest!, scenes: [...workingScenes] },
                        completedImages: workingScenes.filter(s => !!s.generated_image_url).length
                    });
                    
                    await sleep(1500); 
                }
            }
            
            currentManifest = { ...currentManifest, scenes: workingScenes };
            setManifest(currentManifest);
            addLog("✅ Visual generation phase complete.");

            // STEP 3: AUDIO
            setStep('AUDIO');
            let generatedAudioUrl = currentManifest.generated_audio_url || '';

            if (!generatedAudioUrl) {
                addLog(`🎙️ Synthesizing voiceover (${selectedVoice})...`);
                const elevenKey = localStorage.getItem('genavatar_eleven_key');
                try {
                    const audioRes = await synthesizeAudio(
                        currentManifest, 
                        elevenKey || undefined, 
                        selectedVoice 
                    );
                    generatedAudioUrl = audioRes.audioUrl;
                    addLog(`✅ Audio recording complete.`);
                } catch (err) {
                    console.warn(err);
                    addLog("⚠️ Audio issues, attempting fallback...");
                }
                currentManifest = { ...currentManifest, generated_audio_url: generatedAudioUrl };
                
                // Update Store
                jobStore.update({ manifest: currentManifest });
                setManifest(currentManifest);
            }

            // STEP 4: ASSEMBLY
            setStep('ASSEMBLY');
            if (resume && videoUrl) {
                 addLog("⏩ Video already built.");
            } else {
                addLog("🎬 Stitching video... (This may take a while for long videos)");
                
                // Ensure caption settings are up to date from UI if resuming or starting late
                if (!currentManifest.output_settings.captions) {
                    currentManifest.output_settings.captions = {
                        enabled: captionsEnabled,
                        style: captionStyle
                    };
                }

                const finalVideoUrl = await assembleVideo(currentManifest, bgMusic || undefined);
                setVideoUrl(finalVideoUrl);
                jobStore.update({ videoUrl: finalVideoUrl, status: 'COMPLETED' });
                addLog("✅ Production Complete!");
                
                // STEP 5: SAVE
                setStep('COMPLETE');
                addLog("☁️ Saving to cloud...");
                try {
                    const permanentVideoUrl = await uploadToStorage(
                        finalVideoUrl, 
                        `${isStorybook ? 'story' : 'short'}_${Date.now()}.webm`, 
                        'stories'
                    );
                    
                    let thumbUrl = currentManifest.scenes[0]?.generated_image_url;
                    try {
                        if (thumbUrl && thumbUrl.startsWith('data:')) {
                             // Upload thumbnail if it's base64, otherwise keep as is
                             thumbUrl = await uploadToStorage(thumbUrl, `thumb_${Date.now()}.png`, 'thumbnails');
                        }
                    } catch(e) {}

                    await onGenerate({
                        isDirectSave: true,
                        videoUrl: permanentVideoUrl, 
                        thumbnailUrl: thumbUrl,
                        cost: COST,
                        templateName: currentManifest.title || 'Untitled Video',
                        type: isStorybook ? 'STORYBOOK' : 'SHORTS',
                        shouldRedirect: false
                    });
                    setIsSaved(true);
                    jobStore.reset(); // Clear store on successful save
                    localStorage.removeItem('shortmaker_draft');
                    addLog("💾 Saved to My Projects.");
                } catch (saveError: any) {
                    console.error("Save error:", saveError);
                    addLog(`❌ Save failed: ${saveError.message}. Please download manually.`);
                }
            }

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || "Production failed.");
            addLog(`❌ Error: ${e.message}`);
            jobStore.update({ status: 'FAILED', error: e.message });
        } finally {
            setIsProcessing(false);
        }
    };

    const getPreviewClass = () => {
        // Base container styles for the video player
        switch(aspectRatio) {
            case '16:9': return 'w-full aspect-video max-w-2xl';
            case '1:1': return 'w-full aspect-square max-w-md';
            case '4:3': return 'w-full aspect-[4/3] max-w-lg';
            default: return 'w-full aspect-[9/16] max-w-xs'; // 9:16 default
        }
    };

    if (step === 'INPUT') {
        return (
            <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto flex items-center justify-center">
                <div className="max-w-5xl w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    {/* Header */}
                    <div className="text-center mb-8 relative z-10">
                        <div className={`w-14 h-14 bg-gradient-to-br ${isStorybook ? 'from-amber-400 to-orange-600' : 'from-pink-500 to-orange-400'} rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg transform rotate-3`}>
                            {isStorybook ? <BookOpen size={28} className="text-white" /> : <Smartphone size={28} className="text-white" />}
                        </div>
                        <h2 className="text-3xl font-bold mb-1">{isStorybook ? 'Storybook Maker' : 'ShortMaker'}</h2>
                        <p className="text-gray-400 text-sm">Create {isStorybook ? 'illustrated stories' : 'viral shorts'} in seconds.</p>
                        
                        {hasDraft && (
                             <div className="mt-4 flex justify-center gap-3">
                                 <button onClick={restoreDraft} className="bg-indigo-900/50 text-indigo-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-900 border border-indigo-500/30">
                                     <History size={16} /> Resume Draft
                                 </button>
                                 <button onClick={clearDraft} className="text-gray-500 hover:text-red-400 px-3 py-2 text-sm">
                                     <Trash2 size={16} />
                                 </button>
                             </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
                        
                        {/* LEFT COLUMN: Concept & Visuals */}
                        <div className="lg:col-span-7 space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Video Idea</label>
                                <textarea
                                    value={idea}
                                    onChange={(e) => setIdea(e.target.value)}
                                    placeholder={isStorybook ? "A brave toaster goes on an adventure..." : "Top 5 facts about Mars..."}
                                    className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-28 text-base leading-relaxed"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Script Style</label>
                                    <select 
                                        value={scriptStyle}
                                        onChange={(e) => setScriptStyle(e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        {SCRIPT_STYLES.map(s => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Art Style</label>
                                    <select 
                                        value={style}
                                        onChange={(e) => setStyle(e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        <option>Cinematic</option>
                                        <option>Photorealistic</option>
                                        <option>Watercolor Illustration</option>
                                        <option>Anime</option>
                                        <option>3D Disney Style</option>
                                        <option>Cyberpunk</option>
                                        <option>Oil Painting</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Visual Model</label>
                                    <select 
                                        value={visualModel}
                                        onChange={(e) => setVisualModel(e.target.value as VisualModel)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        <option value="nano_banana">Nano Banana (Fast)</option>
                                        <option value="flux">Flux (Creative)</option>
                                        <option value="gemini_pro">Gemini 3 Pro (HD)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Duration</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-gray-700 flex-wrap">
                                        {(['15s', '30s', '60s', '5m', '10m', '20m'] as DurationTier[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setDuration(t)}
                                                className={`flex-1 min-w-[30%] py-1.5 rounded-md text-[10px] font-bold transition-all ${
                                                    duration === t 
                                                    ? 'bg-gray-700 text-white shadow-sm' 
                                                    : 'text-gray-500 hover:text-gray-300'
                                                }`}
                                            >
                                                {t} <span className="opacity-50 font-normal ml-0.5">{getCost(t)}c</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Aspect Ratio</label>
                                <div className="flex gap-3">
                                    {[
                                        { id: '9:16', icon: RectangleVertical, label: 'Portrait' },
                                        { id: '16:9', icon: RectangleHorizontal, label: 'Landscape' },
                                        { id: '1:1', icon: Square, label: 'Square' }
                                    ].map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setAspectRatio(item.id as AspectRatio)}
                                            className={`flex-1 py-2 px-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                                                aspectRatio === item.id
                                                ? 'bg-blue-900/20 border-blue-500 text-blue-200'
                                                : 'bg-black/40 border-gray-700 text-gray-500 hover:bg-gray-800'
                                            }`}
                                        >
                                            <item.icon size={16} />
                                            <span className="text-[10px] font-medium">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Audio & Generate */}
                        <div className="lg:col-span-5 flex flex-col gap-6">
                            
                            {/* Voice Selection Grid */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Voice Actor</label>
                                <div className="grid grid-cols-2 gap-3 h-32 overflow-y-auto pr-1 custom-scrollbar mb-4">
                                    {VOICES.map(voice => (
                                        <div 
                                            key={voice.id}
                                            onClick={() => setSelectedVoice(voice.id)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all relative group flex flex-col justify-between ${
                                                selectedVoice === voice.id 
                                                ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50' 
                                                : 'bg-black/40 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${selectedVoice === voice.id ? 'bg-indigo-400' : 'bg-gray-600'}`} />
                                                    <span className={`text-sm font-bold ${selectedVoice === voice.id ? 'text-white' : 'text-gray-300'}`}>{voice.label}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => playVoicePreview(e, voice.id)}
                                                    className={`p-1.5 rounded-full transition-all ${
                                                        playingVoicePreview === voice.id 
                                                        ? 'bg-indigo-500 text-white' 
                                                        : 'bg-gray-700 text-gray-400 hover:bg-indigo-500 hover:text-white'
                                                    }`}
                                                >
                                                    {playingVoicePreview === voice.id ? <Pause size={10} /> : <Play size={10} />}
                                                </button>
                                            </div>
                                            <div className="text-[10px] text-gray-500 leading-tight">
                                                <span className="block font-semibold text-gray-400 mb-0.5">{voice.tone}</span>
                                                {voice.desc}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Caption Controls */}
                            <div className="p-4 bg-black/40 border border-gray-700 rounded-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                                        <Subtitles size={14} /> Captions
                                    </label>
                                    <div 
                                        className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${captionsEnabled ? 'bg-green-600' : 'bg-gray-600'}`}
                                        onClick={() => setCaptionsEnabled(!captionsEnabled)}
                                    >
                                        <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform ${captionsEnabled ? 'left-6' : 'left-1'}`} />
                                    </div>
                                </div>
                                
                                {captionsEnabled && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {CAPTION_STYLES.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => setCaptionStyle(s.id)}
                                                className={`text-[10px] font-bold py-1.5 px-2 rounded border transition-all ${
                                                    captionStyle === s.id 
                                                    ? 'bg-indigo-600 border-indigo-500 text-white' 
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                                }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Background Music Upload */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Background Music (Optional)</label>
                                <div className={`relative p-4 rounded-xl border border-dashed transition-all ${
                                    bgMusic ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700 bg-black/40 hover:bg-black/60'
                                }`}>
                                    {bgMusic ? (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                                    <Music size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-white truncate max-w-[150px]">{bgMusicName}</div>
                                                    <div className="text-[10px] text-green-400">Ready to mix</div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => { setBgMusic(null); setBgMusicName(''); }}
                                                className="p-1.5 text-gray-500 hover:text-red-400"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer flex flex-col items-center justify-center gap-2 py-2">
                                            <Upload size={20} className="text-gray-500" />
                                            <span className="text-xs font-medium text-gray-400">Click to upload .mp3</span>
                                            <input type="file" accept="audio/mp3,audio/wav" onChange={handleMusicUpload} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* GENERATE BUTTON */}
                            <button
                                onClick={() => runProduction(false)}
                                disabled={!idea.trim() || userCredits < COST}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl mt-auto relative overflow-hidden group ${
                                    !idea.trim() || userCredits < COST
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:scale-[1.02]'
                                }`}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 skew-y-12" />
                                <Wand2 size={20} className={!idea.trim() ? '' : 'animate-pulse'} />
                                <span>Generate Video ({COST} credits)</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ... Rest of the component (preview view) remains largely the same but uses dynamic class for video container
    return (
        <div className="h-full bg-black text-white flex flex-col md:flex-row overflow-hidden">
             {/* Left Progress Panel */}
             <div className="w-full md:w-[320px] bg-gray-900 border-r border-gray-800 flex flex-col z-20 shadow-xl">
                 <div className="p-6 border-b border-gray-800 bg-gray-900">
                     <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isProcessing && !errorMsg ? 'bg-indigo-600 animate-pulse' : errorMsg ? 'bg-red-600' : 'bg-green-600'}`}>
                            {errorMsg ? <AlertCircle /> : isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                        </div>
                        <div>
                            <h2 className="font-bold text-lg leading-tight">{errorMsg ? 'Error' : isProcessing ? 'Creating Magic' : 'Production Done'}</h2>
                            <p className="text-xs text-gray-500">{errorMsg ? 'Stopped' : isProcessing ? 'AI agents working...' : 'Ready to view'}</p>
                        </div>
                     </div>
                 </div>

                 <div className="flex-1 p-4 overflow-y-auto space-y-2 custom-scrollbar">
                     <StepIndicator current={step} target="SCRIPT" label="Writing Script" icon={Edit2} />
                     <StepIndicator current={step} target="VISUALS" label={`Generating Visuals (${completedImages}/${totalVisualsToGen})`} icon={ImageIcon} />
                     <StepIndicator current={step} target="AUDIO" label="Synthesizing Voice" icon={Mic} />
                     <StepIndicator current={step} target="ASSEMBLY" label="Stitching Video" icon={Film} />
                     
                     <div className="my-4 border-t border-gray-800" />
                     
                     <div className="space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className="text-[10px] font-mono text-gray-400 break-words leading-tight py-0.5 border-l-2 border-gray-700 pl-2">
                                {log}
                            </div>
                        ))}
                        <div ref={scrollRef} />
                     </div>
                 </div>

                 <div className="p-4 bg-gray-800 border-t border-gray-700">
                     <button onClick={onBack} disabled={isProcessing && !errorMsg} className="w-full py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm font-bold disabled:opacity-50">
                         Cancel / Back
                     </button>
                 </div>
             </div>

             {/* Right Preview Panel - Fixed Padding */}
             <div className="flex-1 bg-black relative p-0 overflow-hidden">
                 {/* Background Grid */}
                 <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                 <div className="h-full w-full overflow-y-auto pt-4 pb-32 px-8 flex flex-col items-center"> 
                     {videoUrl ? (
                         <div className={`relative z-10 mx-auto animate-in zoom-in duration-500 mt-10 ${getPreviewClass()}`}>
                             <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-gray-900 group">
                                 <video 
                                    src={videoUrl} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="w-full h-full object-contain bg-black" 
                                 />
                             </div>
                             
                             <div className="mt-6 flex flex-col gap-3 w-full">
                                 <a 
                                    href={videoUrl} 
                                    download="short_video.webm" 
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/25 transition-all"
                                 >
                                     <Download size={18} /> Download Video
                                 </a>
                                 <div className="flex gap-3">
                                     <button onClick={() => runProduction(true)} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm border border-gray-700">
                                         Regenerate
                                     </button>
                                     <button onClick={onBack} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm border border-gray-700">
                                         Start New
                                     </button>
                                 </div>
                                 {isSaved && <p className="text-center text-green-500 text-xs font-bold mt-1">Saved to My Projects</p>}
                             </div>
                         </div>
                     ) : errorMsg ? (
                         <div className="h-full flex items-center justify-center text-center max-w-md mx-auto">
                             <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl animate-in zoom-in duration-300">
                                 <AlertCircle className="text-red-500 mx-auto mb-3" size={40} />
                                 <h3 className="text-xl font-bold text-red-100 mb-2">Production Paused</h3>
                                 <p className="text-red-300 text-sm mb-6">{errorMsg}</p>
                                 <div className="flex gap-3 justify-center">
                                    <button onClick={() => runProduction(true)} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm">
                                        Retry
                                    </button>
                                    <button onClick={onBack} className="px-6 py-2 border border-red-500/30 text-red-200 rounded-lg font-bold text-sm hover:bg-red-900/20">
                                        Cancel
                                    </button>
                                 </div>
                             </div>
                         </div>
                     ) : manifest ? (
                        // Live Production View
                        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-500">
                            <div className="text-center mb-4">
                                <h2 className="text-2xl font-bold text-white mb-2">{manifest.title || "Untitled Story"}</h2>
                                <p className="text-gray-400 text-sm max-w-2xl mx-auto italic">"{manifest.final_caption || 'Generating content...'}"</p>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {safeScenes.map((scene, idx) => (
                                    <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                                        <div className="aspect-[9/16] bg-gray-800 relative">
                                            {scene?.generated_image_url ? (
                                                <img src={scene.generated_image_url} className="w-full h-full object-cover animate-in fade-in duration-500" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2 text-center">
                                                    {idx < completedImages ? (
                                                        <Loader2 className="animate-spin text-gray-600" />
                                                    ) : (
                                                        <span className="text-xs text-gray-600 font-mono">Prompting...</span>
                                                    )}
                                                    <span className="text-[10px] text-gray-500 leading-tight line-clamp-3 px-2">{scene?.image_prompt || `Generating Scene ${idx + 1}...`}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-bold border border-white/10">{scene?.scene_number || idx + 1}</div>
                                        </div>
                                        <div className="p-3 text-[10px] text-gray-400 leading-tight h-16 overflow-y-auto border-t border-gray-800">
                                            {scene?.narration_text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     ) : (
                         <div className="h-full flex items-center justify-center text-center max-w-md mx-auto">
                             <div className="animate-pulse flex flex-col items-center">
                                 <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6 border-4 border-gray-700 border-t-indigo-500 animate-spin">
                                     <Sparkles className="text-indigo-400" size={32} />
                                 </div>
                                 <h3 className="text-2xl font-bold text-white mb-2">Initializing Studio...</h3>
                                 <p className="text-gray-400">Please wait while we set up your creative environment.</p>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
        </div>
    );
};