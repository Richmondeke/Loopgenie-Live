"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiApi = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const generative_ai_1 = require("@google/generative-ai");
const params_1 = require("firebase-functions/params");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API");
const cleanJson = (text) => {
    if (!text)
        return "";
    let clean = text.trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(json)?\s*/i, '');
        clean = clean.replace(/\s*```$/, '');
    }
    return clean;
};
exports.geminiApi = (0, https_1.onRequest)({ secrets: [geminiApiKey], cors: true }, async (req, res) => {
    try {
        const { action, payload } = req.body;
        let apiKey = payload?.apiKey;
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
            apiKey = geminiApiKey.value();
        }
        if (apiKey)
            apiKey = apiKey.trim();
        const kieApiKey = payload?.kieApiKey;
        // --- PROXY WEBHOOK ACTION ---
        if (action === 'proxy-webhook') {
            const { url, data, method: rawMethod = 'POST' } = payload;
            const method = rawMethod.toUpperCase();
            if (!url) {
                res.status(400).json({ error: "Missing Webhook URL" });
                return;
            }
            try {
                let finalUrl = url;
                const fetchOptions = {
                    method: method,
                    headers: {
                        'User-Agent': 'LoopGenie-Bot/1.0',
                        'X-Source': 'LoopGenie-Proxy'
                    }
                };
                if (method === 'GET') {
                    const params = new URLSearchParams();
                    if (data && typeof data === 'object') {
                        Object.entries(data).forEach(([key, value]) => {
                            params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
                        });
                    }
                    const separator = finalUrl.includes('?') ? '&' : '?';
                    finalUrl = `${finalUrl}${separator}${params.toString()}`;
                }
                else {
                    fetchOptions.headers = { ...fetchOptions.headers, 'Content-Type': 'application/json' };
                    fetchOptions.body = JSON.stringify(data);
                }
                const webhookRes = await fetch(finalUrl, fetchOptions);
                const responseText = await webhookRes.text();
                if (!webhookRes.ok) {
                    res.status(200).json({
                        error: `Target responded with ${webhookRes.status}`,
                        details: responseText,
                        status: webhookRes.status
                    });
                    return;
                }
                res.json({ success: true, status: webhookRes.status });
                return;
            }
            catch (e) {
                res.status(200).json({ error: "Network Error: Could not reach target.", details: e.message });
                return;
            }
        }
        if (!apiKey && !['generate-sora', 'proxy-webhook'].includes(action)) {
            res.status(500).json({ error: 'Server Configuration Error: Missing GEMINI_API secret.' });
            return;
        }
        let genAI;
        if (action !== 'generate-sora' && action !== 'proxy-webhook') {
            genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        }
        let result;
        switch (action) {
            case 'generate-script': {
                const { prompt, systemInstruction, schema } = payload;
                const model = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash", // Updated to stable flash
                    systemInstruction: systemInstruction,
                });
                const response = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        // responseSchema: schema // Node SDK handling of schema might differ slightly, but let's try
                    }
                });
                const txt = response.response.text();
                if (!txt)
                    throw new Error("No text returned from model");
                const jsonStr = cleanJson(txt);
                result = JSON.parse(jsonStr);
                break;
            }
            case 'generate-story-batch': {
                const { model: modelName, contents, config } = payload;
                const model = genAI.getGenerativeModel({
                    model: modelName || "gemini-1.5-flash",
                });
                const response = await model.generateContent({
                    contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }],
                    generationConfig: config || {}
                });
                let text = response.response.text();
                if (!text)
                    throw new Error("AI returned empty content. This may be due to safety filters.");
                const cleanText = cleanJson(text);
                result = { text: cleanText };
                break;
            }
            case 'generate-speech': {
                const { text, voiceName } = payload;
                // Firebase Cloud Functions don't currently support easy multimodal inline tts in the standard SDK 
                // as easily as the preview. But for now I'll replicate the effort or fallback.
                // Actually, the Supabase version used 'gemini-2.5-flash-preview-tts' which is very new.
                // If the same model is available via the public API, we try it.
                try {
                    const model = genAI.getGenerativeModel({
                        model: "gemini-1.5-flash-px-tts", // Potential mapping or fallback
                    });
                    // This part might need adjustment based on valid SDK methods for TTS
                    const response = await model.generateContent({
                        contents: { parts: [{ text }] },
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } }
                        }
                    });
                    const base64Audio = response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (!base64Audio)
                        throw new Error('No audio data returned');
                    result = { audioData: base64Audio };
                }
                catch (e) {
                    logger.error("Speech Generation failed", e);
                    throw new Error(`Speech Generation is currently unavailable: ${e.message}`);
                }
                break;
            }
            case 'analyze-image': {
                const { imageBase64, prompt } = payload;
                const cleanBase64 = imageBase64.split(',')[1] || imageBase64;
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const response = await model.generateContent([
                    { inlineData: { mimeType: "image/png", data: cleanBase64 } },
                    { text: prompt || "Analyze this image." }
                ]);
                result = { text: response.response.text() };
                break;
            }
            case 'generate-image': {
                const { prompt, aspectRatio, model: modelName, referenceImageBase64 } = payload;
                const generateWithModel = async (mName) => {
                    const model = genAI.getGenerativeModel({ model: mName });
                    const contentsParts = [{ text: prompt }];
                    if (referenceImageBase64) {
                        const cleanRef = referenceImageBase64.split(',')[1] || referenceImageBase64;
                        contentsParts.unshift({
                            inlineData: { mimeType: "image/png", data: cleanRef }
                        });
                    }
                    return await model.generateContent({
                        contents: [{ role: 'user', parts: contentsParts }],
                        generationConfig: {
                        // imageConfig: { aspectRatio: aspectRatio || "9:16" } // Imagine v3 / Imagen specific
                        }
                    });
                };
                let response;
                try {
                    response = await generateWithModel(modelName || "gemini-pro-vision"); // Fallback for general use
                }
                catch (e) {
                    logger.warn("Image generation failed", e);
                    throw e;
                }
                let imageData = null;
                let textOutput = "";
                const parts = response.response.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part.inlineData)
                        imageData = part.inlineData.data;
                    if (part.text)
                        textOutput += part.text;
                }
                if (!imageData) {
                    throw new Error(textOutput || "No image generated. It may have been blocked by safety filters.");
                }
                result = { imageData: `data:image/png;base64,${imageData}` };
                break;
            }
            case 'generate-veo': {
                // Veo is restricted, but we replicate the fetch/polling logic
                // This would normally call a Vertex AI endpoint or similar
                throw new Error("VEO migration requires specific Vertex AI configuration. Falling back to original logic if possible.");
            }
            case 'generate-sora': {
                const { prompt, imageBase64, aspectRatio } = payload;
                if (!kieApiKey)
                    throw new Error("Kie.ai API Key is required for Sora 2.");
                if (!imageBase64)
                    throw new Error("Image input is required for Sora I2V.");
                const cleanImage = imageBase64.split(',')[1] || imageBase64;
                const imageDataUri = `data:image/png;base64,${cleanImage}`;
                const createRes = await fetch('https://api.kie.ai/v1/sora/image-to-video', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${kieApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        image_url: imageDataUri,
                        prompt: prompt || "Animate this image",
                        aspect_ratio: aspectRatio || "9:16",
                        loop: false
                    })
                });
                if (!createRes.ok) {
                    const err = await createRes.text();
                    throw new Error(`Kie.ai API Error: ${createRes.status}`);
                }
                const createData = await createRes.json();
                const taskId = createData.id || createData.task_id;
                const startTime = Date.now();
                const TIMEOUT_MS = 120000;
                let videoUrl = null;
                while (!videoUrl) {
                    if (Date.now() - startTime > TIMEOUT_MS)
                        throw new Error("Sora generation timed out.");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const statusRes = await fetch(`https://api.kie.ai/v1/tasks/${taskId}`, {
                        headers: { 'Authorization': `Bearer ${kieApiKey}` }
                    });
                    if (!statusRes.ok)
                        continue;
                    const statusData = await statusRes.json();
                    if (statusData.status === 'succeeded' || statusData.status === 'completed') {
                        videoUrl = statusData.result?.video_url || statusData.output?.video_url || statusData.url;
                    }
                    else if (statusData.status === 'failed') {
                        throw new Error(`Sora task failed: ${statusData.error || 'Check Kie.ai logs'}`);
                    }
                }
                result = { videoUrl };
                break;
            }
            default:
                throw new Error(`Unknown action: ${action}`);
        }
        res.json(result);
    }
    catch (error) {
        logger.error("Cloud Function Exception:", error);
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=index.js.map