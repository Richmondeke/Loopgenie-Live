
import { Project, ProjectStatus, HeyGenAvatar, HeyGenVoice, Template } from "../types";
import { FIREBASE_FUNCTION_URL } from "../constants";

const HEYGEN_API_BASE = "https://api.heygen.com/v2";

const fetchAPI = async (endpoint: string, apiKey: string, options: RequestInit = {}) => {
  // Use Firebase Cloud Function as proxy
  try {
    const method = options.method || 'GET';
    const response = await fetch(FIREBASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'proxy-webhook',
        payload: {
          url: `${HEYGEN_API_BASE}${endpoint}`,
          method: method,
          data: options.body ? JSON.parse(options.body as string) : undefined
        }
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `Proxy Error ${response.status}`);
    }

    // geminiApi proxy returns { success, status, details } for proxy-webhook
    // but the heygenService expects the direct response from HeyGen
    // Actually, the proxy-webhook implementation returns result = { success: response.ok, status: response.status, details: text };
    // We need to parse 'details' as JSON if it's the result of a successful proxy.

    if (data.details) {
      try {
        return JSON.parse(data.details);
      } catch (e) {
        return data.details;
      }
    }
    return data;
  } catch (e: any) {
    console.error("[HeyGen Proxy] Request Failed:", e);
    throw e;
  }
}

// Simple in-memory cache
interface Cache<T> {
  data: T;
  apiKey: string;
}

let avatarCache: Cache<HeyGenAvatar[]> | null = null;
let voiceCache: Cache<HeyGenVoice[]> | null = null;

// In "Strictly Avatar" mode, we primarily use getAvatars. 
// getTemplates is kept for backward compatibility or if we want to show generic templates later.
export const getTemplates = async (apiKey: string): Promise<Template[]> => {
  return []; // Disable generic template fetching to focus on Avatars
};

export const getTemplateDetail = async (apiKey: string, templateId: string): Promise<Template | null> => {
  return null; // Disable detail fetching
}

export const getAvatars = async (apiKey: string): Promise<HeyGenAvatar[]> => {
  if (!apiKey) return [];

  // Return cached data if available and key matches
  if (avatarCache && avatarCache.apiKey === apiKey && avatarCache.data.length > 0) {
    return avatarCache.data;
  }

  try {
    const response = await fetchAPI('/avatars', apiKey);
    const list = response.data?.avatars || response.data || [];
    const mapped = list.map((a: any) => ({
      id: a.avatar_id || a.id,
      name: a.name,
      gender: a.gender,
      previewUrl: a.preview_image_url || a.avatar_image_url || a.preview_url
    }));

    // Update cache
    avatarCache = {
      data: mapped,
      apiKey: apiKey
    };

    return mapped;
  } catch (e) {
    console.warn("Failed to fetch avatars:", e);
    return [];
  }
};

export const getVoices = async (apiKey: string): Promise<HeyGenVoice[]> => {
  if (!apiKey) return [];

  // Return cached data if available and key matches
  if (voiceCache && voiceCache.apiKey === apiKey && voiceCache.data.length > 0) {
    return voiceCache.data;
  }

  try {
    const response = await fetchAPI('/voices', apiKey);
    const list = response.data?.voices || response.data || [];
    const mapped = list.map((v: any) => ({
      id: v.voice_id || v.id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      previewAudio: v.preview_audio
    }));

    // Update cache
    voiceCache = {
      data: mapped,
      apiKey: apiKey
    };

    return mapped;
  } catch (e) {
    console.warn("Failed to fetch voices:", e);
    return [];
  }
};

export const generateVideo = async (
  apiKey: string,
  templateId: string,
  variables: Record<string, string>,
  avatarId?: string,
  voiceId?: string,
  dimension?: { width: number, height: number }
): Promise<string> => {
  // Strict check for API Key in production
  if (!apiKey) {
    throw new Error("HeyGen API Key is required to generate videos.");
  }

  try {
    const script = variables.script || "Hello, this is a generated video.";
    const dim = dimension || { width: 1280, height: 720 };

    const body = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal"
          },
          voice: {
            type: "text",
            input_text: script,
            voice_id: voiceId
          },
          background: {
            type: "color",
            value: "#F9FAFB"
          }
        }
      ],
      dimension: dim,
      test: false
    };

    const response = await fetchAPI('/video/generate', apiKey, {
      method: "POST",
      body: JSON.stringify(body)
    });

    return response.data?.video_id || response.data?.job_id || response.video_id || response.job_id;
  } catch (error: any) {
    console.error("HeyGen API Error:", error);
    throw error;
  }
};

export interface VideoStatusResponse {
  status: ProjectStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export const checkVideoStatus = async (
  apiKey: string,
  jobId: string
): Promise<VideoStatusResponse> => {
  if (!apiKey) return { status: ProjectStatus.PENDING };

  try {
    // Note: status check uses v1 endpoint in original code, so we proxy that too
    const response = await fetch(FIREBASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'proxy-webhook',
        payload: {
          url: `https://api.heygen.com/v1/video_status.get?video_id=${jobId}`,
          method: 'GET'
        }
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error);

    const heygenData = JSON.parse(data.details);
    const statusStr = heygenData.data.status;
    const videoUrl = heygenData.data.video_url || heygenData.data.url;
    const thumbnailUrl = heygenData.data.thumbnail_url;

    const errorRaw = heygenData.data.error;
    let errorMsg: string | undefined = undefined;
    if (errorRaw) {
      errorMsg = typeof errorRaw === 'string' ? errorRaw : JSON.stringify(errorRaw);
      if (errorMsg === 'null' || errorMsg === '{}') errorMsg = undefined;
    }

    let status = ProjectStatus.PENDING;
    if (statusStr === 'completed') status = ProjectStatus.COMPLETED;
    else if (statusStr === 'processing' || statusStr === 'waiting') status = ProjectStatus.PROCESSING;
    else if (statusStr === 'failed') status = ProjectStatus.FAILED;

    return {
      status,
      videoUrl,
      thumbnailUrl,
      error: errorMsg
    };
  } catch (error) {
    console.warn("Proxy error during status check, retrying next poll", error);
    return { status: ProjectStatus.PENDING };
  }
};
