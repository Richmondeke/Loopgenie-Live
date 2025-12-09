
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

// Robust Image Loader with Fallback
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn(`Failed to load image: ${src}. Using placeholder.`);
            // Fallback placeholder to prevent render crash
            img.src = 'https://via.placeholder.com/1080x1920/000000/FFFFFF?text=Image+Load+Error';
            // Remove onerror to prevent loop if placeholder fails (unlikely)
            img.onerror = null; 
            resolve(img);
        };
        img.src = src;
    });
};

// Helper to load video
const loadVideo = (src: string): Promise<HTMLVideoElement> => {
    return new Promise((resolve, reject) => {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = src;
        vid.muted = true; 
        vid.playsInline = true; // Important for mobile
        vid.onloadedmetadata = () => resolve(vid);
        vid.onerror = (e) => {
            console.warn("Video load error", e);
            reject(e);
        };
        vid.load();
    });
};

// Helper to get audio buffer with safety checks
const loadAudioBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer | null> => {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Audio fetch failed: ${res.statusText}`);
        const buf = await res.arrayBuffer();
        return await ctx.decodeAudioData(buf);
    } catch (e) {
        console.warn("Audio decode failed", e);
        return null;
    }
};

const drawCaptions = (
    ctx: CanvasRenderingContext2D, 
    text: string, 
    width: number, 
    height: number,
    settings?: CaptionSettings
) => {
    if (!text || (settings && settings.enabled === false)) return;

    const style = settings?.style || 'BOXED';
    const referenceDimension = 1080; 
    const currentMinDimension = Math.min(width, height);
    const scaleFactor = currentMinDimension / referenceDimension;

    const baseFontSize = style === 'HIGHLIGHT' ? 64 : 56;
    const fontSize = Math.round(baseFontSize * scaleFactor); 
    const lineHeight = fontSize * 1.25;
    const padding = Math.round(24 * scaleFactor);
    const cornerRadius = Math.round(16 * scaleFactor);
    const bottomMargin = Math.round(120 * scaleFactor);
    const shadowBlur = Math.round(4 * scaleFactor);
    const maxWidth = width - (200 * scaleFactor); 

    const fontWeight = style === 'MINIMAL' ? '500' : '800';
    ctx.font = `${fontWeight} ${fontSize}px Manrope, Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

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

    const widestLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const boxWidth = widestLineWidth + (padding * 2);
    const boxHeight = (lines.length * lineHeight) + (padding * 1.5); 
    
    const boxX = (width - boxWidth) / 2;
    const boxY = height - bottomMargin - boxHeight;

    if (style === 'BOXED') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; 
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, cornerRadius);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#FFFFFF';
    } else if (style === 'OUTLINE') {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.round(6 * scaleFactor);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    } else if (style === 'HIGHLIGHT') {
        ctx.fillStyle = '#FFEB3B'; 
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.round(4 * scaleFactor);
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = Math.round(4 * scaleFactor);
        ctx.shadowOffsetY = Math.round(4 * scaleFactor);
    } else if (style === 'MINIMAL') {
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = Math.round(8 * scaleFactor);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
    }

    let textY = style === 'BOXED' ? boxY + padding + (lineHeight / 2) : height - bottomMargin - (lines.length * lineHeight) + (lineHeight / 2);

    lines.forEach((line, index) => {
        const lineY = textY + (index * lineHeight);
        if (style === 'OUTLINE' || style === 'HIGHLIGHT') {
            ctx.strokeText(line, width / 2, lineY);
            ctx.fillText(line, width / 2, lineY);
        } else {
            ctx.fillText(line, width / 2, lineY);
        }
    });
};

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
  console.log("Starting client-side video stitching (v4 - global audio support)...");

  return new Promise(async (resolve, reject) => {
    // 5 Minute Safety Timeout
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out."));
    }, 300000);

    let audioContext: AudioContext | null = null;

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false }); 
        if (!ctx) throw new Error("Could not get canvas context");

        // 1. Determine Dimensions
        let width = targetWidth || 1080;
        let height = targetHeight || 1920;

        if (!targetWidth || !targetHeight) {
             try {
                const firstImage = await loadImage(scenes[0].imageUrl);
                width = targetWidth || firstImage.naturalWidth || 1080;
                height = targetHeight || firstImage.naturalHeight || 1920;
            } catch (e) { console.warn("Sizing fallback"); }
        }
        
        // Ensure even dimensions for Codec compatibility
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 2) * 2;

        canvas.width = width;
        canvas.height = height;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // 2. Setup Audio
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextClass();
        if (audioContext.state === 'suspended') await audioContext.resume();

        const dest = audioContext.createMediaStreamDestination();

        // 3. Load Global Audio (Voiceover)
        let globalBuffer: AudioBuffer | null = null;
        if (globalAudioUrl) {
            globalBuffer = await loadAudioBuffer(audioContext, globalAudioUrl);
        }

        // 4. Preload & Calculate Timeline
        interface SceneTimeline {
            index: number;
            startMs: number;
            endMs: number;
            durationMs: number;
            img: HTMLImageElement;
            text: string;
        }

        const timeline: SceneTimeline[] = [];
        let accumulatedMs = 0;
        
        // Parallel load of images to speed up start
        const loadedImages = await Promise.all(scenes.map(s => loadImage(s.imageUrl)));
        
        // Calculate total text length for distribution if using global audio
        const totalTextLength = scenes.reduce((acc, s) => acc + (s.text || "").length, 0);

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let duration = defaultDurationPerImageMs;
            let audioBuffer: AudioBuffer | null = null;

            // Scenario A: Scene has explicit audio (takes precedence)
            if (scene.audioUrl) {
                audioBuffer = await loadAudioBuffer(audioContext, scene.audioUrl);
                if (audioBuffer) {
                    duration = Math.max(2000, (audioBuffer.duration * 1000) + 300);
                }
            } 
            // Scenario B: Global audio exists, distribute duration by text length
            else if (globalBuffer && totalTextLength > 0) {
                const ratio = (scene.text || "").length / totalTextLength;
                const globalDurationMs = globalBuffer.duration * 1000;
                // Minimum 1.5s per scene to ensure visibility
                duration = Math.max(1500, globalDurationMs * ratio);
            }

            // Schedule Individual Audio Playback (if Scene Audio)
            const START_OFFSET_S = 0.1; 
            const scheduleTime = audioContext.currentTime + START_OFFSET_S + (accumulatedMs / 1000);

            if (audioBuffer) {
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(dest);
                source.start(scheduleTime);
            }

            timeline.push({
                index: i,
                startMs: accumulatedMs,
                endMs: accumulatedMs + duration,
                durationMs: duration,
                img: loadedImages[i],
                text: scene.text
            });

            accumulatedMs += duration;
        }

        const totalDurationMs = accumulatedMs;

        // Schedule Global Audio Playback (if Global Audio)
        if (globalBuffer) {
             const source = audioContext.createBufferSource();
             source.buffer = globalBuffer;
             source.connect(dest);
             // Start at the beginning
             source.start(audioContext.currentTime + 0.1); 
        }

        // Background Music
        if (backgroundAudioUrl) {
            const buf = await loadAudioBuffer(audioContext, backgroundAudioUrl);
            if (buf) {
                const bgSource = audioContext.createBufferSource();
                bgSource.buffer = buf;
                bgSource.loop = true;
                const bgGain = audioContext.createGain();
                bgGain.gain.value = 0.15;
                bgSource.connect(bgGain);
                bgGain.connect(dest);
                bgSource.start(audioContext.currentTime + 0.1);
            }
        }

        // 5. Start Recording
        const canvasStream = canvas.captureStream(30); 
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
            videoBitsPerSecond: 3500000 // 3.5 Mbps
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

        // Start recorder
        recorder.start();
        
        // 6. Render Loop
        const startTime = performance.now();
        
        const renderLoop = () => {
            const now = performance.now();
            const elapsed = now - startTime;

            // Stop condition
            if (elapsed >= totalDurationMs) {
                recorder.stop();
                return;
            }

            // Find current scene based on time
            const activeScene = timeline.find(t => elapsed >= t.startMs && elapsed < t.endMs);

            if (activeScene) {
                const sceneProgress = (elapsed - activeScene.startMs) / activeScene.durationMs;
                const { img, text, index } = activeScene;

                // --- Animation Logic ---
                let scale = 1.0;
                let translateX = 0;
                let translateY = 0;

                if (animationStyle === 'ZOOM') {
                    // Smooth Zoom In
                    scale = 1.0 + (sceneProgress * 0.15); 
                } else if (animationStyle === 'PAN') {
                    // Alternating Pan
                    scale = 1.15; 
                    const panRange = width * 0.05;
                    const direction = index % 2 === 0 ? 1 : -1;
                    translateX = (sceneProgress * panRange * direction) - (panRange / 2 * direction);
                }

                // Clear & Fill Background
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, height);

                if (img && img.complete && img.naturalWidth > 0) {
                    ctx.save();
                    ctx.translate(width / 2, height / 2);
                    ctx.scale(scale, scale);
                    ctx.translate(-width / 2, -height / 2);
                    ctx.translate(translateX, translateY);

                    // Aspect Ratio Cover Logic
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
                }

                // Captions
                drawCaptions(ctx, text, width, height, captionSettings);
            }

            requestAnimationFrame(renderLoop);
        };

        renderLoop();

    } catch (err) {
        clearTimeout(timeoutId);
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
        reject(err);
    }
  });
};

export const concatenateVideos = async (
    videoUrls: string[], 
    width: number = 1280, 
    height: number = 720,
    backgroundAudioUrl?: string
): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error("Concatenation timed out."));
        }, 1200000); 

        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("No ctx");

            let audioContext: AudioContext | null = null;
            let dest: MediaStreamAudioDestinationNode | null = null;
            let bgSource: AudioBufferSourceNode | null = null;
            
            if (backgroundAudioUrl) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                if (audioContext.state === 'suspended') await audioContext.resume();

                const response = await fetch(backgroundAudioUrl);
                const ab = await response.arrayBuffer();
                const buffer = await audioContext.decodeAudioData(ab);
                
                dest = audioContext.createMediaStreamDestination();
                bgSource = audioContext.createBufferSource();
                bgSource.buffer = buffer;
                bgSource.connect(dest);
            }

            const stream = canvas.captureStream(30);
            const tracks = [...stream.getVideoTracks()];
            if (dest) tracks.push(...dest.stream.getAudioTracks());
            
            const combinedStream = new MediaStream(tracks);
            const recorder = new MediaRecorder(combinedStream, {
                videoBitsPerSecond: 3500000 // 3.5 Mbps
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

            for (const url of videoUrls) {
                try {
                    const vid = await loadVideo(url);
                    await vid.play();
                    
                    const safeDuration = (Number.isFinite(vid.duration) && vid.duration > 0) ? vid.duration : 10;
                    
                    await new Promise<void>((res) => {
                        const draw = () => {
                            if (vid.paused || vid.ended) {
                                res();
                                return;
                            }
                            ctx.drawImage(vid, 0, 0, width, height);
                            requestAnimationFrame(draw);
                        };
                        
                        const safety = setTimeout(() => {
                            if(!vid.paused) vid.pause();
                            res(); 
                        }, (safeDuration * 1000) + 1000); 

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
            if (actx.state === 'suspended') await actx.resume();

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

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') await audioContext.resume();

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
