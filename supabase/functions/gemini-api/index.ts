
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();
    
    let apiKey = payload?.apiKey;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        apiKey = Deno.env.get('GEMINI_API');
    }
    if (apiKey) apiKey = apiKey.trim();

    const kieApiKey = payload?.kieApiKey;

    // --- PROXY WEBHOOK ACTION ---
    if (action === 'proxy-webhook') {
        const { url, data, method: rawMethod = 'POST' } = payload;
        const method = rawMethod.toUpperCase();

        if (!url) throw new Error("Missing Webhook URL");
        
        try {
            let finalUrl = url;
            const fetchOptions: RequestInit = {
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
            } else {
                fetchOptions.headers = { ...fetchOptions.headers, 'Content-Type': 'application/json' };
                fetchOptions.body = JSON.stringify(data);
            }

            const webhookRes = await fetch(finalUrl, fetchOptions);
            const responseText = await webhookRes.text();

            if (!webhookRes.ok) {
                return new Response(JSON.stringify({ 
                    error: `Target responded with ${webhookRes.status}`,
                    details: responseText,
                    status: webhookRes.status 
                }), {
                    status: 200, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify({ success: true, status: webhookRes.status }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: "Network Error: Could not reach target.", details: e.message }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }

    if (!apiKey && !['generate-sora', 'proxy-webhook'].includes(action)) {
      throw new Error('Server Configuration Error: Missing GEMINI_API secret.');
    }

    let ai;
    if (action !== 'generate-sora' && action !== 'proxy-webhook') {
        ai = new GoogleGenAI({ apiKey });
    }
    
    let result;

    switch (action) {
      case 'generate-script': {
        const { prompt, systemInstruction, schema } = payload;
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });
        const txt = response.text;
        if (!txt) throw new Error("No text returned from model");
        const jsonStr = cleanJson(txt);
        result = JSON.parse(jsonStr);
        break;
      }

      case 'generate-story-batch': {
        const { model, contents, config } = payload;
        const response = await ai.models.generateContent({
          model: model || "gemini-3-flash-preview",
          contents: contents,
          config: config || {}
        });
        let text = response.text;
        if (!text && response.candidates?.[0]?.content?.parts?.[0]?.text) {
             text = response.candidates[0].content.parts[0].text;
        }
        if (!text) throw new Error("AI returned empty content. This may be due to safety filters.");
        const cleanText = cleanJson(text);
        result = { text: cleanText };
        break;
      }

      case 'generate-speech': {
        const { text, voiceName } = payload;
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: { parts: [{ text }] },
          config: { 
            responseModalities: ["AUDIO"], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } } } 
          }
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error('No audio data returned');
        result = { audioData: base64Audio };
        break;
      }

      case 'analyze-image': {
        const { imageBase64, prompt } = payload;
        const cleanBase64 = imageBase64.split(',')[1] || imageBase64;
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/png", data: cleanBase64 } },
                    { text: prompt || "Analyze this image." }
                ]
            }
        });
        result = { text: response.text };
        break;
      }

      case 'generate-image': {
        const { prompt, aspectRatio, model, referenceImageBase64 } = payload;
        const generateWithModel = async (modelName: string) => {
             const contentsParts: any[] = [{ text: prompt }];
             if (referenceImageBase64) {
                const cleanRef = referenceImageBase64.split(',')[1] || referenceImageBase64;
                contentsParts.unshift({ 
                    inlineData: { mimeType: "image/png", data: cleanRef } 
                });
             }
             return await ai.models.generateContent({
                model: modelName,
                contents: { parts: contentsParts },
                config: { 
                    imageConfig: { aspectRatio: aspectRatio || "9:16" }
                }
            });
        };

        let response;
        try {
            response = await generateWithModel(model || "gemini-2.5-flash-image");
        } catch (e: any) {
            const isPro = (model || "").includes("pro");
            if (isPro) {
                // Graceful fallback to Flash on Pro-specific errors
                response = await generateWithModel("gemini-2.5-flash-image");
            } else {
                throw e;
            }
        }
        
        let imageData = null;
        let textOutput = "";
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
             if (part.inlineData) imageData = part.inlineData.data;
             if (part.text) textOutput += part.text;
        }
        if (!imageData) {
            throw new Error(textOutput || "No image generated. It may have been blocked by safety filters.");
        }
        result = { imageData: `data:image/png;base64,${imageData}` };
        break;
      }

      case 'generate-veo': {
        const { prompt, imageBase64, aspectRatio } = payload; 
        const safePrompt = prompt || "A cinematic video scene";
        let operation;
        const config = {
            numberOfVideos: 1,
            resolution: '1080p',
            aspectRatio: aspectRatio || '9:16'
        };

        try {
            if (imageBase64) {
                const cleanImage = imageBase64.split(',')[1] || imageBase64;
                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-fast-generate-preview',
                    prompt: safePrompt,
                    image: { imageBytes: cleanImage, mimeType: 'image/png' },
                    config
                });
            } else {
                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-fast-generate-preview',
                    prompt: safePrompt,
                    config
                });
            }
        } catch (initError: any) {
            // Check for quota error specifically
            if (initError.message?.includes("429") || initError.message?.includes("RESOURCE_EXHAUSTED")) {
                throw new Error("Quota Exceeded (429): Please wait or use a personal API key.");
            }
            throw new Error(`Failed to start video generation: ${initError.message}`);
        }

        const startTime = Date.now();
        const TIMEOUT_MS = 60000;
        while (!operation.done) {
            if (Date.now() - startTime > TIMEOUT_MS) throw new Error("Video generation timed out.");
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) throw new Error("No video URI returned.");

        const videoRes = await fetch(`${videoUri}&key=${apiKey}`);
        if (!videoRes.ok) throw new Error(`Failed to download generated video.`);
        
        const videoArrayBuffer = await videoRes.arrayBuffer();
        const videoBase64 = base64Encode(videoArrayBuffer);
        result = { videoData: videoBase64 };
        break;
      }

      case 'generate-sora': {
        const { prompt, imageBase64, aspectRatio } = payload;
        if (!kieApiKey) throw new Error("Kie.ai API Key is required for Sora 2.");
        if (!imageBase64) throw new Error("Image input is required for Sora I2V.");

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
            if (Date.now() - startTime > TIMEOUT_MS) throw new Error("Sora generation timed out.");
            await new Promise(resolve => setTimeout(resolve, 5000));
            const statusRes = await fetch(`https://api.kie.ai/v1/tasks/${taskId}`, {
                headers: { 'Authorization': `Bearer ${kieApiKey}` }
            });
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            if (statusData.status === 'succeeded' || statusData.status === 'completed') {
                videoUrl = statusData.result?.video_url || statusData.output?.video_url || statusData.url;
            } else if (statusData.status === 'failed') {
                throw new Error(`Sora task failed: ${statusData.error || 'Check Kie.ai logs'}`);
            }
        }
        result = { videoUrl };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Edge Function Exception:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
