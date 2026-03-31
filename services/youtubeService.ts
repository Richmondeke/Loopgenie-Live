
import { YouTubeChannel, YouTubeEpisode } from '../types';

const CLIENT_ID = '793637255587-bkuklfr80enks9qv113l2fsd48h10pug.apps.googleusercontent.com';
const REDIRECT_URI = window.location.origin; // In production, this must match the Google Console redirect URI
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
].join(' ');

/**
 * YouTube integration service using Google API.
 * Note: Pure client-side OAuth has limitations (token expiry).
 * For production, a backend / Firebase Function is recommended to refresh tokens.
 */
export const getYouTubeAuthUrl = () => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'token', // Using Implicit Flow for client-side demo
        scope: SCOPES,
        include_granted_scopes: 'true',
        state: 'youtube_connect'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const getChannelInfo = async (accessToken: string) => {
    try {
        const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const channel = data.items[0];
            return {
                youtubeId: channel.id,
                youtubeHandle: channel.snippet.customUrl || channel.snippet.title,
                name: channel.snippet.title,
                logoUrl: channel.snippet.thumbnails.default.url
            };
        }
        throw new Error("No YouTube channel found for this account.");
    } catch (e) {
        console.error("YouTube Channel Info Error:", e);
        throw e;
    }
};

export const uploadToYouTube = async (accessToken: string, videoUrl: string, title: string, description: string) => {
    try {
        // 1. Fetch the video blob
        const videoResponse = await fetch(videoUrl);
        const videoBlob = await videoResponse.blob();

        // 2. Metadata for the upload
        const metadata = {
            snippet: {
                title: title,
                description: description,
                categoryId: '22' // People & Blogs
            },
            status: {
                privacyStatus: 'private' // Default to private for safety
            }
        };

        // 3. Multipart upload
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('media', videoBlob);

        const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData
        });

        const result = await response.json();
        if (result.id) {
            return result.id; // Return the YouTube Video ID
        }
        throw new Error(result.error?.message || "YouTube upload failed.");
    } catch (e) {
        console.error("YouTube Upload Error:", e);
        throw e;
    }
};
