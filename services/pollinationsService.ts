
export const generatePollinationsImage = async (prompt: string, width: number, height: number, seed?: string): Promise<string> => {
    const finalSeed = seed || Math.floor(Math.random() * 1000000).toString();
    const encodedPrompt = encodeURIComponent(prompt);
    
    // Pollinations URL structure
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true&model=flux`;
    
    try {
        // We fetch the image to convert it to a Base64 Data URI.
        // This ensures consistent handling in the frontend (Editor preview) and FFMPEG service.
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 60000); // Increased to 60s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        
        if (!response.ok) throw new Error("Pollinations API request failed");

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error: any) {
        console.error("Pollinations generation failed:", error);
        // Return a placeholder or bubble error depending on strictness
        // For robustness, we throw so the caller knows this frame failed
        if (error.name === 'AbortError') {
             throw new Error("Image generation timed out.");
        }
        throw error;
    }
};
