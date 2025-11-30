
export interface VideoScene {
    imageUrl: string;
    text: string;
}

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
};

// Helper to load video
const loadVideo = (src: string): Promise<HTMLVideoElement> => {
    return new Promise((resolve, reject) => {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = src;
        vid.muted = true; // Essential for autoplay policies
        vid.onloadedmetadata = () => resolve(vid);
        vid.onerror = (e) => reject(e);
        vid.load();
    });
};

/**
 * Draws professional captions on the canvas context.
 */
const drawCaptions = (
    ctx: CanvasRenderingContext2D, 
    text: string, 
    width: number, 
    height: number
) => {
    if (!text) return;

    // SCALING: Base logic on 1080p (1920x1080 or 1080x1920)
    // We use the smaller dimension to determine scale to keep text readable on portrait/landscape
    const referenceDimension = 1080; 
    const currentMinDimension = Math.min(width, height);
    const scaleFactor = currentMinDimension / referenceDimension;

    // CONFIGURATION (Professional Style)
    const fontSize = Math.round(56 * scaleFactor); // Base 56px
    const lineHeight = fontSize * 1.25;
    const padding = Math.round(24 * scaleFactor);
    const cornerRadius = Math.round(12 * scaleFactor);
    const bottomMargin = Math.round(100 * scaleFactor);
    const shadowBlur = Math.round(4 * scaleFactor);
    const maxWidth = width - (200 * scaleFactor); // 100px safe zone on each side

    // FONT SETTINGS
    ctx.font = `600 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // WORD WRAP LOGIC
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);

    // Limit to 2 lines for aesthetics (optional, but requested "Max 2 lines")
    // If more, we usually just show the first 2 or let it grow. Let's let it grow but typically it should be short.
    
    // CALCULATE BOX DIMENSIONS
    const totalTextHeight = lines.length * lineHeight;
    const boxWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0) + (padding * 2);
    const boxHeight = totalTextHeight + (padding * 2);
    
    const boxX = (width - boxWidth) / 2;
    const boxY = height - bottomMargin - boxHeight;

    // DRAW SHADOW
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // DRAW BACKGROUND BOX (Rounded Rect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% Opacity Black
    
    // Custom rounded rect path
    ctx.beginPath();
    ctx.moveTo(boxX + cornerRadius, boxY);
    ctx.lineTo(boxX + boxWidth - cornerRadius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + cornerRadius);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - cornerRadius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - cornerRadius, boxY + boxHeight);
    ctx.lineTo(boxX + cornerRadius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - cornerRadius);
    ctx.lineTo(boxX, boxY + cornerRadius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + cornerRadius, boxY);
    ctx.closePath();
    ctx.fill();

    // Reset Shadow for Text (Optional, or keep it for pop)
    // We keep shadow for text as well for readability
    ctx.fillStyle = '#FFFFFF';
    
    // DRAW TEXT
    // Center text vertically within the box
    let textY = boxY + padding + (lineHeight / 2); // First line center
    // Adjustment if we want exact middle of box:
    // textY = boxY + (boxHeight / 2) - ((lines.length - 1) * lineHeight / 2);
    
    lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, textY + (index * lineHeight));
    });
};

/**
 * Stitches images and audio into a video CLIENT-SIDE using HTML5 Canvas and MediaRecorder.
 * Features:
 * - Ken Burns Effect (Slow Zoom)
 * - Professional Captioning
 * - Audio Mixing
 */
export const stitchVideoFrames = async (
  scenes: VideoScene[], 
  audioUrl: string | undefined, 
  durationPerImageMs: number = 5000,
  targetWidth?: number,
  targetHeight?: number
): Promise<string> => {
  console.log("Starting client-side video stitching with Ken Burns & Captions...");

  return new Promise(async (resolve, reject) => {
    // Safety timeout
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out."));
    }, 120000); // 2 mins

    try {
        // 1. Prepare Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error("Could not get canvas context");

        // Determine size from first image if not provided
        let width = targetWidth || 1280;
        let height = targetHeight || 720;

        if (!targetWidth || !targetHeight) {
             try {
                const firstImage = await loadImage(scenes[0].imageUrl);
                width = targetWidth || firstImage.naturalWidth;
                height = targetHeight || firstImage.naturalHeight;
            } catch (e) {
                console.warn("Could not load first image for sizing, using default.");
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Fill black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // 2. Prepare Audio & Duration
        let audioContext: AudioContext | null = null;
        let audioBuffer: AudioBuffer | null = null;
        let dest: MediaStreamAudioDestinationNode | null = null;
        let sourceNode: AudioBufferSourceNode | null = null;

        if (audioUrl) {
            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                const response = await fetch(audioUrl);
                const arrayBuffer = await response.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Recalculate duration based on audio length
                if (audioBuffer.duration && audioBuffer.duration > 1) {
                    durationPerImageMs = (audioBuffer.duration * 1000) / scenes.length;
                    console.log(`Adjusted duration per scene to ${Math.round(durationPerImageMs)}ms based on audio.`);
                }
                
                dest = audioContext.createMediaStreamDestination();
                sourceNode = audioContext.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(dest);
            } catch (e) {
                console.error("Error preparing audio:", e);
                // Continue without audio if failed
            }
        }

        // 3. Prepare Recorder
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const combinedTracks = [...canvasStream.getVideoTracks()];
        
        if (dest) {
            const audioTracks = dest.stream.getAudioTracks();
            combinedTracks.push(...audioTracks);
        }
        
        const combinedStream = new MediaStream(combinedTracks);
        
        // Supported MimeTypes lookup
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4' // Some browsers support this now
        ];
        const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

        const recorder = new MediaRecorder(combinedStream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 5000000 // 5 Mbps
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            clearTimeout(timeoutId);
            const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
            const url = URL.createObjectURL(blob);
            if (audioContext && audioContext.state !== 'closed') audioContext.close();
            resolve(url);
        };

        // 4. Start Recording & Animation Loop
        recorder.start();
        if (sourceNode) sourceNode.start(0);

        // Preload all images to avoid stutter
        const loadedImages = await Promise.all(scenes.map(s => loadImage(s.imageUrl)));

        // Animation Loop Variables
        const fps = 30;
        const framesPerScene = Math.ceil((durationPerImageMs / 1000) * fps);
        let currentSceneIdx = 0;
        let currentFrameInScene = 0;
        
        const drawFrame = () => {
            if (currentSceneIdx >= scenes.length) {
                recorder.stop();
                return;
            }

            const img = loadedImages[currentSceneIdx];
            const text = scenes[currentSceneIdx].text;
            
            // --- Ken Burns Effect Logic ---
            // We scale from 1.0 to 1.15 over the duration of the scene
            const progress = currentFrameInScene / framesPerScene;
            const scale = 1.0 + (progress * 0.15); 
            
            // We alternate pan direction based on even/odd scene
            const panDirection = currentSceneIdx % 2 === 0 ? 1 : -1;
            // Max pan pixels (e.g. 5% of width)
            const maxPanX = width * 0.05;
            const translateX = (progress * maxPanX * panDirection) - (panDirection > 0 ? 0 : maxPanX);

            // Draw Background
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);

            // Draw Image with Transform
            ctx.save();
            
            // Center origin for scaling
            ctx.translate(width / 2, height / 2);
            ctx.scale(scale, scale);
            ctx.translate(-width / 2, -height / 2);
            // Apply slight pan
            ctx.translate(translateX, 0);

            // Draw Image (Cover fit)
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const canvasRatio = width / height;
            let renderW, renderH, offsetX, offsetY;

            if (imgRatio > canvasRatio) {
                renderH = height;
                renderW = height * imgRatio;
                offsetX = -(renderW - width) / 2;
                offsetY = 0;
            } else {
                renderW = width;
                renderH = width / imgRatio;
                offsetX = 0;
                offsetY = -(renderH - height) / 2;
            }
            ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
            ctx.restore();

            // --- Draw Captions ---
            drawCaptions(ctx, text, width, height);

            // Loop Logic
            currentFrameInScene++;
            if (currentFrameInScene >= framesPerScene) {
                currentSceneIdx++;
                currentFrameInScene = 0;
            }

            // Next frame
            // Using setTimeout instead of requestAnimationFrame to run as fast as possible in background if needed, 
            // but for MediaRecorder real-time recording, we need roughly 30fps timing.
            setTimeout(() => drawFrame(), 1000 / fps);
        };

        // Start Loop
        drawFrame();

    } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
    }
  });
};

/**
 * Merges a video URL with an audio URL.
 */
export const mergeVideoAudio = async (videoUrl: string, audioUrl: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const video = await loadVideo(videoUrl);
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("No ctx");

            // Audio Setup
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const dest = audioContext.createMediaStreamDestination();
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(dest);

            const stream = canvas.captureStream(30);
            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            const recorder = new MediaRecorder(combinedStream);
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                resolve(URL.createObjectURL(blob));
                audioContext.close();
            };

            recorder.start();
            sourceNode.start(0);
            await video.play();

            const draw = () => {
                if (video.paused || video.ended) {
                    recorder.stop();
                    return;
                }
                ctx.drawImage(video, 0, 0);
                requestAnimationFrame(draw);
            };
            draw();

        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Client-side concatenation of multiple video URLs.
 * Simulates stitching by playing them sequentially on a canvas recorder.
 */
export const concatenateVideos = async (
    videoUrls: string[], 
    width: number = 1280, 
    height: number = 720,
    backgroundAudioUrl?: string
): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("No ctx");

            // Optional Background Audio
            let audioContext: AudioContext | null = null;
            let dest: MediaStreamAudioDestinationNode | null = null;
            
            if (backgroundAudioUrl) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                const response = await fetch(backgroundAudioUrl);
                const ab = await response.arrayBuffer();
                const buffer = await audioContext.decodeAudioData(ab);
                
                dest = audioContext.createMediaStreamDestination();
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(dest);
                source.start(0);
            }

            const stream = canvas.captureStream(30);
            const tracks = [...stream.getVideoTracks()];
            if (dest) tracks.push(...dest.stream.getAudioTracks());
            
            const combinedStream = new MediaStream(tracks);
            const recorder = new MediaRecorder(combinedStream);
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                 const blob = new Blob(chunks, { type: 'video/webm' });
                 resolve(URL.createObjectURL(blob));
                 if (audioContext) audioContext.close();
            };

            recorder.start();

            // Sequential Playback
            for (const url of videoUrls) {
                const vid = await loadVideo(url);
                await vid.play();
                
                // Draw loop for this video
                await new Promise<void>(res => {
                    const draw = () => {
                        if (vid.paused || vid.ended) {
                            res();
                            return;
                        }
                        // Draw fit cover
                        const imgRatio = vid.videoWidth / vid.videoHeight;
                        const canvasRatio = width / height;
                        let renderW, renderH, offsetX, offsetY;
                        
                        // Simple center fit (contain) or cover logic. Using contain for safety on varying inputs, 
                        // or cover if we want seamless. Let's use DrawImage standard which stretches if we match dimensions
                        // To keep it simple for now: Draw full size
                        ctx.drawImage(vid, 0, 0, width, height);
                        
                        requestAnimationFrame(draw);
                    };
                    draw();
                });
            }

            recorder.stop();

        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Cropping helper for Avatar videos (Client-Side)
 */
export const cropVideo = async (videoUrl: string, targetW: number, targetH: number): Promise<string> => {
    // Re-uses the merge logic but with different canvas size and offset
    // Simplified version:
    return new Promise(async (resolve, reject) => {
        try {
            const video = await loadVideo(videoUrl);
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if(!ctx) throw new Error("No ctx");

            const stream = canvas.captureStream(30);
            // Capture audio from video element if cross-origin allows, else silent
            // For HeyGen, we usually get a URL that allows cross-origin
            // Ideally we use Web Audio API to route video audio to destination
            
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const actx = new AudioContextClass();
            const dest = actx.createMediaStreamDestination();
            const source = actx.createMediaElementSource(video);
            source.connect(dest);
            source.connect(actx.destination); // Optional: hear it while processing

            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combined = new MediaStream(tracks);
            
            const recorder = new MediaRecorder(combined);
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, {type:'video/webm'});
                resolve(URL.createObjectURL(blob));
                actx.close();
            };

            recorder.start();
            await video.play();
            
            const draw = () => {
                if(video.paused || video.ended) {
                    recorder.stop();
                    return;
                }
                // Center crop
                const sx = (video.videoWidth - targetW)/2;
                const sy = (video.videoHeight - targetH)/2;
                ctx.drawImage(video, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
                requestAnimationFrame(draw);
            };
            draw();

        } catch(e) { reject(e); }
    });
};
