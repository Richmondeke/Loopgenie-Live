
import React, { useState, useRef } from 'react';
import { 
    Camera, Upload, Sparkles, Image as ImageIcon, Loader2, 
    Download, CheckCircle, RefreshCw, X, ShoppingBag, Layers, 
    ArrowRight, Wand2
} from 'lucide-react';
import { Template, APP_COSTS } from '../types';
import { analyzeProductImage, generateFashionAssets } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface FashionShootEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

const STYLES = [
    { id: 'Minimalist Studio', label: 'Minimalist Studio', desc: 'Clean background, soft shadows, high-end look.', img: 'https://images.unsplash.com/photo-1618331835717-801e976710b2?auto=format&fit=crop&w=300&q=80' },
    { id: 'Streetwear Urban', label: 'Streetwear / Urban', desc: 'Concrete, neon lights, city vibe.', img: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=300&q=80' },
    { id: 'Nature Organic', label: 'Nature / Organic', desc: 'Sunlight, plants, wood textures, outdoors.', img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80' },
    { id: 'Luxury Interior', label: 'Luxury Interior', desc: 'Marble, gold accents, warm lighting.', img: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=300&q=80' },
    { id: 'Neon Cyberpunk', label: 'Neon Cyberpunk', desc: 'Futuristic, vibrant pinks and blues.', img: 'https://images.unsplash.com/photo-1555685812-4b943f3db990?auto=format&fit=crop&w=300&q=80' },
    { id: 'Editorial', label: 'High Fashion Editorial', desc: 'Dramatic lighting, artistic angles.', img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=300&q=80' },
];

export const FashionShootEditor: React.FC<FashionShootEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    // Mode State
    const [mode, setMode] = useState<'IMAGINE' | 'UPLOAD'>('IMAGINE');
    
    // Inputs
    const [productDescription, setProductDescription] = useState('');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
    const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
    const [quantity, setQuantity] = useState<1 | 2 | 4>(1);
    
    // Processing State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [selectedResult, setSelectedResult] = useState<string | null>(null);
    const [savedCount, setSavedCount] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadedFile(file);
            setUploadedPreview(URL.createObjectURL(file));
            setGeneratedImages([]); // Clear previous results
        }
    };

    const cost = quantity * APP_COSTS.FASHION; // 2 credits per image

    const handleGenerate = async () => {
        if (userCredits < cost) {
            alert("Insufficient credits.");
            return;
        }
        
        setIsGenerating(true);
        setGeneratedImages([]);
        setSelectedResult(null);

        try {
            let finalPromptDescription = productDescription;

            // 1. Analyze Uploaded Image (if in Upload mode)
            if (mode === 'UPLOAD' && uploadedFile) {
                setStatusText("Analyzing product details...");
                setIsAnalyzing(true);
                const analysis = await analyzeProductImage(uploadedFile);
                // Combine analysis with user's specific context request
                finalPromptDescription = `Subject: ${analysis}. Context/Setting: ${productDescription || 'A professional product shot'}.`;
                setIsAnalyzing(false);
            } else if (mode === 'IMAGINE') {
                if (!productDescription.trim()) {
                    alert("Please describe your product idea.");
                    setIsGenerating(false);
                    return;
                }
                finalPromptDescription = productDescription;
            }

            // 2. Generate Images
            setStatusText(`Generating ${quantity} variations...`);
            const images = await generateFashionAssets(finalPromptDescription, selectedStyle, quantity);
            
            setGeneratedImages(images);
            if (images.length > 0) setSelectedResult(images[0]);

        } catch (e: any) {
            console.error(e);
            alert("Generation failed: " + e.message);
        } finally {
            setIsGenerating(false);
            setIsAnalyzing(false);
            setStatusText('');
        }
    };

    const handleSaveSelection = async () => {
        if (!selectedResult) return;
        
        try {
            setStatusText("Saving to portfolio...");
            const permUrl = await uploadToStorage(selectedResult, `fashion_${Date.now()}.png`, 'fashion');
            
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl, // Storing image url in videoUrl field for consistency
                thumbnailUrl: permUrl,
                cost: APP_COSTS.FASHION, // Only charge for the one saved (or we deducted upfront, logic depends on app flow)
                templateName: mode === 'UPLOAD' ? 'Virtual Shoot' : 'Fashion Concept',
                type: 'FASHION_SHOOT',
                shouldRedirect: false
            });
            setSavedCount(prev => prev + 1);
            setStatusText("");
            alert("Saved to My Projects!");
        } catch (e: any) {
            alert("Save failed: " + e.message);
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-8 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                            <ArrowRight className="rotate-180" size={24} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Camera className="text-rose-500" /> Fashion Photoshoot
                            </h1>
                            <p className="text-gray-400 text-sm">AI-powered product photography studio.</p>
                        </div>
                    </div>
                    <div className="flex bg-gray-900 p-1 rounded-xl">
                        <button 
                            onClick={() => setMode('IMAGINE')}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${mode === 'IMAGINE' ? 'bg-rose-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Sparkles size={16} /> Imagine Idea
                        </button>
                        <button 
                            onClick={() => setMode('UPLOAD')}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${mode === 'UPLOAD' ? 'bg-rose-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Upload size={16} /> Virtual Shoot
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                    
                    {/* LEFT PANEL: Controls */}
                    <div className="lg:col-span-4 space-y-6 overflow-y-auto custom-scrollbar pr-2 pb-20">
                        
                        {/* INPUT SECTION */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
                                {mode === 'UPLOAD' ? <Layers size={16}/> : <Wand2 size={16}/>}
                                {mode === 'UPLOAD' ? 'Source Product' : 'Product Concept'}
                            </h3>

                            {mode === 'UPLOAD' ? (
                                <div className="space-y-4">
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group ${uploadedFile ? 'border-rose-500/50' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800'}`}
                                    >
                                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                                        {uploadedPreview ? (
                                            <img src={uploadedPreview} alt="Preview" className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <div className="text-center p-4">
                                                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                                    <Upload size={20} className="text-gray-400" />
                                                </div>
                                                <p className="text-sm font-bold text-gray-300">Upload Product Photo</p>
                                                <p className="text-xs text-gray-500 mt-1">Clear background preferred</p>
                                            </div>
                                        )}
                                        {uploadedPreview && (
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white text-sm font-bold">Change Image</span>
                                            </div>
                                        )}
                                    </div>
                                    <textarea
                                        value={productDescription}
                                        onChange={(e) => setProductDescription(e.target.value)}
                                        placeholder="Describe the setting (e.g., 'Sitting on a wooden table in a cafe')..."
                                        className="w-full bg-black border border-gray-700 rounded-xl p-3 text-sm text-white focus:ring-1 focus:ring-rose-500 outline-none resize-none h-24"
                                    />
                                </div>
                            ) : (
                                <textarea
                                    value={productDescription}
                                    onChange={(e) => setProductDescription(e.target.value)}
                                    placeholder="Describe your product idea in detail (e.g., 'A futuristic sneaker with glowing neon soles, floating in zero gravity')..."
                                    className="w-full bg-black border border-gray-700 rounded-xl p-4 text-sm text-white focus:ring-1 focus:ring-rose-500 outline-none resize-none h-48"
                                />
                            )}
                        </div>

                        {/* STYLE SELECTOR */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3 px-1">Choose Aesthetic</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {STYLES.map(s => (
                                    <div 
                                        key={s.id}
                                        onClick={() => setSelectedStyle(s.id)}
                                        className={`relative h-24 rounded-xl overflow-hidden cursor-pointer group transition-all border-2 ${selectedStyle === s.id ? 'border-rose-500 shadow-rose-500/20 shadow-lg scale-[1.02]' : 'border-transparent opacity-70 hover:opacity-100'}`}
                                    >
                                        <img src={s.img} alt={s.label} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex flex-col justify-end">
                                            <span className="text-xs font-bold text-white leading-tight">{s.label}</span>
                                        </div>
                                        {selectedStyle === s.id && <div className="absolute top-2 right-2 bg-rose-500 rounded-full p-1"><CheckCircle size={10} className="text-white"/></div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* QUANTITY */}
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                            <span className="text-sm font-bold text-gray-300">Variations</span>
                            <div className="flex bg-black p-1 rounded-lg">
                                {[1, 2, 4].map(num => (
                                    <button
                                        key={num}
                                        onClick={() => setQuantity(num as 1|2|4)}
                                        className={`w-10 h-8 rounded-md text-xs font-bold transition-all ${quantity === num ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ACTION */}
                        <div className="pt-2">
                            <div className="flex justify-between text-xs text-gray-500 mb-2 px-1">
                                <span>Total Cost</span>
                                <span className={userCredits < cost ? 'text-red-500 font-bold' : 'text-rose-300'}>{cost} Credits</span>
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || (mode === 'UPLOAD' && !uploadedFile)}
                                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                                    isGenerating || (mode === 'UPLOAD' && !uploadedFile)
                                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 hover:shadow-rose-500/25'
                                }`}
                            >
                                {isGenerating ? <Loader2 className="animate-spin" /> : <Camera size={20} />}
                                {isGenerating ? (isAnalyzing ? 'Analyzing...' : 'Developing Photos...') : 'Generate Photoshoot'}
                            </button>
                        </div>
                    </div>

                    {/* RIGHT PANEL: Results */}
                    <div className="lg:col-span-8 flex flex-col h-full bg-[#121214] border border-[#27272a] rounded-3xl overflow-hidden shadow-2xl relative">
                        {statusText && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold z-20 flex items-center gap-2 border border-gray-700">
                                <Loader2 className="animate-spin text-rose-500" size={14} /> {statusText}
                            </div>
                        )}

                        {generatedImages.length > 0 ? (
                            <div className="flex-1 flex flex-col h-full">
                                {/* Main Preview */}
                                <div className="flex-1 bg-black relative flex items-center justify-center p-4 overflow-hidden">
                                    {selectedResult && (
                                        <img src={selectedResult} alt="Result" className="w-full h-full object-contain shadow-2xl rounded-lg" />
                                    )}
                                </div>
                                
                                {/* Thumbnails & Actions */}
                                <div className="h-32 bg-gray-900 border-t border-gray-800 p-4 flex items-center gap-4">
                                    <div className="flex gap-3 overflow-x-auto no-scrollbar flex-1 h-full items-center">
                                        {generatedImages.map((img, idx) => (
                                            <div 
                                                key={idx}
                                                onClick={() => setSelectedResult(img)}
                                                className={`h-20 w-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 relative ${selectedResult === img ? 'border-rose-500 scale-105' : 'border-gray-700 hover:border-gray-500'}`}
                                            >
                                                <img src={img} className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="h-12 w-px bg-gray-700 mx-2"></div>
                                    <div className="flex gap-2">
                                        {selectedResult && (
                                            <>
                                                <a 
                                                    href={selectedResult} 
                                                    download={`fashion_shoot_${Date.now()}.png`} 
                                                    className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-white transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={20} />
                                                </a>
                                                <button 
                                                    onClick={handleSaveSelection}
                                                    className="px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg"
                                                >
                                                    <ShoppingBag size={18} /> Save to Project
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
                                <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                                    <ImageIcon size={48} className="text-gray-600" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-300">No Photos Yet</h3>
                                <p className="text-gray-500 max-w-sm mt-2">Set your style, describe your product, and click Generate to start your virtual photoshoot.</p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};
