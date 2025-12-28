
export const generatePollinationsImage = async (prompt: string, width: number, height: number, seed?: string): Promise<string> => {
    const finalSeed = seed || Math.floor(Math.random() * 1000000).toString();
    const encodedPrompt = encodeURIComponent(prompt);
    
    // Pollinations URL structure
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true&model=flux`;
    
    let retries = 3;
    while (retries > 0) {
        try {
            // We fetch the image to convert it to a Base64 Data URI.
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 60000); // 60s timeout

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            
            if (!response.ok) throw new Error(`Pollinations API request failed: ${response.status}`);

            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error: any) {
            console.warn(`Pollinations generation attempt ${4 - retries} failed:`, error);
            retries--;
            if (retries === 0) {
                if (error.name === 'AbortError') {
                     throw new Error("Image generation timed out.");
                }
                throw error;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw new Error("Pollinations generation failed after retries.");
};
