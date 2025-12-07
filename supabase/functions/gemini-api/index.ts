import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai";

// Declare Deno to resolve "Cannot find name 'Deno'" error in TypeScript environments not configured for Deno
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
    const apiKey = Deno.env.get('GEMINI_API');
    if (!apiKey) {
      throw new Error('Missing GEMINI_API secret in Edge Function configuration.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const { action, payload } = await req.json();

    console.log(`Processing action: ${action}`);

    let result;

    switch (action) {
      case 'generate-script': {
        // Payload: { prompt, systemInstruction, schema }
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
        result = JSON.parse(response.text || '{}');
        break;
      }

      case 'generate-story-batch': {
        // Payload: { model, contents, config }
        const { model, contents, config } = payload;
        const response = await ai.models.generateContent({
          model: model || "gemini-2.5-flash",
          contents: contents,
          config: config
        });
        result = { text: response.text };
        break;
      }

      case 'generate-speech': {
        // Payload: { text, voiceName }
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
        // Payload: { imageBase64, prompt }
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
        // Payload: { prompt, aspectRatio, model }
        const { prompt, aspectRatio, model } = payload;
        const response = await ai.models.generateContent({
            model: model || "gemini-2.5-flash-image",
            contents: { parts: [{ text: prompt }] },
            config: { 
                imageConfig: { aspectRatio: aspectRatio || "1:1" }
            }
        });
        
        let imageData = null;
        for (const part of response.candidates?.[0]?.content?.parts || []) {
             if (part.inlineData) imageData = part.inlineData.data;
        }
        if (!imageData) throw new Error("No image generated");
        
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});