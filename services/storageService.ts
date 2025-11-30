
import { supabase, isSupabaseConfigured } from '../supabaseClient';

export const uploadToStorage = async (
    blobOrUrl: Blob | string, 
    fileName: string, 
    folder: string = 'uploads'
): Promise<string> => {
    // If Supabase isn't configured, we just return the original URL (likely a Blob URL or Data URI)
    // Note: Blob URLs will expire on reload, so this is just for local dev fallback.
    if (!isSupabaseConfigured()) {
        console.warn("Supabase Storage not configured. Returning temporary URL.");
        if (typeof blobOrUrl === 'string') return blobOrUrl;
        return URL.createObjectURL(blobOrUrl);
    }

    try {
        let blobToUpload: Blob;

        // 1. Convert input to Blob if it's a URL
        if (typeof blobOrUrl === 'string') {
            if (blobOrUrl.startsWith('blob:')) {
                const res = await fetch(blobOrUrl);
                blobToUpload = await res.blob();
            } else if (blobOrUrl.startsWith('data:')) {
                const res = await fetch(blobOrUrl);
                blobToUpload = await res.blob();
            } else {
                // It's a remote URL (e.g. from Veo). 
                // We can try to fetch it, but CORS might block it.
                // If it's a permanent remote URL, we might just want to return it.
                // But to be safe and own the asset, let's try to proxy/fetch.
                try {
                    const res = await fetch(blobOrUrl);
                    if (!res.ok) throw new Error("Failed to fetch remote asset");
                    blobToUpload = await res.blob();
                } catch (e) {
                    console.warn("Could not fetch remote URL for storage proxy, saving original link:", e);
                    // This is risky if the link expires, but better than crashing if we can't proxy.
                    return blobOrUrl;
                }
            }
        } else {
            blobToUpload = blobOrUrl;
        }

        // 2. Get User ID for secure folder structure
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated for upload");

        const filePath = `${user.id}/${folder}/${Date.now()}_${fileName}`;

        // 3. Upload to Supabase
        const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(filePath, blobToUpload, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // 4. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('assets')
            .getPublicUrl(filePath);

        return publicUrl;

    } catch (error) {
        console.error("Storage Upload Failed:", error);
        // CRITICAL: Re-throw error so the UI knows the upload failed.
        // Returning a temp URL here causes "Project saved" success but the link breaks later.
        throw error;
    }
};
