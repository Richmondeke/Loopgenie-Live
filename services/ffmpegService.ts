
export interface VideoScene {
    imageUrl: string;
    text: string;
}

export interface AdvancedScene extends VideoScene {
    audioUrl?: string;
    durationMs?: number;
}

export interface CaptionSettings {
    enabled: boolean;
    style: 'BOXED' | 'OUTLINE' | 'MINIMAL' | 'HIGHLIGHT';
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

// Helper to get audio buffer and duration
const loadAudioBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return await ctx.decodeAudioData(buf);
};

/**
 * Draws professional captions on the canvas context with configurable styles.
 */
const drawCaptions = (
    ctx: CanvasRenderingContext2D, 
    text: string, 
    width: number, 
    height: number,
    settings?: CaptionSettings
) => {
    // 1. Check if captions are enabled
    if (!text || (settings && settings.enabled === false)) return;

    const style = settings?.style || 'BOXED';

    // SCALING: Base logic on 1080p (1920x1080 or 1080x1920)
    const referenceDimension = 1080; 
    const currentMinDimension = Math.min(width, height);
    const scaleFactor = currentMinDimension / referenceDimension;

    // CONFIGURATION (Professional Style)
    // Adjust font size slightly based on style
    const baseFontSize = style === 'HIGHLIGHT' ? 64 : 56;
    const fontSize = Math.round(baseFontSize * scaleFactor); 
    const lineHeight = fontSize * 1.25;
    const padding = Math.round(24 * scaleFactor);
    const cornerRadius = Math.round(16 * scaleFactor);
    const bottomMargin = Math.round(120 * scaleFactor);
    const shadowBlur = Math.round(4 * scaleFactor);
    const maxWidth = width - (200 * scaleFactor); // 100px safe zone on each side

    // FONT SETTINGS
    // Using a heavy weight for impact
    const fontWeight = style === 'MINIMAL' ? '500' : '800';
    ctx.font = `${fontWeight} ${fontSize}px Manrope, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
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

    // CALCULATE BOX DIMENSIONS
    // Measure widest line for box
    const widestLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const boxWidth = widestLineWidth + (padding * 2);
    const boxHeight = (lines.length * lineHeight) + (padding * 1.5); // Slightly tighter height
    
    const boxX = (width - boxWidth) / 2;
    // Position from bottom
    const boxY = height - bottomMargin - boxHeight;

    // --- STYLE RENDERING ---

    if (style === 'BOXED') {
        // STYLE: BOXED (Standard)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; // Darker box
        
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, cornerRadius);
        ctx.fill();

        // Reset Shadow for Text to ensure crispness
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#FFFFFF';
    } 
    else if (style === 'OUTLINE') {
        // STYLE: OUTLINE (Meme / TikTok standard)
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.round(6 * scaleFactor);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        
        // No box, just text
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    }
    else if (style === 'HIGHLIGHT') {
        // STYLE: HIGHLIGHT (Pop style - Yellow text, black shadow)
        ctx.fillStyle = '#FFEB3B'; // Vibrant Yellow
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.round(4 * scaleFactor);
        
        // Hard drop shadow
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = Math.round(4 * scaleFactor);
        ctx.shadowOffsetY = Math.round(4 * scaleFactor);
    }
    else if (style === 'MINIMAL') {
        // STYLE: MINIMAL (Clean white text, subtle shadow, no box)
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = Math.round(8 * scaleFactor);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
    }

    // DRAW TEXT LINES
    let textY = boxY + padding + (lineHeight / 2); // Start drawing
    if (style !== 'BOXED') {
        // If no box, adjust Y to be roughly same baseline
        textY = height - bottomMargin - (lines.length * lineHeight) + (lineHeight / 2);
    }

    lines.forEach((line, index) => {
        const lineY = textY + (index * lineHeight);
        
        if (style === 'OUTLINE') {
            ctx.strokeText(line, width / 2, lineY);
            ctx.fillText(line, width / 2, lineY);
        } else if (style === 'HIGHLIGHT') {
            ctx.strokeText(line, width / 2, lineY);
            ctx.fillText(line, width / 2, lineY);
        } else {
            ctx.fillText(line, width / 2, lineY);
        }
    });
};

/**
 * Stitches images and audio into a video CLIENT-SIDE using HTML5 Canvas and MediaRecorder.
 * Now supports per-scene timing based on audio duration.
 */
export const stitchVideoFrames = async (
  scenes: AdvancedScene[], 
  globalAudioUrl: string | undefined, 
  defaultDurationPerImageMs: number = 5000,
  targetWidth?: number,
  targetHeight?: number,
  backgroundAudioUrl?: string,
  captionSettings?: CaptionSettings,
  animationStyle: 'ZOOM' | 'PAN' | 'STATIC' = 'ZOOM'
): Promise<string> => {
  console.log("Starting client-side video stitching...");

  return new Promise(async (resolve, reject) => {
    // Safety timeout - Increased for long videos
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out."));
    }, 1200000); // 20 mins

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

        // 2. Prepare Audio Context
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const dest = audioContext.createMediaStreamDestination();

        // 3. Process Scenes & Timing
        // We need to calculate duration for each scene BEFORE rendering loop.
        const sceneMeta: { durationMs: number, startMs: number, audioBuf?: AudioBuffer }[] = [];
        let accumulatedMs = 0;

        // Preload images
        const loadedImages = await Promise.all(scenes.map(s => loadImage(s.imageUrl)));

        // Preload and schedule audio
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let duration = defaultDurationPerImageMs;
            let buffer: AudioBuffer | undefined = undefined;

            // If scene has specific audio, load it and use its duration
            if (scene.audioUrl) {
                try {
                    buffer = await loadAudioBuffer(audioContext, scene.audioUrl);
                    // Extend duration to fit audio, with 1s buffer if needed
                    const audioDurationMs = buffer.duration * 1000;
                    // Ensure minimum 1 second or match audio
                    duration = Math.max(1000, audioDurationMs);
                } catch(e) {
                    console.warn(`Failed to load audio for scene ${i}, using default duration.`);
                }
            } else if (globalAudioUrl) {
                // If using one global file, we blindly split time (legacy mode)
                // Assuming global audio is already loaded elsewhere or passed
                // For logic consistency, we stick to default duration here if global
            }

            // Schedule audio node if buffer exists
            if (buffer) {
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(dest);
                source.start(accumulatedMs / 1000);
            }

            sceneMeta.push({
                durationMs: duration,
                startMs: accumulatedMs,
                audioBuf: buffer
            });
            accumulatedMs += duration;
        }

        // Handle Global/Background Audio
        if (globalAudioUrl && !scenes.some(s => s.audioUrl)) {
             try {
                const buf = await loadAudioBuffer(audioContext, globalAudioUrl);
                const source = audioContext.createBufferSource();
                source.buffer = buf;
                source.connect(dest);
                source.start(0);
                // Adjust total duration if global audio is longer? 
                // Usually visual drives duration in this mode.
             } catch(e) { console.warn("Global audio fail"); }
        }

        if (backgroundAudioUrl) {
            try {
                const buf = await loadAudioBuffer(audioContext, backgroundAudioUrl);
                const bgSource = audioContext.createBufferSource();
                bgSource.buffer = buf;
                bgSource.loop = true;
                const bgGain = audioContext.createGain();
                bgGain.gain.value = 0.12; 
                bgSource.connect(bgGain);
                bgGain.connect(dest);
                bgSource.start(0);
            } catch(e) { console.warn("BG audio fail"); }
        }

        // 4. Prepare Recorder
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const combinedTracks = [...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
        const combinedStream = new MediaStream(combinedTracks);
        
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4' 
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

        // 5. Start Recording loop
        recorder.start();
        
        // Loop Vars
        const fps = 30;
        let currentSceneIdx = 0;
        let sceneStartTime = performance.now(); // For delta timing within rendering logic (simulated)
        let totalElapsedMs = 0;
        let startRenderTime = performance.now();

        const drawFrame = () => {
            // Check limits
            if (currentSceneIdx >= scenes.length || recorder.state === 'inactive') {
                recorder.stop();
                return;
            }

            const scene = scenes[currentSceneIdx];
            const meta = sceneMeta[currentSceneIdx];
            const img = loadedImages[currentSceneIdx];
            
            // Calculate progress in current scene
            const sceneProgress = (totalElapsedMs - meta.startMs) / meta.durationMs;
            
            // --- ANIMATION LOGIC ---
            // Common scaling setup
            let scale = 1.0;
            let translateX = 0;
            let translateY = 0;

            if (animationStyle === 'ZOOM') {
                // Ken Burns Zoom In
                scale = 1.0 + (sceneProgress * 0.15); // Zoom from 1.0 to 1.15
            } else if (animationStyle === 'PAN') {
                // Gentle Pan
                scale = 1.15; // Start slightly zoomed in
                const panRange = width * 0.05;
                // Pan direction alternates
                const direction = currentSceneIdx % 2 === 0 ? 1 : -1;
                translateX = (sceneProgress * panRange * direction) - (panRange / 2 * direction);
            } else {
                // STATIC
                scale = 1.0;
            }

            // Draw Background
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);

            // Draw Image with Transform
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.scale(scale, scale);
            ctx.translate(-width / 2, -height / 2);
            ctx.translate(translateX, translateY);

            const imgRatio = img.naturalWidth / img.naturalHeight;
            const canvasRatio = width / height;
            let renderW, renderH, offsetX, offsetY;

            // Cover logic
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
            drawCaptions(ctx, scene.text, width, height, captionSettings);

            // Time Management
            // We increment fixed time step for smooth video file even if render is slow
            const msPerFrame = 1000 / fps;
            totalElapsedMs += msPerFrame;

            // Check if scene complete
            if (totalElapsedMs >= meta.startMs + meta.durationMs) {
                currentSceneIdx++;
            }

            // Request next frame
            // To prevent browser throttling, we can use a tight loop with setImmediate/setTimeout(0) in a Worker,
            // but for main thread, we try to align with AF. 
            // However, MediaRecorder captures real-time. If we draw faster than real-time, it might look fast.
            // We need to sync our "virtual" totalElapsedMs with "wall clock" time to ensure MediaRecorder records proper speed.
            
            const wallClockElapsed = performance.now() - startRenderTime;
            const drift = totalElapsedMs - wallClockElapsed;
            
            if (drift > 0) {
                setTimeout(() => requestAnimationFrame(drawFrame), drift);
            } else {
                requestAnimationFrame(drawFrame);
            }
        };

        requestAnimationFrame(drawFrame);

    } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
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
        // Concatenating 20 mins can take time, set a safe timeout
        const timeoutId = setTimeout(() => {
            reject(new Error("Concatenation timed out."));
        }, 1200000); 

        try {
            const canvas = document.createElement('canvas');
            // CRITICAL: Explicitly set canvas size to match the target resolution.
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("No ctx");

            // Optional Background Audio (Global Narration or Music)
            let audioContext: AudioContext | null = null;
            let dest: MediaStreamAudioDestinationNode | null = null;
            let bgSource: AudioBufferSourceNode | null = null;
            
            if (backgroundAudioUrl) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                const response = await fetch(backgroundAudioUrl);
                const ab = await response.arrayBuffer();
                const buffer = await audioContext.decodeAudioData(ab);
                
                dest = audioContext.createMediaStreamDestination();
                bgSource = audioContext.createBufferSource();
                bgSource.buffer = buffer;
                bgSource.connect(dest);
                // Don't connect to speaker to avoid echo during render
            }

            const stream = canvas.captureStream(30);
            const tracks = [...stream.getVideoTracks()];
            if (dest) tracks.push(...dest.stream.getAudioTracks());
            
            const combinedStream = new MediaStream(tracks);
            const recorder = new MediaRecorder(combinedStream, {
                // Ensure high enough bitrate for quality, especially for 1080p
                videoBitsPerSecond: 5000000 // 5 Mbps
            });
            
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                 clearTimeout(timeoutId);
                 const blob = new Blob(chunks, { type: 'video/webm' });
                 resolve(URL.createObjectURL(blob));
                 if (audioContext) audioContext.close();
            };

            recorder.start();
            if (bgSource) bgSource.start(0);

            // Sequential Playback
            for (const url of videoUrls) {
                try {
                    const vid = await loadVideo(url);
                    
                    // Note: vid.width/height might be 0 until metadata loaded, but loadVideo promise handles that.
                    // We must ensure the source video fits into our target canvas dimensions.
                    
                    await vid.play();
                    
                    // Robust duration handling for infinite/NaN durations
                    const safeDuration = (Number.isFinite(vid.duration) && vid.duration > 0) ? vid.duration : 10;
                    
                    await new Promise<void>((res) => {
                        const draw = () => {
                            if (vid.paused || vid.ended) {
                                res();
                                return;
                            }
                            
                            // FORCE DRAW to fill canvas dimensions.
                            // This acts as a resize if the chunk resolution is slightly off.
                            // Use 'cover' logic if aspect ratios differ? 
                            // For simplicity in concatenation, we assume fill (stretch) or strict fit is desired.
                            // Usually chunks are generated with same AR, so exact fill is safe.
                            ctx.drawImage(vid, 0, 0, width, height);
                            requestAnimationFrame(draw);
                        };
                        
                        // Safety timeout per clip
                        const safety = setTimeout(() => {
                            if(!vid.paused) vid.pause();
                            res(); 
                        }, (safeDuration * 1000) + 2000); 

                        draw();
                        
                        vid.onended = () => {
                            clearTimeout(safety);
                            res();
                        };
                    });
                } catch(err) {
                    console.error("Skipping corrupted chunk", err);
                }
            }

            recorder.stop();

        } catch (e) {
            clearTimeout(timeoutId);
            reject(e);
        }
    });
};

export const cropVideo = async (videoUrl: string, targetW: number, targetH: number): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const video = await loadVideo(videoUrl);
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if(!ctx) throw new Error("No ctx");

            const stream = canvas.captureStream(30);
            
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const actx = new AudioContextClass();
            const dest = actx.createMediaStreamDestination();
            const source = actx.createMediaElementSource(video);
            source.connect(dest);
            source.connect(actx.destination);

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
                const sx = (video.videoWidth - targetW)/2;
                const sy = (video.videoHeight - targetH)/2;
                ctx.drawImage(video, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
                requestAnimationFrame(draw);
            };
            draw();

        } catch(e) { reject(e); }
    });
};
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
