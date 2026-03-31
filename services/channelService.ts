
import { invokeGemini } from "./geminiService";
import { YouTubeChannel, YouTubeEpisode, ShortMakerManifest } from "../types";
import { generateStory } from "./shortMakerService";

// Helper: Clean Markdown Code Blocks from JSON String
const cleanJson = (text: string) => {
    if (!text) return "";
    let clean = text.trim();
    if (clean.startsWith('```')) {
        clean = clean.replace(/^```(json)?\s*/i, '');
        clean = clean.replace(/\s*```$/, '');
    }
    return clean;
};

/**
 * Generates a full channel concept (Name, Bio, Visual Style, Episodes) based on a niche.
 */
export const generateChannelConcept = async (niche: string): Promise<Partial<YouTubeChannel>> => {
    const systemInstruction = `
SYSTEM: You are a elite YouTube Growth Strategist. Output ONLY valid JSON.
OBJECTIVE: Create a high-converting YouTube channel brand identity.
JSON SCHEMA: { 
  "name": "Catchy Channel Name", 
  "bio": "Compelling 150-char bio", 
  "style": "Visual style description (e.g. Neon Cyberpunk, Minimalist 2D, Cinematic Dark)",
  "episodes": [
    { "title": "Episode 1 Title", "description": "Quick hook for the video" },
    { "title": "Episode 2 Title", "description": "Quick hook for the video" },
    { "title": "Episode 3 Title", "description": "Quick hook for the video" },
    { "title": "Episode 4 Title", "description": "Quick hook for the video" },
    { "title": "Episode 5 Title", "description": "Quick hook for the video" }
  ]
}
`;
    const response = await invokeGemini('generate-story-batch', {
        model: "gemini-3-flash-preview",
        contents: `Create a YouTube channel concept for this niche: ${niche}`,
        systemInstruction
    });

    const jsonStr = cleanJson(response.text);
    try {
        const parsed = JSON.parse(jsonStr);
        return {
            name: parsed.name,
            bio: parsed.bio,
            style: parsed.style,
            episodes: parsed.episodes.map((ep: any, i: number) => ({
                id: `ep_${Date.now()}_${i}`,
                title: ep.title,
                description: ep.description,
                status: 'pending',
                createdAt: Date.now()
            }))
        };
    } catch (e) {
        console.error("Failed to parse channel concept JSON:", jsonStr);
        throw new Error("AI returned invalid channel format. Please retry.");
    }
};

/**
 * Generates a ShortMakerManifest for a specific episode within a channel context.
 */
export const generateEpisodeManifestForChannel = async (
    channel: YouTubeChannel,
    episode: YouTubeEpisode,
    durationTier: '15s' | '30s' | '60s' = '30s'
): Promise<ShortMakerManifest> => {

    // Leverage the existing generateStory logic but with augmented context
    const idea = `Video for YouTube Channel "${channel.name}" (${channel.description}). Episode Title: "${episode.title}". Focus: ${episode.description}. Visual Style: ${channel.style}.`;

    return await generateStory({
        idea,
        style_tone: channel.style || 'Cinematic',
        durationTier,
        mode: 'SHORTS',
        aspectRatio: '9:16'
    });
};
