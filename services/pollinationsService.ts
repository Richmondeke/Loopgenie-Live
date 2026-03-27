
import { FIREBASE_FUNCTION_URL } from "../constants";

export const generatePollinationsImage = async (prompt: string, width: number, height: number, seed?: string): Promise<string> => {
    const finalSeed = seed || Math.floor(Math.random() * 1000000).toString();
    const encodedPrompt = encodeURIComponent(prompt);

    // Pollinations URL structure
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true&model=flux`;

    let retries = 3;
    while (retries > 0) {
        try {
            // Use Firebase Cloud Function as proxy for reliable fetch
            const response = await fetch(FIREBASE_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'proxy-webhook',
                    payload: {
                        url: url,
                        method: 'GET'
                    }
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || `Proxy failed with status ${response.status}`);
            }

            // The proxy returns result = { success, status, contentType, details }
            // For images, 'details' is a data URI if the proxy handled it correctly.
            if (data.details && data.details.startsWith('data:')) {
                return data.details;
            } else if (data.details) {
                // If the proxy didn't detect it as image or returned something else
                throw new Error("Proxy did not return a valid image data URI.");
            }

            throw new Error("No data returned from proxy.");

        } catch (error: any) {
            console.warn(`Pollinations generation attempt ${4 - retries} failed:`, error.message);
            retries--;
            if (retries === 0) {
                throw error;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("Pollinations generation failed after retries.");
};
