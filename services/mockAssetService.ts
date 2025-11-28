
export interface StockAsset {
    id: string;
    thumbUrl: string;
    fullUrl: string;
    type: 'image' | 'video';
    author: string;
}

const PEXELS_API_KEY = '23HqtNYUhkYQG9KLTfut3mxDwvgYV7EmDfbRGhoMWkhrnPtbsv8pCTLF';

export const searchPexels = async (query: string): Promise<StockAsset[]> => {
    // If query is empty, fetch curated (popular) photos
    const endpoint = query 
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`
        : `https://api.pexels.com/v1/curated?per_page=20`;
    
    try {
        const res = await fetch(endpoint, {
            headers: {
                Authorization: PEXELS_API_KEY
            }
        });

        if (!res.ok) {
            throw new Error(`Pexels API Error: ${res.statusText}`);
        }

        const data = await res.json();
        
        // Map Pexels response to our StockAsset interface
        return data.photos.map((p: any) => ({
            id: String(p.id),
            thumbUrl: p.src.medium,    // Good for grid display
            fullUrl: p.src.large2x,    // Good for canvas
            type: 'image',
            author: p.photographer
        }));

    } catch (error) {
        console.error("Failed to fetch from Pexels:", error);
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
