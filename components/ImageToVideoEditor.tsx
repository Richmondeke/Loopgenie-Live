
import React, { useState } from 'react';
import { Video, Upload, Image as ImageIcon, Loader2, Download, ChevronRight, Play } from 'lucide-react';
import { Template } from '../types';
import { stitchVideoFrames } from '../services/ffmpegService';
import { uploadToStorage } from '../services/storageService';

interface ImageToVideoEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

export const ImageToVideoEditor: React.FC<ImageToVideoEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const [image, setImage] = useState<string | null>(null);
    const [duration, setDuration] = useState(5);
    const [isProcessing, setIsProcessing] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

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
        if (userCredits < 1) {
            alert("Insufficient credits");
            return;
        }

        setIsProcessing(true);
        try {
            // Uses Client-Side Ken Burns Effect
            const url = await stitchVideoFrames(
                [{ imageUrl: image, text: '' }],
                undefined,
                duration * 1000,
                1080, 1920 // Vertical Default
            );
            setVideoUrl(url);

            const permUrl = await uploadToStorage(url, `img2vid_${Date.now()}.webm`, 'videos');
            
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: image,
                cost: 1,
                type: 'IMAGE_TO_VIDEO',
                templateName: 'Animated Photo',
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
                         <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Duration: {duration}s</label>
                         <input 
                            type="range" min="3" max="10" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                         />
                    </div>
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
                            <a href={videoUrl} download={`anim_${Date.now()}.webm`} className="px-8 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold hover:shadow-lg flex items-center gap-2">
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
