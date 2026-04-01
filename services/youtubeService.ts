
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const FUNCTIONS_BASE_URL = 'https://loopgenie-5c4cf.cloudfunctions.net';

/**
 * YouTube integration service using Firebase Cloud Functions.
 * Handles server-side OAuth for long-lived tokens and background uploads.
 */
export const getYouTubeAuthUrl = async (redirectUri?: string) => {
    try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/geminiApi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get-youtube-auth-url',
                payload: { redirectUri: redirectUri || `${window.location.origin}/integrations` }
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.url;
    } catch (e) {
        console.error("Failed to get YouTube Auth URL:", e);
        throw e;
    }
};

export const handleYouTubeCallback = async (code: string, userId: string, redirectUri?: string) => {
    try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/geminiApi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'handle-youtube-callback',
                payload: {
                    code,
                    userId,
                    redirectUri: redirectUri || `${window.location.origin}/integrations`
                }
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (e) {
        console.error("YouTube Callback Error:", e);
        throw e;
    }
};

export const uploadToYouTube = async (
    userId: string,
    channelId: string,
    videoUrl: string,
    title: string,
    description: string
) => {
    try {
        const response = await fetch(`${FUNCTIONS_BASE_URL}/geminiApi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'publish-youtube-video',
                payload: {
                    userId,
                    channelId,
                    videoUrl,
                    title,
                    description,
                    privacyStatus: 'public'
                }
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.videoId;
    } catch (e) {
        console.error("Direct Upload Error:", e);
        throw e;
    }
};

export const scheduleVideoUpload = async (data: {
    userId: string;
    channelId: string;
    projectId: string;
    videoUrl: string;
    title: string;
    description: string;
    scheduledAt: Date;
    privacyStatus?: 'public' | 'private' | 'unlisted';
}) => {
    try {
        const docRef = await addDoc(collection(db, 'scheduled_posts'), {
            ...data,
            scheduledAt: data.scheduledAt,
            status: 'pending',
            createdAt: serverTimestamp(),
        });
        return docRef.id;
    } catch (e) {
        console.error("Scheduling Error:", e);
        throw e;
    }
};
