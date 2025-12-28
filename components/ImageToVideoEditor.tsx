
import React, { useState } from 'react';
import { Video, Upload, Image as ImageIcon, Loader2, Download, ChevronRight, Play, Settings } from 'lucide-react';
import { Template } from '../types';
import { stitchVideoFrames } from '../services/ffmpegService';
import { generateVeoVideo, generateSoraVideo } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface ImageToVideoEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

type VideoModel = 'CLIENT' | 'VEO' | 'SORA';

export const ImageToVideoEditor: React.FC<ImageToVideoEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const [image, setImage] = useState<string | null>(null);
    const [duration, setDuration] = useState(5);
    const [isProcessing, setIsProcessing] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [model, setModel] = useState<VideoModel>('CLIENT');
    const [prompt, setPrompt] = useState('');

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        if (!image) return;
        const requiredCredits = model === 'CLIENT' ? 1 : model === 'VEO' ? 5 : 8;
        
        if (userCredits < requiredCredits) {
            alert(`Insufficient credits. Required: ${requiredCredits}`);
            return;
        }

        setIsProcessing(true);
        try {
            let url = "";
            let finalPrompt = prompt || "Animate this image cinematically.";

            if (model === 'CLIENT') {
                // Uses Client-Side Ken Burns Effect
                url = await stitchVideoFrames(
                    [{ imageUrl: image, text: '' }],
                    undefined,
                    duration * 1000,
                    1080, 1920 // Vertical Default
                );
            } else if (model === 'VEO') {
                // Gemini Veo
                url = await generateVeoVideo(finalPrompt, image);
            } else if (model === 'SORA') {
                // Sora 2 (Kie.ai)
                url = await generateSoraVideo(finalPrompt, image);
            }

            setVideoUrl(url);

            const permUrl = await uploadToStorage(url, `img2vid_${Date.now()}.mp4`, 'videos');
            
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: image,
                cost: requiredCredits,
                type: 'IMAGE_TO_VIDEO',
                templateName: `Animated Photo (${model})`,
                shouldRedirect: false
            });

        } catch (e: any) {
            alert("Failed to animate: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="h-full bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col md:flex-row overflow-hidden">
             <div className="w-full md:w-[400px] bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-y-auto">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                    <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors">
                        <ChevronRight className="rotate-180" size={16} /> Back to Studio
                    </button>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Video className="text-indigo-500" /> {template.name}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Bring static images to life.</p>
                </div>

                <div className="p-6 space-y-6 flex-1">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Upload Photo</label>
                        <div className={`relative border-2 border-dashed rounded-2xl h-64 flex flex-col items-center justify-center transition-all ${image ? 'border-indigo-500 bg-black' : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 bg-white dark:bg-gray-800'}`}>
                            {image ? (
                                <img src={image} className="h-full w-full object-contain rounded-xl" />
                            ) : (
                                <label className="cursor-pointer flex flex-col items-center">
                                    <Upload className="text-gray-400 mb-2" />
                                    <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Click to Upload</span>
                                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                                </label>
                            )}
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Animation Model</label>
                        <div className="grid grid-cols-1 gap-2">
                            <button onClick={() => setModel('CLIENT')} className={`text-left p-3 rounded-xl border transition-all ${model === 'CLIENT' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                <div className="font-bold text-sm">Basic Motion (1 Credit)</div>
                                <div className="text-xs opacity-80">Simple zoom/pan effects. Instant.</div>
                            </button>
                            <button onClick={() => setModel('VEO')} className={`text-left p-3 rounded-xl border transition-all ${model === 'VEO' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                <div className="font-bold text-sm">Google Veo 3 (5 Credits)</div>
                                <div className="text-xs opacity-80">Generative AI video. High quality.</div>
                            </button>
                            <button onClick={() => setModel('SORA')} className={`text-left p-3 rounded-xl border transition-all ${model === 'SORA' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                <div className="font-bold text-sm">Sora 2 (8 Credits)</div>
                                <div className="text-xs opacity-80">OpenAI's latest model via Kie.ai. Best quality.</div>
                            </button>
                        </div>
                    </div>

                    {(model === 'VEO' || model === 'SORA') && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Motion Prompt</label>
                            <textarea 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the movement (e.g. 'The water ripples gently', 'The character blinks and smiles')"
                                className="w-full h-24 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            />
                        </div>
                    )}
                    
                    {model === 'CLIENT' && (
                        <div>
                             <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Duration: {duration}s</label>
                             <input 
                                type="range" min="3" max="10" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                                className="w-full accent-indigo-600"
                             />
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button 
                        onClick={handleGenerate}
                        disabled={isProcessing || !image}
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl ${
                            isProcessing || !image
                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-500'
                        }`}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" /> : <Play />} 
                        {isProcessing ? 'Animating...' : 'Animate Photo'}
                    </button>
                </div>
             </div>

             <div className="flex-1 bg-gray-100 dark:bg-black p-8 flex items-center justify-center">
                {videoUrl ? (
                    <div className="w-full max-w-md">
                        <video src={videoUrl} controls autoPlay loop className="w-full rounded-2xl shadow-2xl" />
                        <div className="flex justify-center mt-6">
                            <a href={videoUrl} download={`anim_${Date.now()}.mp4`} className="px-8 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold hover:shadow-lg flex items-center gap-2">
                                <Download size={20} /> Download Video
                            </a>
                        </div>
                    </div>
                ) : (
                     <div className="text-center text-gray-400">
                        <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Upload an image to see the magic.</p>
                     </div>
                )}
             </div>
        </div>
    );
};
