
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Video, Play, Music, Image as ImageIcon, Loader2, Save, Wand2, RefreshCw, BookOpen, Smartphone, CheckCircle, Clock, Film, ChevronRight, AlertCircle, Download, Layout, RectangleHorizontal, RectangleVertical, Square, Edit2, Key, Aperture, Pause, Volume2, Upload, Trash2, Mic, History, ShieldAlert, Subtitles, Move, Images, Lock, Clapperboard, FileText, ChevronDown, Zap, X } from 'lucide-react';
import { ShortMakerManifest, ProjectStatus, Template, APP_COSTS } from '../types';
import { generateStory, generateSceneImage, synthesizeAudio, assembleVideo, jobStore, animateSceneWithVeo, generateSoraVideo } from '../services/shortMakerService';
import { getApiKey, generateSpeech } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';
import { openComicBookWindow } from '../services/exportService';
import { dispatchProjectToWebhook } from '../services/webhookService';
import { getCurrentUser, getUserProfile } from '../services/authService';

interface ShortMakerEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
    initialManifest?: ShortMakerManifest; // Support restoring state
}

type ProductionStep = 'INPUT' | 'SCRIPT' | 'ANCHOR' | 'VISUALS' | 'REVIEW' | 'ANIMATING' | 'AUDIO' | 'ASSEMBLY' | 'COMPLETE';
type DurationTier = '15s' | '30s' | '60s' | '5m' | '10m' | '20m';
type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3';
type VisualModel = 'nano_banana' | 'flux' | 'gemini_pro' | 'veo' | 'sora';
type VisualSource = 'AI' | 'PEXELS';
type CaptionStyle = 'BOXED' | 'OUTLINE' | 'MINIMAL' | 'HIGHLIGHT';
type AnimationStyle = 'ZOOM' | 'PAN' | 'STATIC';

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
    const steps: ProductionStep[] = ['INPUT', 'SCRIPT', 'ANCHOR', 'VISUALS', 'ANIMATING', 'AUDIO', 'ASSEMBLY', 'COMPLETE'];
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

export const ShortMakerEditor: React.FC<ShortMakerEditorProps> = ({ onBack, onGenerate, userCredits, template, initialManifest }) => {
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
    const [visualSource, setVisualSource] = useState<VisualSource>('AI');
    const [pexelsType, setPexelsType] = useState<'image' | 'video'>('image');
    const [visualModel, setVisualModel] = useState<VisualModel>(isStorybook ? 'veo' : 'nano_banana');
    const [animationStyle, setAnimationStyle] = useState<AnimationStyle>('ZOOM');

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

    // Webhook State
    const [isWebhookSending, setIsWebhookSending] = useState(false);
    const [webhookSent, setWebhookSent] = useState(false);

    // Specific loading state for individual retries
    const [retryingSceneId, setRetryingSceneId] = useState<number | null>(null);

    // Export State
    const [videoBlobType, setVideoBlobType] = useState<string>('');
    const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

    // Editing State
    const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
    const [editNarration, setEditNarration] = useState('');
    const [editPrompt, setEditPrompt] = useState('');
    const [isRegeneratingScene, setIsRegeneratingScene] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const safeScenes = manifest?.scenes || [];

    useEffect(() => {
        setAspectRatio(template.mode === 'STORYBOOK' ? '16:9' : '9:16');
        setStyle(template.mode === 'STORYBOOK' ? 'Watercolor Illustration' : 'Cinematic');
        setVisualModel(template.mode === 'STORYBOOK' ? 'veo' : 'nano_banana');
    }, [template.mode]);

    // Check blob type whenever videoUrl changes
    useEffect(() => {
        const checkBlobType = async () => {
            if (videoUrl && videoUrl.startsWith('blob:')) {
                try {
                    const res = await fetch(videoUrl);
                    const blob = await res.blob();
                    setVideoBlobType(blob.type);
                } catch (e) {
                    console.warn("Failed to check blob type", e);
                }
            } else if (videoUrl?.startsWith('data:video/mp4')) {
                setVideoBlobType('video/mp4');
            } else {
                setVideoBlobType('');
            }
        };
        checkBlobType();
    }, [videoUrl]);

    // Restore from Initial Manifest (Edit Mode)
    useEffect(() => {
        if (initialManifest) {
            setManifest(initialManifest);
            setIdea(initialManifest.idea_input || initialManifest.title || '');
            setVideoUrl(initialManifest.generated_video_url || null);
            setStep('COMPLETE'); // Jump to complete to show result
            // Populate basic stats
            const sceneCount = initialManifest.scenes?.length || 0;
            const completed = initialManifest.scenes?.filter(s => !!s.generated_image_url).length || 0;
            setCompletedImages(completed);
            setTotalVisualsToGen(sceneCount);

            // Restore settings if possible (optional)
            if (initialManifest.output_settings?.captions?.style) {
                setCaptionStyle(initialManifest.output_settings.captions.style);
            }
        }
    }, [initialManifest]);

    useEffect(() => {
        if (jobStore.status !== 'IDLE' && jobStore.status !== 'COMPLETED' && jobStore.status !== 'FAILED') {
            setIsProcessing(true);
            setManifest(jobStore.manifest);
            setLogs(jobStore.logs);
            setStep(mapStatusToStep(jobStore.status));
            setCompletedImages(jobStore.completedImages);
            setTotalVisualsToGen(jobStore.totalImages);
        } else {
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

        const unsubscribe = jobStore.subscribe(() => {
            setManifest(jobStore.manifest);
            setLogs([...jobStore.logs]);
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
        if (status === 'REVIEWING') return 'REVIEW';
        if (status === 'ANIMATING') return 'ANIMATING';
        if (status === 'NARRATING') return 'AUDIO';
        if (status === 'ASSEMBLING') return 'ASSEMBLY';
        if (status === 'COMPLETED') return 'COMPLETE';
        return 'INPUT';
    };

    useEffect(() => {
        if (manifest) {
            try {
                const lightweightManifest = {
                    ...manifest,
                    scenes: manifest.scenes.map(s => ({
                        ...s,
                        generated_image_url: undefined,
                        generated_video_url: undefined
                    })),
                    generated_audio_url: undefined,
                };

                localStorage.setItem('shortmaker_draft', JSON.stringify({
                    manifest: lightweightManifest,
                    step: step === 'COMPLETE' ? 'INPUT' : step,
                    duration,
                    idea,
                    videoUrl: null
                }));
            } catch (e) {
                console.warn("Failed to save draft.");
            }
        }
    }, [manifest, step, duration, idea]);

    const getCost = (d: DurationTier) => {
        let base = 9;
        switch (d) {
            case '15s': base = 5; break;
            case '30s': base = 9; break;
            case '60s': base = 16; break;
            case '5m': base = 60; break;
            case '10m': base = 100; break;
            case '20m': base = 180; break;
        }
        if (visualModel === 'veo') base = base * 2;
        if (visualModel === 'sora') base = base * 3; // Sora is more expensive
        return base;
    };
    const COST = getCost(duration);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
        jobStore.addLog(msg);
        if (scrollRef.current) setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
    };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
                        addLog("📂 Draft restored. Visuals need regeneration.");
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
        if (confirm("Are you sure? This will delete your current progress.")) {
            jobStore.reset();
            localStorage.removeItem('shortmaker_draft');
            setManifest(null);
            setStep('INPUT');
            setVideoUrl(null);
            setLogs([]);
            setHasDraft(false);
        }
    };

    const handleStartNew = () => {
        jobStore.reset();
        localStorage.removeItem('shortmaker_draft');
        setManifest(null);
        setStep('INPUT');
        setVideoUrl(null);
        setLogs([]);
        setHasDraft(false);
        onBack();
    };

    const handleSendToWebhook = async () => {
        if (!manifest || !videoUrl) return;

        setIsWebhookSending(true);
        try {
            let webhookUrl = localStorage.getItem('loopgenie_webhook_url') || '';
            let webhookMethod = localStorage.getItem('loopgenie_webhook_method') || 'POST';

            const user = await getCurrentUser();
            if (user) {
                const profile = await getUserProfile(user.id);
                if (profile?.webhook_url) webhookUrl = profile.webhook_url;
                if (profile?.webhook_method) webhookMethod = profile.webhook_method;
            }

            if (!webhookUrl) {
                alert("No Webhook URL configured. Please set one up in the Integrations tab.");
                setIsDownloadMenuOpen(false);
                return;
            }

            const result = await dispatchProjectToWebhook(webhookUrl, manifest, webhookMethod);
            if (result.success) {
                setWebhookSent(true);
                setTimeout(() => setWebhookSent(false), 3000);
                addLog("🚀 Data pushed to Webhook successfully.");
            } else {
                throw new Error(result.error);
            }
        } catch (e: any) {
            console.error("Webhook dispatch failed:", e);
            alert("Webhook Error: " + e.message);
        } finally {
            setIsWebhookSending(false);
            setIsDownloadMenuOpen(false);
        }
    };

    const generateImageWithRetry = async (
        scene: any,
        globalSeed: string,
        style: string,
        aspectRatio: string,
        model: VisualModel,
        source: VisualSource,
        anchorUrl?: string,
        pType: 'image' | 'video' = 'image'
    ) => {
        let result: { url: string; type: 'image' | 'video' } | null = null;
        let attempts = 0;
        const maxAttempts = 2;

        while (!result && attempts < maxAttempts) {
            try {
                result = await generateSceneImage(scene, globalSeed, style, aspectRatio, model, source, anchorUrl, pType);
            } catch (err: any) {
                console.error("Retry wrapper caught error:", err);
                attempts++;
                await sleep(1000);
            }
        }
        return result;
    };

    const handleEditScene = (idx: number) => {
        if (!manifest) return;
        setEditingSceneIndex(idx);
        setEditNarration(manifest.scenes[idx].narration_text || '');
        setEditPrompt(manifest.scenes[idx].image_prompt || '');
    };

    const handleSaveScene = async () => {
        if (!manifest || editingSceneIndex === null) return;

        const updatedScenes = [...manifest.scenes];
        const oldScene = updatedScenes[editingSceneIndex];
        const promptChanged = oldScene.image_prompt !== editPrompt;

        updatedScenes[editingSceneIndex] = {
            ...oldScene,
            narration_text: editNarration,
            image_prompt: editPrompt
        };

        const newManifest = { ...manifest, scenes: updatedScenes };
        setManifest(newManifest);
        jobStore.update({ manifest: newManifest });

        if (promptChanged) {
            setIsRegeneratingScene(true);
            try {
                const result = await generateImageWithRetry(
                    updatedScenes[editingSceneIndex],
                    manifest.seed || Math.random().toString(),
                    style,
                    aspectRatio,
                    visualModel,
                    visualSource,
                    manifest.scenes[0]?.generated_image_url,
                    pexelsType
                );
                if (result) {
                    updatedScenes[editingSceneIndex].generated_image_url = result.url;
                    updatedScenes[editingSceneIndex].media_type = result.type;
                    setManifest({ ...newManifest, scenes: updatedScenes });
                    jobStore.update({ manifest: { ...newManifest, scenes: updatedScenes } });
                }
            } catch (e) {
                console.error("Regeneration failed", e);
            } finally {
                setIsRegeneratingScene(false);
            }
        }
        setEditingSceneIndex(null);
    };

    const retryScene = async (scene: any) => {
        if (!manifest) return;
        const idx = manifest.scenes.findIndex(s => s.scene_number === scene.scene_number);
        if (idx === -1) return;

        setRetryingSceneId(scene.scene_number);
        addLog(`🔄 Retrying Scene ${scene.scene_number}...`);

        try {
            // Determine model - ensure we use the correct one
            const modelToUse = visualModel; // Service now handles fallback internally
            const generationSeed = manifest.seed || Math.random().toString();

            const result = await generateImageWithRetry(
                scene,
                generationSeed,
                style,
                aspectRatio,
                modelToUse,
                visualSource,
                manifest.scenes[0]?.generated_image_url,
                pexelsType
            );

            if (result) {
                const updatedScenes = [...manifest.scenes];
                updatedScenes[idx].generated_image_url = result.url;
                updatedScenes[idx].media_type = result.type;
                const newManifest = { ...manifest, scenes: updatedScenes };

                setManifest(newManifest);
                jobStore.update({ manifest: newManifest });
                addLog(`✅ Scene ${scene.scene_number} regenerated successfully.`);
            } else {
                addLog(`❌ Retry failed for Scene ${scene.scene_number}.`);
                alert(`Failed to regenerate Scene ${scene.scene_number}. Try changing the visual style.`);
            }
        } catch (e: any) {
            console.error(e);
            addLog(`❌ Retry error: ${e.message}`);
        } finally {
            setRetryingSceneId(null);
        }
    };

    const runProduction = async (resume: boolean = false) => {
        if (!idea.trim()) return;
        setIsProcessing(true);
        setErrorMsg('');
        setIsSaved(false);
        if (!resume) jobStore.reset();

        const isVeoMode = visualModel === 'veo';
        const isSoraMode = visualModel === 'sora';
        const modelToUse = visualModel; // Service handles logic based on string

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
                addLog(`🧠 Dreaming up ${scriptStyle} story (${duration})... ${isLongForm ? '(Long-form)' : ''}`);

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

                currentManifest.output_settings.captions = { enabled: captionsEnabled, style: captionStyle };
                currentManifest.output_settings.visual_source = visualSource;
                currentManifest.output_settings.animation = animationStyle;

                setManifest(currentManifest);
                addLog(`✅ Script ready: "${currentManifest.title}" with ${currentManifest.scenes.length} scenes.`);
            }

            if (!currentManifest) throw new Error("Failed to initialize story.");

            // STEP 2: CONSISTENCY ANCHOR
            const workingScenes = [...currentManifest.scenes];
            const generationSeed = currentManifest.seed || Math.random().toString();
            let anchorUrl = workingScenes[0]?.generated_image_url;

            if (visualSource === 'AI' && workingScenes.length > 0 && (!anchorUrl)) {
                setStep('ANCHOR');
                addLog("⚓ Establishing character identity (Anchor Scene)...");

                // Generate anchor image - service handles fallback chain (Pro -> Flash -> Flux)
                const result = await generateImageWithRetry(workingScenes[0], generationSeed, style, aspectRatio, modelToUse, 'AI', undefined, pexelsType);

                if (result) {
                    workingScenes[0].generated_image_url = result.url;
                    workingScenes[0].media_type = result.type;
                    jobStore.update({ manifest: { ...currentManifest, scenes: [...workingScenes] }, completedImages: 1 });
                    setManifest({ ...currentManifest, scenes: [...workingScenes] });
                    addLog("👁️ Character Identity Established.");
                } else {
                    console.warn("Anchor generation failed.");
                    // Do not set a placeholder. Let UI show retry state.
                }
            }

            // STEP 3: VISUALS
            setStep('VISUALS');
            jobStore.update({ status: 'VISUALIZING', totalImages: workingScenes.length });

            const missingScenes = workingScenes.filter(s => !s.generated_image_url);
            setTotalVisualsToGen(workingScenes.length);
            setCompletedImages(workingScenes.length - missingScenes.length);

            if (missingScenes.length > 0) {
                addLog(`🎨 Generating ${missingScenes.length} consistent frames...`);
                const BATCH_SIZE = 2;
                for (let i = 0; i < missingScenes.length; i += BATCH_SIZE) {
                    const batch = missingScenes.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (scene) => {
                        const idx = workingScenes.findIndex(s => s.scene_number === scene.scene_number);
                        if (idx === -1) return;

                        let result = await generateImageWithRetry(scene, generationSeed, style, aspectRatio, modelToUse, visualSource, anchorUrl, pexelsType);

                        if (result) {
                            workingScenes[idx].generated_image_url = result.url;
                            workingScenes[idx].media_type = result.type;
                        }

                        jobStore.update({
                            manifest: { ...currentManifest!, scenes: [...workingScenes] },
                            completedImages: workingScenes.filter(s => !!s.generated_image_url).length
                        });
                    }));
                }
            }

            currentManifest = { ...currentManifest, scenes: workingScenes };
            setManifest(currentManifest);

            // NEW: PAUSE FOR REVIEW
            setStep('REVIEW');
            jobStore.update({ status: 'REVIEWING' });
            setIsProcessing(false);
            addLog("🎨 Storyboard ready for review. You can edit scenes or proceed to video generation.");
            return;
        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || "Production failed.");
            addLog(`❌ Error: ${e.message}`);
            jobStore.update({ status: 'FAILED', error: e.message });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFinalize = async () => {
        if (!manifest) return;
        setIsProcessing(true);
        setErrorMsg('');

        const isVeoMode = visualModel === 'veo';
        const isSoraMode = visualModel === 'sora';
        let currentManifest = { ...manifest };
        const workingScenes = [...currentManifest.scenes];

        try {
            // STEP 3.5: VEO / SORA ANIMATION
            if (isVeoMode || isSoraMode) {
                setStep('ANIMATING');
                jobStore.update({ status: 'ANIMATING' });
                addLog(`🎥 ${isSoraMode ? 'Sora 2' : 'Veo 3'}: Converting static frames to video clips...`);

                const scenesToAnimate = workingScenes.filter(s => !s.generated_video_url);
                for (let i = 0; i < scenesToAnimate.length; i++) {
                    const scene = scenesToAnimate[i];
                    addLog(`🎬 Animating Scene ${scene.scene_number} (${i + 1}/${scenesToAnimate.length})...`);
                    try {
                        const motionPrompt = scene.camera_directive || "Cinematic slow motion";
                        let videoUrl = "";

                        if (isSoraMode) {
                            videoUrl = await generateSoraVideo(
                                `${scene.image_prompt} ${motionPrompt}`,
                                scene.generated_image_url!,
                                aspectRatio
                            );
                        } else {
                            // Veo Mode
                            videoUrl = await animateSceneWithVeo(
                                scene.generated_image_url!,
                                motionPrompt,
                                aspectRatio
                            );
                        }

                        const idx = workingScenes.findIndex(s => s.scene_number === scene.scene_number);
                        if (idx !== -1) workingScenes[idx].generated_video_url = videoUrl;

                        jobStore.update({ manifest: { ...currentManifest, scenes: [...workingScenes] } });
                    } catch (e: any) {
                        console.warn(`Animation failed for scene ${scene.scene_number}.`);
                        addLog(`⚠️ I2V failed for scene ${scene.scene_number}.`);
                    }
                }
                currentManifest = { ...currentManifest, scenes: workingScenes };
                setManifest(currentManifest);
            }

            // STEP 4: AUDIO
            setStep('AUDIO');
            const needsAudio = currentManifest.scenes.some(s => !s.generated_audio_url) && !currentManifest.generated_audio_url;
            if (needsAudio) {
                addLog(`🎙️ Synthesizing voiceover (${selectedVoice})...`);
                const elevenKey = localStorage.getItem('genavatar_eleven_key');
                try {
                    const updatedManifest = await synthesizeAudio(currentManifest, elevenKey || undefined, selectedVoice);
                    currentManifest = updatedManifest;
                } catch (err: any) { addLog("⚠️ Audio issues: " + err.message); }
            }
            jobStore.update({ manifest: currentManifest });

            // STEP 5: ASSEMBLY
            setStep('ASSEMBLY');
            addLog("🎬 Stitching final video...");
            const finalVideoUrl = await assembleVideo(currentManifest, bgMusic || undefined);
            setVideoUrl(finalVideoUrl);
            jobStore.update({ videoUrl: finalVideoUrl, status: 'COMPLETED' });

            // Populate manifest with final URL for persistence
            currentManifest = { ...currentManifest, generated_video_url: finalVideoUrl };
            setManifest(currentManifest);

            // STEP 6: SAVE
            setStep('COMPLETE');
            addLog("☁️ Saving to cloud...");
            try {
                const permanentVideoUrl = await uploadToStorage(
                    finalVideoUrl,
                    `${isStorybook ? 'story' : 'short'}_${Date.now()}.mp4`,
                    'stories'
                );

                await onGenerate({
                    isDirectSave: true,
                    videoUrl: permanentVideoUrl,
                    thumbnailUrl: currentManifest.scenes[0]?.generated_image_url,
                    cost: COST,
                    templateName: currentManifest.title || 'Untitled Video',
                    type: isStorybook ? 'STORYBOOK' : 'SHORTS',
                    shouldRedirect: false,
                    manifest: currentManifest // SAVE WORKFLOW
                });
                setIsSaved(true);
                localStorage.removeItem('shortmaker_draft');
                addLog("💾 Saved to My Projects.");
            } catch (saveError: any) {
                console.error("Save error:", saveError);
                addLog(`❌ Save failed: ${saveError.message}. Please download manually.`);
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

    const renderVisualModelSelect = () => (
        <select
            value={visualModel}
            onChange={(e) => setVisualModel(e.target.value as VisualModel)}
            className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
        >
            <option value="nano_banana">Nano Banana (Fast)</option>
            <option value="flux">Flux (Creative)</option>
            <option value="gemini_pro">Gemini 3 Pro (HD)</option>
            <option value="veo">Veo 3 (Google)</option>
            <option value="sora">Sora 2 (Kie.ai)</option>
        </select>
    );

    const handleComicExport = () => {
        if (manifest) {
            openComicBookWindow(manifest);
            setIsDownloadMenuOpen(false);
        }
    };

    // Helper to determine download extension and label
    const getVideoDownloadProps = () => {
        const isWebM = videoBlobType.includes('webm');
        const ext = isWebM ? 'webm' : 'mp4';
        return {
            ext,
            label: `Video (${ext.toUpperCase()})`
        };
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
                        {/* LEFT COLUMN */}
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
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Visual Source</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-gray-700">
                                        <button
                                            onClick={() => setVisualSource('AI')}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${visualSource === 'AI' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            Generative AI
                                        </button>
                                        <button
                                            onClick={() => setVisualSource('PEXELS')}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${visualSource === 'PEXELS' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            Stock (Pexels)
                                        </button>
                                    </div>
                                    {visualSource === 'PEXELS' && (
                                        <div className="flex bg-black/40 rounded-lg p-1 border border-gray-700 mt-2">
                                            <button
                                                onClick={() => setPexelsType('image')}
                                                className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${pexelsType === 'image' ? 'bg-indigo-600/30 text-indigo-200' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Images
                                            </button>
                                            <button
                                                onClick={() => setPexelsType('video')}
                                                className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${pexelsType === 'video' ? 'bg-indigo-600/30 text-indigo-200' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Videos
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {visualSource === 'AI' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Visual Model</label>
                                        {renderVisualModelSelect()}
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
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Aspect Ratio</label>
                                    <div className="flex gap-2">
                                        {[
                                            { id: '9:16', icon: RectangleVertical, label: '9:16' },
                                            { id: '16:9', icon: RectangleHorizontal, label: '16:9' },
                                            { id: '1:1', icon: Square, label: '1:1' }
                                        ].map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => setAspectRatio(item.id as AspectRatio)}
                                                className={`flex-1 py-2 px-2 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${aspectRatio === item.id
                                                    ? 'bg-blue-900/20 border-blue-500 text-blue-200'
                                                    : 'bg-black/40 border-gray-700 text-gray-500 hover:bg-gray-800'
                                                    }`}
                                            >
                                                <item.icon size={14} />
                                                <span className="text-[10px] font-medium">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Duration</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-gray-700 flex-wrap">
                                        {(['15s', '30s', '60s', '5m', '10m', '20m'] as DurationTier[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setDuration(t)}
                                                className={`flex-1 min-w-[30%] py-1.5 rounded-md text-[10px] font-bold transition-all ${duration === t
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
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Motion Style</label>
                                <div className="flex gap-2">
                                    {[
                                        { id: 'ZOOM', label: 'Zoom', icon: Move },
                                        { id: 'PAN', label: 'Pan', icon: Move },
                                        { id: 'STATIC', label: 'Static', icon: Square }
                                    ].map((anim) => (
                                        <button
                                            key={anim.id}
                                            onClick={() => setAnimationStyle(anim.id as AnimationStyle)}
                                            className={`flex-1 py-2 px-2 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${animationStyle === anim.id
                                                ? 'bg-purple-900/20 border-purple-500 text-purple-200'
                                                : 'bg-black/40 border-gray-700 text-gray-500 hover:bg-gray-800'
                                                }`}
                                        >
                                            <anim.icon size={14} />
                                            <span className="text-[10px] font-medium">{anim.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="lg:col-span-5 flex flex-col gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Voice Actor</label>
                                <div className="grid grid-cols-2 gap-3 h-32 overflow-y-auto pr-1 custom-scrollbar mb-4">
                                    {VOICES.map(voice => (
                                        <div
                                            key={voice.id}
                                            onClick={() => setSelectedVoice(voice.id)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all relative group flex flex-col justify-between ${selectedVoice === voice.id
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
                                                    className={`p-1.5 rounded-full transition-all ${playingVoicePreview === voice.id
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
                                                className={`text-[10px] font-bold py-1.5 px-2 rounded border transition-all ${captionStyle === s.id
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

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Background Music (Optional)</label>
                                <div className={`relative p-4 rounded-xl border border-dashed transition-all ${bgMusic ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700 bg-black/40 hover:bg-black/60'
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

                            <button
                                onClick={() => runProduction(false)}
                                disabled={!idea.trim() || userCredits < COST}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl mt-auto relative overflow-hidden group ${!idea.trim() || userCredits < COST
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

    return (
        <div className="h-full bg-black text-white flex flex-col md:flex-row overflow-hidden">
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
                    <StepIndicator current={step} target="ANCHOR" label="Establishing Character" icon={Lock} />
                    <StepIndicator current={step} target="VISUALS" label={`Gathering Visuals (${completedImages}/${totalVisualsToGen})`} icon={ImageIcon} />
                    <StepIndicator current={step} target="REVIEW" label="Review & Edit" icon={CheckCircle} />
                    {(visualModel === 'veo' || visualModel === 'sora') && <StepIndicator current={step} target="ANIMATING" label={`Animating (${visualModel === 'sora' ? 'Sora' : 'Veo'})`} icon={Clapperboard} />}
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

            <div className="flex-1 bg-black relative p-0 overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                <div className="h-full w-full overflow-y-auto pt-4 pb-32 px-8 flex flex-col items-center">
                    {videoUrl ? (
                        <div className={`relative z-10 mx-auto animate-in zoom-in duration-500 mt-10 w-full aspect-[9/16] max-w-xs`}>
                            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-gray-900 group">
                                <video
                                    src={videoUrl}
                                    controls
                                    autoPlay
                                    loop
                                    className="w-full h-full object-contain bg-black"
                                />
                            </div>

                            <div className="mt-6 flex flex-col gap-3 w-full relative">
                                <div className="relative">
                                    <button
                                        onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/25 transition-all"
                                    >
                                        <Download size={18} /> Download Options <ChevronDown size={16} />
                                    </button>

                                    {isDownloadMenuOpen && (
                                        <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-30 animate-in slide-in-from-bottom-2 fade-in">
                                            {/* Webhook Option */}
                                            <button
                                                onClick={handleSendToWebhook}
                                                disabled={isWebhookSending}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-white text-sm font-medium transition-colors border-b border-gray-700/50 disabled:opacity-50"
                                            >
                                                {isWebhookSending ? <Loader2 size={16} className="animate-spin text-orange-400" /> : <Zap size={16} className="text-orange-400" fill="currentColor" />}
                                                {webhookSent ? 'Sent to Webhook!' : 'Send to Webhook'}
                                            </button>

                                            {/* MP4 Option */}
                                            <a
                                                href={videoUrl}
                                                download={`video-${Date.now()}.mp4`}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-white text-sm font-medium transition-colors border-b border-gray-700/50"
                                                onClick={() => setIsDownloadMenuOpen(false)}
                                            >
                                                <Film size={16} className="text-blue-400" />
                                                Download as MP4
                                            </a>

                                            {/* WebM Option */}
                                            <a
                                                href={videoUrl}
                                                download={`video-${Date.now()}.webm`}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-white text-sm font-medium transition-colors border-b border-gray-700/50"
                                                onClick={() => setIsDownloadMenuOpen(false)}
                                            >
                                                <Film size={16} className="text-pink-400" />
                                                Download as WebM
                                            </a>

                                            {/* Comic Option */}
                                            <button
                                                onClick={handleComicExport}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 text-white text-sm font-medium transition-colors text-left"
                                            >
                                                <FileText size={16} className="text-orange-400" />
                                                Comic Book PDF
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => runProduction(true)} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm border border-gray-700">
                                        Regenerate
                                    </button>
                                    <button onClick={handleStartNew} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm border border-gray-700">
                                        Start New
                                    </button>
                                </div>
                                {isSaved && <p className="text-center text-green-500 text-xs font-bold mt-1">Saved to My Projects</p>}
                                {webhookSent && <p className="text-center text-orange-500 text-xs font-bold">Successfully Pushed to Webhook</p>}
                            </div>
                        </div>
                    ) : errorMsg ? (
                        <div className="h-full flex items-center justify-center text-center max-w-md mx-auto">
                            <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl animate-in zoom-in duration-300">
                                <AlertCircle className="text-red-500 mx-auto mb-3" size={40} />
                                <h3 className="text-xl font-bold text-red-100 mb-2">Production Paused</h3>
                                <p className="text-red-300 text-sm mb-6">{errorMsg}</p>
                                <div className="flex gap-3 justify-center">
                                    <button onClick={() => step === 'REVIEW' ? handleFinalize() : runProduction(true)} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm">
                                        Retry
                                    </button>
                                    <button onClick={onBack} className="px-6 py-2 border border-red-500/30 text-red-200 rounded-lg font-bold text-sm hover:bg-red-900/20">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : manifest ? (
                        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-500 pt-10 pb-40">
                            {step === 'REVIEW' && (
                                <div className="bg-indigo-600/20 border border-indigo-500/50 p-6 rounded-2xl mb-6 flex items-center justify-between animate-in slide-in-from-top duration-500">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                                            <CheckCircle size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Storyboard Complete</h3>
                                            <p className="text-indigo-200 text-sm">Review your scenes and edit if needed before finalizing the video.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleFinalize}
                                        disabled={isProcessing}
                                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center gap-2 group"
                                    >
                                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} className="group-hover:translate-x-1 transition-transform" />}
                                        Finalize Video
                                    </button>
                                </div>
                            )}

                            <div className="text-center mb-4">
                                <h2 className="text-2xl font-bold text-white mb-2">{manifest.title || "Untitled Story"}</h2>
                                <p className="text-gray-400 text-sm max-w-2xl mx-auto italic">"{manifest.final_caption || 'Generating content...'}"</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {safeScenes.map((scene, idx) => (
                                    <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col group">
                                        <div className="aspect-[9/16] bg-gray-800 relative">
                                            {scene?.generated_image_url ? (
                                                <>
                                                    {scene.media_type === 'video' ? (
                                                        <video
                                                            src={scene.generated_image_url}
                                                            className="w-full h-full object-cover animate-in fade-in duration-500"
                                                            autoPlay
                                                            loop
                                                            muted
                                                            playsInline
                                                        />
                                                    ) : (
                                                        <img src={scene.generated_image_url} className="w-full h-full object-cover animate-in fade-in duration-500" />
                                                    )}
                                                    <a
                                                        href={scene.generated_image_url}
                                                        download={`scene-${scene.scene_number}.png`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="absolute bottom-2 right-2 p-2 bg-black/60 hover:bg-indigo-600 text-white rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all z-20 shadow-lg"
                                                        title="Download Frame"
                                                    >
                                                        <Download size={14} />
                                                    </a>
                                                    {step === 'REVIEW' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditScene(idx); }}
                                                            className="absolute top-2 right-2 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xl transition-all z-20 flex items-center gap-1.5"
                                                            title="Edit Scene"
                                                        >
                                                            <Edit2 size={16} />
                                                            <span className="text-[10px] font-bold">Edit</span>
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-2 p-2 text-center">
                                                    {idx < completedImages || retryingSceneId === scene.scene_number ? (
                                                        <Loader2 className="animate-spin text-gray-600" />
                                                    ) : !isProcessing ? (
                                                        <div className="flex flex-col items-center gap-2 animate-in zoom-in">
                                                            <AlertCircle className="text-red-500" size={24} />
                                                            <span className="text-xs text-red-400 font-bold">Generation Failed</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); retryScene(scene); }}
                                                                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-[10px] text-white font-bold transition-all hover:scale-105"
                                                            >
                                                                Retry Scene
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-600 font-mono">Prompting...</span>
                                                    )}

                                                    {(idx < completedImages || isProcessing) && (
                                                        <span className="text-[10px] text-gray-500 leading-tight line-clamp-3 px-2">{scene?.image_prompt || `Generating Scene ${idx + 1}...`}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-bold border border-white/10">{scene?.scene_number || idx + 1}</div>
                                            {idx === 0 && <div className="absolute top-2 right-2 bg-indigo-600 px-2 py-1 rounded text-[10px] font-bold shadow-lg">ANCHOR</div>}
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

                {/* Scene Editing Modal */}
                {
                    editingSceneIndex !== null && manifest && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingSceneIndex(null)} />
                            <div className="relative bg-gray-900 border border-indigo-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Edit2 size={20} className="text-indigo-400" />
                                        Edit Scene {manifest.scenes[editingSceneIndex].scene_number}
                                    </h3>
                                    <button onClick={() => setEditingSceneIndex(null)} className="p-2 hover:bg-white/10 rounded-full text-gray-400">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-8 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/5 relative group">
                                                <img
                                                    src={manifest.scenes[editingSceneIndex].generated_image_url || 'https://via.placeholder.com/1080x1920/000000/FFFFFF?text=No+Image'}
                                                    className="w-full h-full object-cover"
                                                    alt="Current Scene"
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <p className="text-white text-xs font-medium px-3 py-1 bg-black/60 rounded-full border border-white/10">Current Rendering</p>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Preview</p>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Narration Text</label>
                                                <textarea
                                                    value={editNarration}
                                                    onChange={(e) => setEditNarration(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                                                    placeholder="What should be said in this scene?"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Visual Prompt</label>
                                                <textarea
                                                    value={editPrompt}
                                                    onChange={(e) => setEditPrompt(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                                                    placeholder="Describe how the scene looks..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex gap-4 items-start">
                                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 shrink-0">
                                            <Sparkles size={18} />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-white uppercase tracking-wider">Magical Consistency</p>
                                            <p className="text-xs text-indigo-200/70 leading-relaxed">
                                                Loopgenie automatically appends your character and environment tokens to ensure this scene stays consistent with the rest of your story.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-black/20 border-t border-white/10 flex justify-end gap-3">
                                    <button
                                        onClick={() => setEditingSceneIndex(null)}
                                        className="px-6 py-2.5 text-gray-400 hover:text-white font-bold text-sm transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveScene}
                                        disabled={isProcessing}
                                        className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle size={16} />
                                                Save & Regenerate
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};
