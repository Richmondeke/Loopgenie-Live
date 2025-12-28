
import { Project, ProjectStatus } from "../types";
import { supabase, isSupabaseConfigured } from "../supabaseClient";

/**
 * Utility to strip heavy base64 strings or redundant data from objects
 * before sending them to external webhooks to avoid 413 Payload Too Large errors.
 */
const sanitizePayload = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    
    // Create a shallow copy
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key in copy) {
        const val = copy[key];
        // 1. Strip base64 strings (longer than 1000 chars and starts with data:)
        if (typeof val === 'string' && val.length > 1000 && val.startsWith('data:')) {
            copy[key] = `[STRIPPED_LARGE_DATA_${val.length}_BYTES]`;
        }
        // 2. Recursively sanitize
        else if (typeof val === 'object') {
            copy[key] = sanitizePayload(val);
        }
    }
    return copy;
};

/**
 * Sends a manual test or data push to a webhook URL.
 */
export const dispatchManualWebhook = async (
    webhookUrl: string, 
    content: string, 
    method: string = 'POST'
): Promise<{ success: boolean; error?: string }> => {
    if (!webhookUrl || !webhookUrl.trim() || !webhookUrl.startsWith('http')) {
        return { success: false, error: "Invalid Webhook URL. Must start with http:// or https://" };
    }

    const payload = {
        event: 'manual.push',
        timestamp: new Date().toISOString(),
        source: 'LoopGenie Manual Dispatch',
        content: content
    };

    const isLocalTarget = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase.functions.invoke('gemini-api', {
                body: {
                    action: 'proxy-webhook',
                    payload: {
                        url: webhookUrl,
                        data: payload,
                        method: method
                    }
                }
            });

            if (error) {
                console.error("[Webhook Proxy] Invocation Error:", error);
                if (!isLocalTarget) {
                    return { 
                        success: false, 
                        error: `Edge Function Error: ${error.message || 'The "gemini-api" function could not be reached.'}` 
                    };
                }
            } else if (data?.error) {
                return { success: false, error: `Destination Error (${data.status || 'Error'}): ${data.error}. ${data.details || ''}` };
            } else if (data?.success) {
                return { success: true };
            }
        } catch (e: any) {
            console.error("[Webhook Proxy] Unexpected Exception:", e);
            if (!isLocalTarget) return { success: false, error: `Proxy call failed: ${e.message}` };
        }
    }

    try {
        let finalUrl = webhookUrl;
        const opts: RequestInit = { method: method.toUpperCase() };

        if (opts.method === 'GET') {
            const params = new URLSearchParams();
            Object.entries(payload).forEach(([k, v]) => params.append(k, String(v)));
            const sep = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${sep}${params.toString()}`;
        } else {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(payload);
        }

        const response = await fetch(finalUrl, opts);
        if (!response.ok) return { success: false, error: `Direct Fetch Failed (${response.status})` };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || "Unknown network error." };
    }
};

/**
 * Manually dispatches a completed project to the webhook.
 */
export const dispatchProjectToWebhook = async (webhookUrl: string, project: any, method: string = 'POST'): Promise<{ success: boolean; error?: string }> => {
    if (!webhookUrl || !webhookUrl.trim() || !webhookUrl.startsWith('http')) {
        return { success: false, error: "No valid Webhook URL configured in Settings." };
    }

    // CRITICAL: Sanitize project metadata to avoid 413 errors
    const safeProject = sanitizePayload(project);
    const videoUrl = safeProject.videoUrl || safeProject.generated_video_url || "";
    const title = safeProject.templateName || safeProject.title || "video";
    const filename = `${title.replace(/\s+/g, '_')}.mp4`;

    const payload = {
        event: 'project.manual_push',
        timestamp: new Date().toISOString(),
        project: {
            id: safeProject.id,
            title: title,
            type: safeProject.type,
            // Standardizing for n8n extraction
            video_url: videoUrl,
            mp4_url: videoUrl, // Explicitly named for n8n mapping
            filename: filename,
            content_type: 'video/mp4',
            thumbnail_url: safeProject.thumbnailUrl || (safeProject.scenes && safeProject.scenes[0]?.generated_image_url),
            metadata: safeProject.metadata || safeProject
        }
    };

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase.functions.invoke('gemini-api', {
                body: {
                    action: 'proxy-webhook',
                    payload: { url: webhookUrl, data: payload, method: method }
                }
            });
            if (error) throw error;
            if (data?.error) return { success: false, error: data.error };
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    try {
        const res = await fetch(webhookUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return { success: res.ok, error: res.ok ? undefined : `Target responded with ${res.status}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

/**
 * Triggers a user-configured webhook whenever a project event occurs.
 */
export const triggerWebhook = async (webhookUrl: string | undefined, project: Project) => {
    if (!webhookUrl || !webhookUrl.trim() || !webhookUrl.startsWith('http')) return;
    if (project.status !== ProjectStatus.COMPLETED && project.status !== ProjectStatus.FAILED) return;

    let method = 'POST';
    if (isSupabaseConfigured()) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('webhook_method').eq('id', user.id).single();
                if (data?.webhook_method) method = data.webhook_method;
            }
        } catch (e) {}
    } else {
        method = localStorage.getItem('loopgenie_webhook_method') || 'POST';
    }

    // Sanitize Project for auto-triggers too
    const safeProject = sanitizePayload(project);
    const videoUrl = safeProject.videoUrl || "";
    const filename = `${(safeProject.templateName || "video").replace(/\s+/g, '_')}.mp4`;

    const payload = {
        event: project.status === ProjectStatus.COMPLETED ? 'project.completed' : 'project.failed',
        timestamp: new Date().toISOString(),
        project: {
            id: safeProject.id,
            name: safeProject.templateName,
            type: safeProject.type,
            status: safeProject.status,
            video_url: videoUrl,
            mp4_url: videoUrl,
            filename: filename,
            content_type: 'video/mp4',
            thumbnail_url: safeProject.thumbnailUrl,
            cost: safeProject.cost,
            error: safeProject.error,
            created_at: new Date(safeProject.createdAt).toISOString()
        }
    };

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase.functions.invoke('gemini-api', {
                body: {
                    action: 'proxy-webhook',
                    payload: { url: webhookUrl, data: payload, method: method }
                }
            });
            if (!error && !data?.error) return;
        } catch (e) {
            console.warn("[Webhook Auto Proxy] Failed, using direct fetch fallback.");
        }
    }

    try {
        let finalUrl = webhookUrl;
        const opts: RequestInit = { method };
        if (method.toUpperCase() === 'GET') {
            const params = new URLSearchParams();
            params.append('event', payload.event);
            params.append('project_id', payload.project.id);
            const sep = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${sep}${params.toString()}`;
        } else {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(payload);
        }
        await fetch(finalUrl, opts);
    } catch (e) {
        console.error(`[Webhook] Delivery error:`, e);
    }
};
