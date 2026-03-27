
import { invokeGemini } from "./geminiService";

export interface StockAsset {
    id: string;
    thumbUrl: string;
    fullUrl: string;
    type: 'image' | 'video';
    author: string;
}

const PEXELS_API_KEY = '23HqtNYUhkYQG9KLTfut3mxDwvgYV7EmDfbRGhoMWkhrnPtbsv8pCTLF';

export const searchPexels = async (query: string, type: 'image' | 'video' = 'image'): Promise<StockAsset[]> => {
    let endpoint = "";
    if (type === 'video') {
        endpoint = query
            ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=20`
            : `https://api.pexels.com/videos/popular?per_page=20`;
    } else {
        endpoint = query
            ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`
            : `https://api.pexels.com/v1/curated?per_page=20`;
    }

    try {
        // Use the proxy to avoid CORS and hide the API call headers
        const result = await invokeGemini('proxy-webhook', {
            url: endpoint,
            method: 'GET',
            headers: {
                Authorization: PEXELS_API_KEY
            }
        });

        if (!result || !result.success) {
            throw new Error(`Pexels API Error via Proxy: ${result?.details || 'Unknown Error'}`);
        }

        const data = JSON.parse(result.details);

        if (type === 'video') {
            return (data.videos || []).map((v: any) => {
                // Find a suitable file (prefer HD/SD mp4)
                const file = v.video_files.find((f: any) => f.file_type === 'video/mp4' && f.quality === 'hd') ||
                    v.video_files.find((f: any) => f.file_type === 'video/mp4') ||
                    v.video_files[0];
                return {
                    id: String(v.id),
                    thumbUrl: v.image,
                    fullUrl: file?.link || v.url,
                    type: 'video',
                    author: v.user?.name || 'Unknown'
                };
            });
        } else {
            return (data.photos || []).map((p: any) => ({
                id: String(p.id),
                thumbUrl: p.src.medium,
                fullUrl: p.src.large2x,
                type: 'image',
                author: p.photographer
            }));
        }

    } catch (error) {
        console.error(`Failed to fetch ${type}s from Pexels via proxy:`, error);
        return [];
    }
};

export const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};
