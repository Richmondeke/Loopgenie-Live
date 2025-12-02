
import React, { useState, useRef } from 'react';
import { 
    Upload, FileVideo, Wand2, Play, CheckCircle, 
    Loader2, Download, Database, LayoutTemplate, 
    ScanFace, ArrowRight, RefreshCw, AlertCircle, Link, Globe, Cookie
} from 'lucide-react';
import { Template, APP_COSTS } from '../types';
import { generateVeoVideo, analyzeVideoFrames } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';
import { supabase } from '../supabaseClient';

interface TikTokClonerEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

const MODELS = [
    { id: 'veo-3.1-fast-generate-preview', label: 'Wan 2.5 (Fast)', desc: 'Rapid generation, good motion.' },
    { id: 'veo-3.1-generate-preview', label: 'Gemini 3 Pro', desc: 'High fidelity, detailed textures.' },
    { id: 'veo-3.1-generate-preview', label: 'Sora Turbo (Beta)', desc: 'Experimental motion adherence.' }, // Mapped to Veo for now
];

export const TikTokClonerEditor: React.FC<TikTokClonerEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    // State
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [videoUrlInput, setVideoUrlInput] = useState('');
    const [useCookies, setUseCookies] = useState(true);
    const [isLoadingVideo, setIsLoadingVideo] = useState(false);
    const [tempStoragePath, setTempStoragePath] = useState<string | null>(null);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Analysis Data
    const [extractedFrames, setExtractedFrames] = useState<string[]>([]);
    const [analyzedPrompt, setAnalyzedPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
    
    // Result
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSourceFile(file);
            setTempStoragePath(null); // Local files don't need cloud cleanup
            setExtractedFrames([]);
            setAnalyzedPrompt('');
            setFinalVideoUrl(null);
            setErrorMsg('');
        }
    };

    const handleUrlFetch = async () => {
        if (!videoUrlInput.trim()) return;
        setIsLoadingVideo(true);
        setErrorMsg('');
        setSourceFile(null);
        setTempStoragePath(null);

        try {
            // PROXY FLOW: Browser -> Edge Function -> TikTok -> Supabase Storage -> Browser
            // We invoke 'video-proxy' (you must deploy this function) which returns the path of the saved file
            const { data, error } = await supabase.functions.invoke('video-proxy', {
                body: { 
                    url: videoUrlInput,
                    use_cookies: useCookies 
                }
            });

            if (error) {
                console.warn("Proxy function failed, falling back to direct fetch attempt", error);
                throw new Error("Proxy Service Unavailable: " + error.message);
            }

            if (!data?.filePath) {
                 throw new Error("Proxy did not return a valid file path.");
            }

            const filePath = data.filePath;
            setTempStoragePath(filePath);

            // Download the file from Supabase Storage (now standard CORS applies to our own bucket, which works)
            const { data: blob, error: downError } = await supabase.storage
                .from('assets')
                .download(filePath);

            if (downError) throw downError;
            if (!blob) throw new Error("Empty file downloaded.");

            const file = new File([blob], "downloaded_video.mp4", { type: blob.type || 'video/mp4' });
            setSourceFile(file);
            
            setExtractedFrames([]);
            setAnalyzedPrompt('');
            setFinalVideoUrl(null);

        } catch (e: any) {
            console.error(e);
            let msg = "Failed to download video. Please upload manually.";
            if (e.message.includes('Proxy Service Unavailable')) {
                msg = "Video Proxy Service is not deployed. Please upload the video manually to bypass CORS.";
            } else if (e.message.includes('CORS')) {
                msg = "Browser Security Block (CORS): Please upload the video file manually.";
            }
            setErrorMsg(msg);
        } finally {
            setIsLoadingVideo(false);
        }
    };

    const extractFrames = async (file: File): Promise<string[]> => {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const frames: string[] = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            video.onloadedmetadata = async () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const duration = video.duration;
                
                // Seek points: 10%, 50%, 90%
                const seekPoints = [duration * 0.1, duration * 0.5, duration * 0.9];
                
                try {
                    for (const time of seekPoints) {
                        video.currentTime = time;
                        await new Promise(r => video.onseeked = () => r(true));
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            frames.push(canvas.toDataURL('image/jpeg', 0.7));
                        }
                    }
                    resolve(frames);
                } catch (e) {
                    reject(e);
                } finally {
                    URL.revokeObjectURL(video.src);
                }
            };
            video.onerror = (e) => reject(e);
        });
    };

    const handleAnalyze = async () => {
        if (!sourceFile) return;
        setIsAnalyzing(true);
        setErrorMsg('');

        try {
            // 1. Extract Frames
            const frames = await extractFrames(sourceFile);
            setExtractedFrames(frames);
            
            // CLEANUP: If this was a temp download from Supabase, delete it to free space
            if (tempStoragePath) {
                console.log("Cleaning up temporary storage file:", tempStoragePath);
                supabase.storage.from('assets').remove([tempStoragePath]).then(({ error }) => {
                    if (error) console.warn("Failed to cleanup temp file:", error);
                    else console.log("Temp file cleaned up.");
                });
                setTempStoragePath(null); // Clear ref
            }

            // 2. Send to Gemini
            const prompt = await analyzeVideoFrames(frames);
            setAnalyzedPrompt(prompt);

        } catch (e: any) {
            console.error(e);
            setErrorMsg("Failed to analyze video. Ensure it's a valid format.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerate = async () => {
        if (!analyzedPrompt) return;
        if (userCredits < APP_COSTS.TIKTOK_CLONE) {
            alert("Insufficient credits.");
            return;
        }

        setIsGenerating(true);
        setErrorMsg('');
        setFinalVideoUrl(null);

        try {
            // Call Real API
            const videoUrl = await generateVeoVideo(
                analyzedPrompt,
                { aspectRatio: '9:16' }, // TikTok Ratio
                selectedModel
            );

            setFinalVideoUrl(videoUrl);

            // Save to Project History
            const permUrl = await uploadToStorage(videoUrl, `clone_${Date.now()}.mp4`, 'clones');
            
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: extractedFrames[0], // Use first frame as thumb
                cost: APP_COSTS.TIKTOK_CLONE,
                templateName: 'Viral Clone',
                type: 'TIKTOK_CLONER',
                shouldRedirect: false
            });

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || "Generation failed. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto flex justify-center">
            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* --- LEFT: SOURCE & ANALYSIS --- */}
                <div className="space-y-6">
                    <div className="bg-[#121214] border border-[#27272a] rounded-2xl p-6 shadow-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                                <ScanFace className="text-white" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Source Video</h2>
                                <p className="text-gray-400 text-xs">Enter a URL or upload a video to analyze.</p>
                            </div>
                        </div>

                        {/* URL Input Section */}
                        <div className="mb-6 space-y-3">
                            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                <Globe size={12} /> TikTok / Reels URL
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={videoUrlInput}
                                    onChange={(e) => setVideoUrlInput(e.target.value)}
                                    placeholder="https://www.tiktok.com/@user/video/..."
                                    className="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none"
                                />
                                <button 
                                    onClick={handleUrlFetch}
                                    disabled={isLoadingVideo || !videoUrlInput}
                                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl border border-gray-700 font-bold transition-all disabled:opacity-50"
                                >
                                    {isLoadingVideo ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setUseCookies(!useCookies)}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${useCookies ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>
                                    {useCookies && <CheckCircle size={10} className="text-white" />}
                                </div>
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Cookie size={10} /> Use Cookies / Credentials (Fixes some download blocks)
                                </span>
                            </div>
                        </div>

                        <div className="relative flex items-center justify-center mb-6">
                            <div className="h-px bg-gray-800 w-full absolute"></div>
                            <span className="bg-[#121214] px-3 text-xs text-gray-500 uppercase font-bold relative z-10">OR</span>
                        </div>

                        {/* Upload Zone */}
                        <div 
                            className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-all ${
                                sourceFile ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800'
                            }`}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileUpload} 
                                accept="video/*" 
                                className="hidden" 
                            />
                            {sourceFile ? (
                                <div className="text-center">
                                    <FileVideo size={32} className="text-indigo-400 mx-auto mb-2" />
                                    <div className="text-sm font-bold">{sourceFile.name}</div>
                                    <div className="text-xs text-gray-500">{(sourceFile.size / 1024 / 1024).toFixed(1)} MB</div>
                                    <button className="mt-2 text-xs text-indigo-400 underline">Change File</button>
                                </div>
                            ) : (
                                <>
                                    <Upload size={24} className="text-gray-500 mb-2" />
                                    <div className="text-sm font-bold text-gray-300">Upload Manually</div>
                                    <div className="text-xs text-gray-500">MP4, MOV</div>
                                </>
                            )}
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={handleAnalyze}
                            disabled={!sourceFile || isAnalyzing || isGenerating}
                            className={`w-full mt-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                !sourceFile || isAnalyzing 
                                ? 'bg-[#27272a] text-gray-500' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'
                            }`}
                        >
                            {isAnalyzing ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />}
                            {isAnalyzing ? 'Extracting & Analyzing...' : 'Analyze Style'}
                        </button>
                    </div>

                    {/* Extracted Frames Preview */}
                    {extractedFrames.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 animate-in fade-in duration-500">
                            {extractedFrames.map((frame, i) => (
                                <div key={i} className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden border border-gray-700 relative group">
                                    <img src={frame} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[10px] font-mono">Frame {i+1}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* --- RIGHT: PROMPT & GENERATION --- */}
                <div className="space-y-6">
                    <div className="bg-[#121214] border border-[#27272a] rounded-2xl p-6 shadow-xl h-full flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                                <LayoutTemplate className="text-white" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Clone Settings</h2>
                                <p className="text-gray-400 text-xs">Refine the AI analysis before generating.</p>
                            </div>
                        </div>

                        {/* Model Selector */}
                        <div className="mb-4">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">AI Model</label>
                            <div className="space-y-2">
                                {MODELS.map(m => (
                                    <div 
                                        key={m.id}
                                        onClick={() => setSelectedModel(m.id)}
                                        className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                                            selectedModel === m.id 
                                            ? 'bg-purple-900/20 border-purple-500' 
                                            : 'bg-black border-gray-800 hover:border-gray-700'
                                        }`}
                                    >
                                        <div>
                                            <div className="text-sm font-bold text-gray-200">{m.label}</div>
                                            <div className="text-[10px] text-gray-500">{m.desc}</div>
                                        </div>
                                        {selectedModel === m.id && <CheckCircle size={16} className="text-purple-500" />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Prompt Editor */}
                        <div className="mb-4 flex-1">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Analyzed Prompt</label>
                            <textarea 
                                value={analyzedPrompt}
                                onChange={(e) => setAnalyzedPrompt(e.target.value)}
                                placeholder="Analysis will appear here..."
                                disabled={isAnalyzing}
                                className="w-full h-32 bg-black border border-[#27272a] rounded-xl p-3 text-sm text-gray-300 focus:ring-1 focus:ring-purple-500 outline-none resize-none leading-relaxed"
                            />
                        </div>

                        {/* Error Message */}
                        {errorMsg && (
                            <div className="bg-red-900/20 border border-red-900/50 text-red-200 p-4 rounded-xl text-sm mb-4 flex items-start gap-3">
                                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" /> 
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Final Output */}
                        {finalVideoUrl ? (
                            <div className="space-y-4 animate-in slide-in-from-bottom duration-500">
                                <div className="bg-black rounded-xl overflow-hidden border border-gray-800 relative group aspect-[9/16] max-h-[300px] mx-auto">
                                    <video src={finalVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                                </div>
                                <div className="flex gap-2">
                                    <a 
                                        href={finalVideoUrl} 
                                        download 
                                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Download size={18} /> Download
                                    </a>
                                    <button 
                                        onClick={() => setFinalVideoUrl(null)} 
                                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 rounded-xl"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleGenerate}
                                disabled={!analyzedPrompt || isGenerating}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-auto ${
                                    !analyzedPrompt || isGenerating
                                    ? 'bg-[#27272a] text-gray-500' 
                                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/20'
                                }`}
                            >
                                {isGenerating ? <Loader2 className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                                {isGenerating ? 'Generating Video...' : `Clone Video (${APP_COSTS.TIKTOK_CLONE} Credits)`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
