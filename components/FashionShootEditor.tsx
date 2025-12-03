
import React, { useState, useEffect } from 'react';
import { Camera, Upload, Sparkles, Image as ImageIcon, Loader2, Download, RefreshCw, CheckCircle, X, ChevronRight, Layers, Wand2 } from 'lucide-react';
import { Template } from '../types';
import { analyzeProductImage, generateFashionImage } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface FashionShootEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
    isGenerating?: boolean;
}

const STYLES = [
    { id: 'studio', label: 'Studio Minimal', prompt: 'clean studio background, professional fashion photography, soft lighting, minimalist, high fashion, 8k, highly detailed' },
    { id: 'street', label: 'Street Style', prompt: 'urban street style, natural lighting, candid shot, city background, trendy, vogue editorial, 8k' },
    { id: 'luxury', label: 'Luxury / Editorial', prompt: 'luxury fashion editorial, dramatic lighting, rich textures, elegance, vogue cover style, cinematic, 8k' },
    { id: 'nature', label: 'Nature / Bohemian', prompt: 'outdoor nature setting, golden hour sunlight, soft bokeh, bohemian vibe, organic textures, 8k' },
    { id: 'cyber', label: 'Cyberpunk / Neon', prompt: 'neon lighting, cyberpunk aesthetic, futuristic fashion, night city, glowing accents, high contrast, 8k' },
];

export const FashionShootEditor: React.FC<FashionShootEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const isFashionMode = template.mode === 'FASHION_SHOOT';
    const isImgToImg = template.mode === 'IMAGE_TO_IMAGE';
    const isTxtToImg = template.mode === 'TEXT_TO_IMAGE';
    
    // Default Mode Logic based on template type
    const [mode, setMode] = useState<'IMAGINE' | 'UPLOAD'>(
        isImgToImg ? 'UPLOAD' : 'IMAGINE'
    );
    
    const [prompt, setPrompt] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
    const [quantity, setQuantity] = useState<1 | 2 | 4>(1);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [statusText, setStatusText] = useState('');
    const [selectedResults, setSelectedResults] = useState<number[]>([]);

    const COST_PER_IMAGE = 2;
    const totalCost = quantity * COST_PER_IMAGE;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setUploadedImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleRunShoot = async () => {
        if (userCredits < totalCost) {
            alert("Insufficient credits");
            return;
        }
        
        setIsProcessing(true);
        setGeneratedImages([]);
        setSelectedResults([]);
        
        try {
            let baseDescription = prompt;

            // Step 1: Analyze if in Upload mode
            if (mode === 'UPLOAD' && uploadedImage) {
                setStatusText("Analyzing image...");
                const analysis = await analyzeProductImage(uploadedImage);
                baseDescription = `${analysis}. ${prompt}`; // Combine analysis with user notes
            }

            if (!baseDescription.trim() && mode === 'IMAGINE') {
                throw new Error("Please enter a description.");
            }

            // Step 2: Generate Images
            setStatusText(`Generating ${quantity} variations...`);
            
            // If strictly fashion mode, append style prompt. Otherwise rely more on user prompt.
            let fullPrompt = baseDescription;
            if (isFashionMode) {
                const stylePrompt = STYLES.find(s => s.id === selectedStyle)?.prompt || '';
                fullPrompt = `Fashion photography of ${baseDescription}. ${stylePrompt}`;
            } else {
                // General Mode: Just enhance quality slightly
                fullPrompt = `${baseDescription}, 8k, highly detailed, photorealistic, cinematic lighting`;
            }

            const promises = Array(quantity).fill(0).map(() => generateFashionImage(fullPrompt));
            const results = await Promise.all(promises);

            setGeneratedImages(results.filter(url => !!url));
            setStatusText("Generation complete!");

        } catch (error: any) {
            console.error(error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveSelected = async () => {
        if (selectedResults.length === 0) return;
        
        setIsProcessing(true);
        setStatusText("Saving to Gallery...");

        try {
            const mainImageUrl = generatedImages[selectedResults[0]];
            const permUrl = await uploadToStorage(mainImageUrl, `gen_${Date.now()}.png`, 'fashion');
            
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: permUrl,
                cost: totalCost,
                type: template.mode || 'TEXT_TO_IMAGE',
                templateName: template.name,
                shouldRedirect: true
            });
        } catch (e: any) {
            alert("Failed to save: " + e.message);
            setIsProcessing(false);
        }
    };

    const toggleSelection = (index: number) => {
        if (selectedResults.includes(index)) {
            setSelectedResults(prev => prev.filter(i => i !== index));
        } else {
            setSelectedResults(prev => [...prev, index]);
        }
    };

    // Determine icon based on template type
    const HeaderIcon = isFashionMode ? Camera : isImgToImg ? Layers : Wand2;
    const headerColor = isFashionMode ? 'text-teal-500' : isImgToImg ? 'text-blue-500' : 'text-pink-500';

    return (
        <div className="h-full bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col md:flex-row overflow-hidden">
            {/* LEFT PANEL: Controls */}
            <div className="w-full md:w-[400px] bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-y-auto custom-scrollbar">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                    <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors">
                        <ChevronRight className="rotate-180" size={16} /> Back to Studio
                    </button>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <HeaderIcon className={headerColor} /> 
                        {template.name}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        {isFashionMode ? 'AI-powered professional photography.' : 'Create stunning visuals with AI.'}
                    </p>
                </div>

                <div className="p-6 space-y-8 flex-1">
                    {/* Mode Selection - Only show if the tool supports multiple modes */}
                    {!isImgToImg && !isTxtToImg && (
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Generation Mode</label>
                            <div className="grid grid-cols-2 gap-2 bg-gray-200 dark:bg-gray-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => setMode('IMAGINE')}
                                    className={`py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'IMAGINE' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                >
                                    <Sparkles size={16} /> Text to Image
                                </button>
                                <button 
                                    onClick={() => setMode('UPLOAD')}
                                    className={`py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'UPLOAD' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                >
                                    <Upload size={16} /> Image to Image
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    {mode === 'UPLOAD' ? (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Reference Image</label>
                            <div className={`relative border-2 border-dashed rounded-2xl h-48 flex flex-col items-center justify-center transition-all ${uploadedImage ? 'border-rose-500 bg-gray-900' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-800'}`}>
                                {uploadedImage ? (
                                    <>
                                        <img src={uploadedImage} alt="Upload" className="h-full w-full object-contain rounded-2xl opacity-60" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <button onClick={() => setUploadedImage(null)} className="bg-black/70 hover:bg-black text-white p-2 rounded-full backdrop-blur-sm">
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <label className="cursor-pointer flex flex-col items-center p-4 text-center w-full h-full justify-center">
                                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3 text-gray-400">
                                            <ImageIcon size={24} />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Click to upload</span>
                                        <span className="text-xs text-gray-400 mt-1">Supported: JPG, PNG</span>
                                        <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                                    </label>
                                )}
                            </div>
                            <div className="mt-4">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Instructions / Changes</label>
                                <input 
                                    type="text" 
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="E.g. Make it look like a oil painting..."
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-rose-500 outline-none" 
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">{isFashionMode ? "Describe Outfit" : "Image Prompt"}</label>
                            <textarea 
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={isFashionMode ? "E.g. A futuristic red leather jacket..." : "E.g. A cyberpunk city at night with neon rain..."}
                                className="w-full h-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-rose-500 outline-none resize-none" 
                            />
                        </div>
                    )}

                    {/* Styles - Only show in Fashion Mode */}
                    {isFashionMode && (
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Photography Style</label>
                            <div className="grid grid-cols-1 gap-2">
                                {STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => setSelectedStyle(style.id)}
                                        className={`px-4 py-3 rounded-xl text-left text-sm font-medium border transition-all ${
                                            selectedStyle === style.id 
                                            ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-500 text-rose-700 dark:text-rose-400' 
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-rose-300'
                                        }`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quantity */}
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Variations</label>
                        <div className="flex gap-2">
                            {[1, 2, 4].map(num => (
                                <button
                                    key={num}
                                    onClick={() => setQuantity(num as any)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
                                        quantity === num 
                                        ? 'bg-rose-500 text-white border-rose-500' 
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-400'
                                    }`}
                                >
                                    {num}x
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-center mt-2 text-gray-500">
                            Total Cost: <span className="font-bold text-rose-500">{totalCost} Credits</span>
                        </p>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button 
                        onClick={handleRunShoot}
                        disabled={isProcessing || (!uploadedImage && !prompt) || userCredits < totalCost}
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl ${
                            isProcessing || (!uploadedImage && !prompt) || userCredits < totalCost
                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white hover:scale-[1.02]'
                        }`}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" /> : isFashionMode ? <Camera /> : <Wand2 />} 
                        {isProcessing ? 'Generating...' : isFashionMode ? 'Start Shoot' : 'Generate'}
                    </button>
                </div>
            </div>

            {/* RIGHT PANEL: Results */}
            <div className="flex-1 bg-gray-100 dark:bg-black p-4 md:p-8 overflow-y-auto flex flex-col items-center">
                {generatedImages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 max-w-sm text-center">
                        <div className="w-24 h-24 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mb-6">
                            {isProcessing ? <Loader2 size={40} className="animate-spin text-rose-500" /> : <Layers size={40} />}
                        </div>
                        {isProcessing ? (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Creating Visuals</h3>
                                <p className="text-sm">{statusText}</p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Ready to Create</h3>
                                <p className="text-sm">Configure your settings on the left and click "Generate" to see your results.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="w-full max-w-5xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Results</h3>
                            <div className="flex gap-3">
                                <button 
                                    onClick={handleRunShoot}
                                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-white flex items-center gap-2"
                                >
                                    <RefreshCw size={14} /> Retry
                                </button>
                                <button 
                                    onClick={handleSaveSelected}
                                    disabled={selectedResults.length === 0}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                                        selectedResults.length > 0 
                                        ? 'bg-rose-600 text-white shadow-lg hover:bg-rose-500' 
                                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <Download size={16} /> Save Selected ({selectedResults.length})
                                </button>
                            </div>
                        </div>

                        <div className={`grid gap-6 ${generatedImages.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
                            {generatedImages.map((img, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => toggleSelection(idx)}
                                    className={`relative group cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
                                        selectedResults.includes(idx) 
                                        ? 'ring-4 ring-rose-500 shadow-xl scale-[1.02]' 
                                        : 'hover:shadow-lg hover:scale-[1.01]'
                                    }`}
                                >
                                    <img src={img} alt={`Result ${idx}`} className="w-full h-auto object-cover" />
                                    <div className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${
                                        selectedResults.includes(idx) ? 'bg-rose-500 text-white' : 'bg-white/80 text-gray-400 group-hover:bg-white'
                                    }`}>
                                        <CheckCircle size={20} className={selectedResults.includes(idx) ? 'fill-current' : ''} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
