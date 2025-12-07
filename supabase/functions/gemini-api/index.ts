import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();
    
    // 1. Resolve API Key (Client Override > Server Env)
    let apiKey = payload?.apiKey;
    let keySource = 'Client';

    // Strict check for empty strings/whitespace
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        apiKey = Deno.env.get('GEMINI_API');
        keySource = 'Server Env';
    }

    if (apiKey) apiKey = apiKey.trim();

    console.log(`Processing action: ${action} | Auth Source: ${keySource} | Key Present: ${!!apiKey}`);

    if (!apiKey) {
      console.error("Missing GEMINI_API secret");
      throw new Error('Server Configuration Error: Missing GEMINI_API secret. Please add your Google Gemini API Key in Settings.');
    }

    const ai = new GoogleGenAI({ apiKey });
    let result;

    switch (action) {
      case 'generate-script': {
        const { prompt, systemInstruction, schema } = payload;
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });
        
        const txt = response.text;
        if (!txt) throw new Error("No text returned from model");
        result = JSON.parse(txt);
        break;
      }

      case 'generate-story-batch': {
        // Payload: { model, contents, config }
        const { model, contents, config } = payload;
        
        // Use defaults if config is missing
        const safeConfig = config || {};
        
        // Remove manual injection of responseMimeType to be safe. 
        // We rely on the prompt instructing the model to output JSON.

        const response = await ai.models.generateContent({
          model: model || "gemini-2.5-flash",
          contents: contents,
          config: safeConfig
        });

        // Safe text extraction
        let text = response.text;
        if (!text && response.candidates && response.candidates.length > 0) {
             const parts = response.candidates[0].content?.parts;
             if (parts && parts.length > 0) {
                 text = parts[0].text;
             }
        }

        if (!text) {
            console.error("Empty response from Gemini:", JSON.stringify(response));
            throw new Error("Gemini returned an empty response. Possible safety block.");
        }

        result = { text };
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
        const { prompt, aspectRatio, model } = payload;
        const response = await ai.models.generateContent({
            model: model || "gemini-2.5-flash-image",
            contents: { parts: [{ text: prompt }] },
            config: { 
                imageConfig: { aspectRatio: aspectRatio || "1:1" }
            }
        });
        
        let imageData = null;
        // Search all parts for inline data
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
             if (part.inlineData) imageData = part.inlineData.data;
        }
        
        if (!imageData) {
             console.error("No image data in response:", JSON.stringify(response));
             throw new Error("No image generated by model.");
        }
        
        result = { imageData: `data:image/png;base64,${imageData}` };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Edge Function Error:", error);
    
    let errorMessage = error.message;
    const errorDetails = JSON.stringify(error);

    // 1. Handle Referrer Block (403)
    // Google Cloud returns: "Requests from referer <empty> are blocked." or reason: "API_KEY_HTTP_REFERRER_BLOCKED"
    if (errorDetails.includes("API_KEY_HTTP_REFERRER_BLOCKED") || errorMessage.includes("Requests from referer <empty> are blocked")) {
        errorMessage = "API Key Error: Your API key has 'HTTP Referrer' restrictions which block this app. Please go to Google Cloud Console > Credentials and remove the restriction or add 'loopgenie.ai' (and localhost if testing).";
    }
    // 2. Handle IP Block (403)
    else if (errorDetails.includes("API_KEY_IP_ADDRESS_BLOCKED")) {
        errorMessage = "API Key Error: Your key has IP restrictions. Please remove them or allow all IPs.";
    }
    // 3. Handle OAuth/Empty Key Fallback (401)
    // The SDK falls back to OAuth if key is empty/invalid, leading to "API keys are not supported..." or "CREDENTIALS_MISSING"
    else if (errorMessage.includes("API keys are not supported") || errorDetails.includes("CREDENTIALS_MISSING")) {
        errorMessage = "Invalid API Key. The key provided is likely empty or invalid. Please check your Settings.";
    }
    // 4. Handle Quota (429)
    else if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        errorMessage = "Daily AI quota exceeded. Please try again later or use a different API key.";
    }

    // Explicitly return 500 but with CORS headers so client can read body
    return new Response(JSON.stringify({ error: errorMessage, details: error.toString() }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});