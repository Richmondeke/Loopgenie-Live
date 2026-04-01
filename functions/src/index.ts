
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
// import { google } from "googleapis"; // Moved to dynamic import to avoid deployment timeout

// Initialize Admin SDK
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();

// Define Secrets
const geminiApiKey = defineSecret("GEMINI_API");

// YouTube OAuth Configuration
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile'
];

const getOAuth2Client = async (redirectUri?: string) => {
    const { google } = await import("googleapis");
    const clientId = process.env.GOOGLE_CLIENT_ID || "REPLACE_WITH_GOOGLE_CLIENT_ID";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "REPLACE_WITH_GOOGLE_CLIENT_SECRET";
    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri || 'http://localhost:5173/oauth-callback'
    );
};


const cleanJson = (text: string) => {
    if (!text) return "";
    let clean = text.trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(json)?\s*/i, '');
        clean = clean.replace(/\s*```$/, '');
    }
    return clean;
};

// --- GEMINI API (Universal Entry Point) ---
export const geminiApi = onRequest({ secrets: [geminiApiKey], cors: true, invoker: 'public' }, async (req, res) => {
    try {
        const { action, payload } = req.body;
        let apiKey = payload?.apiKey || geminiApiKey.value();
        const kieApiKey = payload?.kieApiKey;

        if (!apiKey && (action !== 'proxy-webhook' && action !== 'generate-sora')) {
            res.status(500).json({ error: 'Missing GEMINI_API secret.' });
            return;
        }

        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey || "");
        let result;

        // ACTION DISPATCHER
        if (action === 'generate-script') {
            const { prompt, systemInstruction } = payload;
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction });
            const response = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            });
            result = JSON.parse(cleanJson(response.response.text()));

        } else if (action === 'generate-story-batch') {
            const { model: modelName, contents, config, systemInstruction: topLevelSysInst } = payload;
            const systemInstruction = topLevelSysInst || config?.systemInstruction;

            // Clean config if systemInstruction was nested
            const cleanConfig = { ...config };
            if (cleanConfig.systemInstruction) delete cleanConfig.systemInstruction;

            const model = genAI.getGenerativeModel({
                model: modelName || "gemini-1.5-flash",
                systemInstruction
            });

            const response = await model.generateContent({
                contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }],
                generationConfig: cleanConfig || {}
            });
            result = { text: cleanJson(response.response.text()) };

        } else if (action === 'analyze-image') {
            const { imageBase64, prompt } = payload;
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const response = await model.generateContent([
                { inlineData: { mimeType: "image/png", data: imageBase64.split(',')[1] || imageBase64 } },
                { text: prompt || "Analyze this image." }
            ]);
            result = { text: response.response.text() };

        } else if (action === 'generate-image') {
            const { prompt, model: modelName, referenceImageBase64 } = payload;
            const model = genAI.getGenerativeModel({ model: modelName || "gemini-pro-vision" });
            const parts: any[] = [{ text: prompt }];
            if (referenceImageBase64) parts.unshift({ inlineData: { mimeType: "image/png", data: referenceImageBase64.split(',')[1] || referenceImageBase64 } });
            const response = await model.generateContent({ contents: [{ role: 'user', parts }] });
            const imageData = response.response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
            if (!imageData) throw new Error("No image generated.");
            result = { imageData: `data:image/png;base64,${imageData}` };

        } else if (action === 'generate-speech') {
            const { text, voiceName } = payload;
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });
            const response = await (model as any).generateContent({
                contents: { parts: [{ text }] },
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } }
                }
            });
            const audioData = response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!audioData) throw new Error('No audio returned');
            result = { audioData };

        } else if (action === 'generate-veo') {
            const { prompt, imageBase64, aspectRatio } = payload;
            const model = genAI.getGenerativeModel({ model: "veo-2-flash-preview" }); // Update to latest available
            const parts: any[] = [{ text: prompt }];
            if (imageBase64) parts.unshift({ inlineData: { mimeType: "image/png", data: imageBase64.split(',')[1] || imageBase64 } });
            const response = await (model as any).generateContent({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseModalities: ["VIDEO"],
                    aspectRatio: aspectRatio || "9:16"
                }
            });
            const videoData = response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!videoData) throw new Error("No video returned from Veo");
            result = { videoData };

        } else if (action === 'generate-sora') {
            const { prompt, imageBase64, aspectRatio } = payload;
            if (!kieApiKey) throw new Error("Missing Kie.ai key");
            const cRes = await fetch('https://api.kie.ai/v1/sora/image-to-video', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${kieApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`, prompt, aspect_ratio: aspectRatio || "9:16" })
            });
            const cData: any = await cRes.json();
            const taskId = cData.id || cData.task_id;
            let videoUrl = null;
            for (let i = 0; i < 24; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const sRes = await fetch(`https://api.kie.ai/v1/tasks/${taskId}`, { headers: { 'Authorization': `Bearer ${kieApiKey}` } });
                const sData: any = await sRes.json();
                if (sData.status === 'succeeded' || sData.status === 'completed') {
                    videoUrl = sData.result?.video_url || sData.output?.video_url || sData.url;
                    break;
                } else if (sData.status === 'failed') throw new Error("Sora failed");
            }
            if (!videoUrl) throw new Error("Sora timeout");
            result = { videoUrl };

        } else if (action === 'proxy-webhook') {
            const { url, data, method = 'POST', headers = {} } = payload;
            if (!url) throw new Error("Missing URL");

            const options: RequestInit = {
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };
            if (method.toUpperCase() !== 'GET') options.body = typeof data === 'string' ? data : JSON.stringify(data);

            const response = await fetch(url, options);
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('image/') || contentType.includes('video/') || contentType.includes('audio/')) {
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                result = {
                    success: response.ok,
                    status: response.status,
                    contentType,
                    details: `data:${contentType};base64,${base64}`
                };
            } else {
                const text = await response.text();
                result = { success: response.ok, status: response.status, contentType, details: text };
            }

        } else if (action === 'get-youtube-auth-url') {
            const { redirectUri } = payload;
            const oauth2Client = await getOAuth2Client(redirectUri);
            const url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                prompt: 'consent'
            });
            result = { url };

        } else if (action === 'handle-youtube-callback') {
            const { code, redirectUri, userId } = payload;
            if (!code || !userId) throw new Error("Missing code or userId");

            const oauth2Client = await getOAuth2Client(redirectUri);
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            const { google } = await import("googleapis");
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const channelRes = await youtube.channels.list({
                part: ['snippet', 'statistics'],
                mine: true
            });

            const channel = channelRes.data.items?.[0];
            if (!channel) throw new Error("No YouTube channel found.");

            const channelData = {
                user_id: userId,
                channelId: channel.id,
                channelName: channel.snippet?.title,
                channelHandle: channel.snippet?.customUrl,
                channelAvatar: channel.snippet?.thumbnails?.default?.url,
                subscriberCount: channel.statistics?.subscriberCount,
                videoCount: channel.statistics?.videoCount,
                viewCount: channel.statistics?.viewCount,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiryDate: tokens.expiry_date,
                connected: true,
                connectedAt: FieldValue.serverTimestamp(),
            };

            const docId = `${userId}_${channel.id}`;
            await db.collection('youtube_accounts').doc(docId).set(channelData, { merge: true });
            result = { success: true, channelName: channel.snippet?.title };

        } else if (action === 'publish-youtube-video') {
            const { userId, channelId, videoUrl, title, description, privacyStatus } = payload;
            if (!userId || !channelId || !videoUrl) throw new Error("Missing required fields");

            const userChannel = await db.collection('youtube_accounts').doc(`${userId}_${channelId}`).get();
            if (!userChannel.exists) throw new Error("YouTube account not found");

            const channelData = userChannel.data()!;
            const oauth2Client = await getOAuth2Client();
            oauth2Client.setCredentials({
                access_token: channelData.accessToken,
                refresh_token: channelData.refreshToken,
                expiry_date: channelData.expiryDate
            });

            // Handle token refresh
            const isTokenExpiring = !channelData.expiryDate || channelData.expiryDate <= (Date.now() + 60000);
            if (isTokenExpiring && channelData.refreshToken) {
                const refreshRes = await oauth2Client.refreshAccessToken();
                const tokens = refreshRes.credentials;
                await userChannel.ref.update({
                    accessToken: tokens.access_token,
                    expiryDate: tokens.expiry_date,
                    refreshToken: tokens.refresh_token || channelData.refreshToken
                });
                oauth2Client.setCredentials(tokens);
            }

            const { google } = await import("googleapis");
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const videoResponse = await fetch(videoUrl);
            const buffer = await videoResponse.arrayBuffer();

            const ytRes = await youtube.videos.insert({
                part: ['snippet', 'status'],
                requestBody: {
                    snippet: {
                        title: title || "Uploaded via LoopGenie",
                        description: description || "",
                        categoryId: '22',
                    },
                    status: {
                        privacyStatus: privacyStatus || 'public',
                        selfDeclaredMadeForKids: false,
                    },
                },
                media: {
                    body: Buffer.from(buffer),
                },
            });
            result = { success: true, videoId: ytRes.data.id };

        } else {
            throw new Error(`Unknown action: ${action}`);
        }

        res.json(result);
    } catch (error: any) {
        logger.error("geminiApi Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- SCHEDULING ---

export const checkScheduledUploads = onSchedule({
    schedule: "every 5 minutes",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (event) => {
    const now = Timestamp.now();
    const snapshot = await db.collection('scheduled_posts')
        .where('status', '==', 'pending')
        .where('scheduledAt', '<=', now)
        .limit(5)
        .get();

    if (snapshot.empty) {
        logger.info("No scheduled uploads to process.");
        return;
    }

    const tasks = snapshot.docs.map(async (doc) => {
        const post = doc.data();
        const postId = doc.id;

        try {
            await doc.ref.update({ status: 'uploading' });

            const userChannel = await db.collection('youtube_accounts').doc(`${post.userId}_${post.channelId}`).get();
            if (!userChannel.exists) {
                throw new Error("Connected YouTube channel not found.");
            }

            const channelData = userChannel.data()!;
            const oauth2Client = await getOAuth2Client();
            oauth2Client.setCredentials({
                access_token: channelData.accessToken,
                refresh_token: channelData.refreshToken,
                expiry_date: channelData.expiryDate
            });

            const isTokenExpiring = !channelData.expiryDate || channelData.expiryDate <= (Date.now() + 60000);
            if (isTokenExpiring && channelData.refreshToken) {
                const refreshRes = await oauth2Client.refreshAccessToken();
                const tokens = refreshRes.credentials;
                await userChannel.ref.update({
                    accessToken: tokens.access_token,
                    expiryDate: tokens.expiry_date,
                    refreshToken: tokens.refresh_token || channelData.refreshToken
                });
                oauth2Client.setCredentials(tokens);
            }

            const { google } = await import("googleapis");
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

            // Download video from Storage or URL
            const response = await fetch(post.videoUrl);
            const buffer = await response.arrayBuffer();

            const res = await youtube.videos.insert({
                part: ['snippet', 'status'],
                requestBody: {
                    snippet: {
                        title: post.title || "Uploaded via LoopGenie",
                        description: post.description || "",
                        categoryId: '22', // People & Blogs
                    },
                    status: {
                        privacyStatus: post.privacyStatus || 'public',
                        selfDeclaredMadeForKids: false,
                    },
                },
                media: {
                    body: Buffer.from(buffer),
                },
            });

            await doc.ref.update({
                status: 'completed',
                youtubeVideoId: res.data.id,
                completedAt: FieldValue.serverTimestamp()
            });

            logger.info(`Successfully uploaded video ${res.data.id} for post ${postId}`);
        } catch (error: any) {
            logger.error(`Failed to upload post ${postId}:`, error);
            await doc.ref.update({
                status: 'failed',
                error: error.message,
                failedAt: FieldValue.serverTimestamp()
            });
        }
    });

    await Promise.all(tasks);
});

