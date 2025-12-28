
import { supabase, isSupabaseConfigured } from '../supabaseClient';

export const uploadToStorage = async (
    blobOrUrl: Blob | string, 
    fileName: string, 
    folder: string = 'uploads'
): Promise<string> => {
    // If Supabase isn't configured, we just return the original URL (likely a Blob URL or Data URI)
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
                // It's a remote URL. Try to proxy/fetch.
                try {
                    const res = await fetch(blobOrUrl);
                    if (!res.ok) throw new Error("Failed to fetch remote asset");
                    blobToUpload = await res.blob();
                } catch (e) {
                    console.warn("Could not fetch remote URL for storage proxy, saving original link:", e);
                    return blobOrUrl;
                }
            }
        } else {
            blobToUpload = blobOrUrl;
        }

        // 2. Get User ID for secure folder structure
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error("User not authenticated for upload");
        }

        const filePath = `${user.id}/${folder}/${Date.now()}_${fileName}`;
        
        // Determine content type based on extension or folder
        let contentType = 'application/octet-stream';
        if (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || folder === 'stories' || folder === 'videos') {
            contentType = 'video/mp4'; // FORCE MP4 Header
        } else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || folder === 'fashion') {
            contentType = 'image/png';
        }

        // 3. Upload to Supabase
        const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(filePath, blobToUpload, {
                cacheControl: '3600',
                upsert: false,
                contentType: contentType
            });

        if (uploadError) throw uploadError;

        // 4. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('assets')
            .getPublicUrl(filePath);

        return publicUrl;

    } catch (error) {
        console.warn("Storage Upload Failed (Returning local fallback):", error);
        // Fallback: If upload fails (e.g. not logged in), return a local Object URL
        // This ensures the user can still download/view the result in the current session.
        if (typeof blobOrUrl === 'string') return blobOrUrl;
        return URL.createObjectURL(blobOrUrl);
    }
};
