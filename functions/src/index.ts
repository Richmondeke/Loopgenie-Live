
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

const geminiApiKey = defineSecret("GEMINI_API");


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

        } else {
            throw new Error(`Unknown action: ${action}`);
        }

        res.json(result);
    } catch (error: any) {
        logger.error("geminiApi Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- MEDIA API (Deprecated / Alias to geminiApi if needed) ---
export const mediaApi = geminiApi;

// --- PROXY WEBHOOK (Dedicated entry point if called directly) ---
export const proxyWebhook = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
    try {
        const payload = req.body.payload || req.body;
        const { url, data, method = 'POST' } = payload;
        if (!url) { res.status(400).json({ error: "Missing URL" }); return; }

        const options: RequestInit = {
            method: method.toUpperCase(),
            headers: { 'Content-Type': 'application/json' }
        };
        if (method.toUpperCase() !== 'GET') options.body = JSON.stringify(data);

        const response = await fetch(url, options);
        const text = await response.text();
        res.status(response.ok ? 200 : 400).json({ success: response.ok, status: response.status, details: text });
    } catch (error: any) {
        logger.error("proxyWebhook Error:", error);
        res.status(500).json({ error: error.message });
    }
});

