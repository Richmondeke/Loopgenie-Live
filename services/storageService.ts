

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebase';
import { proxyAsset } from './geminiService';

export const uploadToStorage = async (
    blobOrUrl: Blob | string,
    fileName: string,
    folder: string = 'uploads'
): Promise<string> => {
    // If Firebase Storage isn't initialized, we fallback
    if (!storage) {
        console.warn("Firebase Storage not initialized. Returning temporary URL.");
        if (typeof blobOrUrl === 'string') return blobOrUrl;
        return URL.createObjectURL(blobOrUrl);
    }

    try {
        let blobToUpload: Blob;

        // 1. Convert input to Blob if it's a URL
        if (typeof blobOrUrl === 'string') {
            if (blobOrUrl.startsWith('blob:') || blobOrUrl.startsWith('data:')) {
                const res = await fetch(blobOrUrl);
                blobToUpload = await res.blob();
            } else {
                // It's a remote URL. Use proxy to avoid CORS.
                try {
                    const proxiedUrl = await proxyAsset(blobOrUrl);
                    const res = await fetch(proxiedUrl);
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
        const user = auth.currentUser;
        if (!user) {
            throw new Error("User not authenticated for upload");
        }

        const filePath = `${user.uid}/${folder}/${Date.now()}_${fileName}`;

        // Determine content type
        let contentType = 'application/octet-stream';
        if (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || folder === 'stories' || folder === 'videos') {
            contentType = 'video/mp4';
        } else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || folder === 'fashion') {
            contentType = 'image/png';
        }

        // 3. Upload to Firebase Storage
        const storageRef = ref(storage, filePath);
        const metadata = {
            contentType: contentType,
        };

        const uploadResult = await uploadBytes(storageRef, blobToUpload, metadata);

        // 4. Get Download URL
        const publicUrl = await getDownloadURL(uploadResult.ref);

        return publicUrl;

    } catch (error) {
        console.warn("Storage Upload Failed (Returning local fallback):", error);
        if (typeof blobOrUrl === 'string') return blobOrUrl;
        return URL.createObjectURL(blobOrUrl);
    }
};

