
import { proxyAsset } from "./geminiService";

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
const loadImage = async (src: string): Promise<HTMLImageElement> => {
    // Proxy the image if it's remote to avoid CORS
    const proxiedSrc = await proxyAsset(src);

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
        img.src = proxiedSrc;
    });
};

// Helper to load video
const loadVideo = async (src: string): Promise<HTMLVideoElement> => {
    // Proxy the video if it's remote to avoid CORS
    const proxiedSrc = await proxyAsset(src);

    return new Promise((resolve, reject) => {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.src = proxiedSrc;
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';

        let resolved = false;
        const checkDuration = () => {
            if (resolved) return;
            if (Number.isFinite(vid.duration) && vid.duration > 0 && vid.readyState >= 3) {
                resolved = true;
                resolve(vid);
            }
        };

        vid.onloadedmetadata = checkDuration;
        vid.oncanplay = checkDuration;
        vid.oncanplaythrough = checkDuration;

        vid.onerror = (e) => {
            if (resolved) return;
            console.warn("Video load error", e);
            reject(e);
        };

        // Fallback resolve after 5s if still loading but potentially playable
        setTimeout(() => {
            if (!resolved) {
                console.warn("Video load timeout reached, resolving as-is for", src);
                resolved = true;
                resolve(vid);
            }
        }, 5000);

        vid.load();
    });
};

// Helper to get audio buffer with safety checks
const loadAudioBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer | null> => {
    try {
        // Proxy the audio if it's remote to avoid CORS
        const proxiedUrl = await proxyAsset(url);
        const res = await fetch(proxiedUrl);
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
    console.log("Starting client-side video stitching (v5 - MP4 priority)...");

    return new Promise(async (resolve, reject) => {
        // 5 Minute Safety Timeout
        const timeoutId = setTimeout(() => {
            console.error("[ffmpegService] stitchVideoFrames TIMEOUT reached (300s)");
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
                asset: HTMLImageElement | HTMLVideoElement;
                type: 'image' | 'video';
                text: string;
            }

            const timeline: SceneTimeline[] = [];
            let accumulatedMs = 0;

            // Parallel load of assets to speed up start
            const loadedAssets = await Promise.all(scenes.map(async s => {
                const isVideo = s.imageUrl.toLowerCase().includes('.mp4') || s.imageUrl.toLowerCase().includes('video');
                try {
                    if (isVideo) {
                        return { asset: await loadVideo(s.imageUrl), type: 'video' as const };
                    } else {
                        return { asset: await loadImage(s.imageUrl), type: 'image' as const };
                    }
                } catch (e) {
                    console.error("Failed to load asset, fallback to image placeholder", s.imageUrl);
                    return { asset: await loadImage('https://via.placeholder.com/1080x1920/000000/FFFFFF?text=Load+Error'), type: 'image' as const };
                }
            }));

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
                    asset: loadedAssets[i].asset,
                    type: loadedAssets[i].type,
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

            // CRITICAL: PRIORITIZE COMPATIBILITY
            const mimeTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'video/mp4;codecs=h264,aac',
                'video/mp4'
            ];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

            const recorder = new MediaRecorder(combinedStream, {
                mimeType: selectedMime,
                videoBitsPerSecond: 5000000 // 5 Mbps for higher quality
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                clearTimeout(timeoutId);
                const blob = new Blob(chunks, { type: selectedMime });
                const url = URL.createObjectURL(blob);
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
                resolve(url);
            };

            // Start recorder with timeslice
            recorder.start(100);

            // 6. Render Loop
            const startTime = performance.now();

            const renderLoop = () => {
                const now = performance.now();
                const elapsed = now - startTime;

                // Stop condition
                if (elapsed >= totalDurationMs) {
                    if (recorder.state !== 'inactive') recorder.stop();
                    return;
                }

                // Find current scene based on time
                const activeScene = timeline.find(t => elapsed >= t.startMs && elapsed < t.endMs);

                if (activeScene) {
                    const sceneProgress = (elapsed - activeScene.startMs) / activeScene.durationMs;
                    const { asset, type, text, index } = activeScene;

                    // --- Animation Logic ---
                    let scale = 1.0;
                    let translateX = 0;
                    let translateY = 0;

                    if (animationStyle === 'ZOOM') {
                        scale = 1.0 + (sceneProgress * 0.15);
                    } else if (animationStyle === 'PAN') {
                        scale = 1.15;
                        const panRange = width * 0.05;
                        const direction = index % 2 === 0 ? 1 : -1;
                        translateX = (sceneProgress * panRange * direction) - (panRange / 2 * direction);
                    }

                    // Clear & Fill Background
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, width, height);

                    if (type === 'video') {
                        const vid = asset as HTMLVideoElement;
                        // Sync video time with scene progress
                        if (vid.duration) {
                            vid.currentTime = sceneProgress * vid.duration;
                        }

                        ctx.save();
                        ctx.translate(width / 2, height / 2);
                        ctx.scale(scale, scale);
                        ctx.translate(-width / 2, -height / 2);
                        ctx.translate(translateX, translateY);

                        const imgRatio = vid.videoWidth / vid.videoHeight;
                        const canvasRatio = width / height;
                        let renderW, renderH, offsetX, offsetY;

                        if (imgRatio > canvasRatio) {
                            renderH = height;
                            renderW = height * imgRatio;
                            offsetX = -(renderW - width) / 2;
                        } else {
                            renderW = width;
                            renderH = width / imgRatio;
                            offsetX = 0;
                            offsetY = -(renderH - height) / 2;
                        }
                        ctx.drawImage(vid, offsetX, offsetY, renderW, renderH);
                        ctx.restore();
                    } else {
                        const img = asset as HTMLImageElement;
                        if (img && img.complete && img.naturalWidth > 0) {
                            ctx.save();
                            ctx.translate(width / 2, height / 2);
                            ctx.scale(scale, scale);
                            ctx.translate(-width / 2, -height / 2);
                            ctx.translate(translateX, translateY);

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
                    }

                    // Captions
                    drawCaptions(ctx, text, width, height, captionSettings);
                }

                requestAnimationFrame(renderLoop);
            };

            console.log(`[ffmpegService] Starting render loop for ${scenes.length} scenes. Total duration: ${totalDurationMs}ms`);
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
            console.error("[ffmpegService] concatenateVideos TIMEOUT reached (1200s)");
            reject(new Error("Concatenation timed out."));
        }, 1200000);

        try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) throw new Error("No ctx");

            // Initial black frame to ensure stream starts with data
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') await audioContext.resume();
            const dest = audioContext.createMediaStreamDestination();

            // Background Music
            if (backgroundAudioUrl) {
                try {
                    const proxiedBgUrl = await proxyAsset(backgroundAudioUrl);
                    const response = await fetch(proxiedBgUrl);
                    const ab = await response.arrayBuffer();
                    const buffer = await audioContext.decodeAudioData(ab);

                    const bgSource = audioContext.createBufferSource();
                    bgSource.buffer = buffer;
                    bgSource.loop = true;
                    bgSource.connect(dest);
                    bgSource.start(0);
                } catch (e) {
                    console.warn("Background audio failed to load", e);
                }
            }

            const canvasStream = canvas.captureStream(30);
            const tracks = [...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            const mimeTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'video/mp4;codecs=h264,aac',
                'video/mp4'
            ];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

            const recorder = new MediaRecorder(combinedStream, {
                mimeType: selectedMime,
                videoBitsPerSecond: 5000000
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                clearTimeout(timeoutId);
                const blob = new Blob(chunks, { type: selectedMime });
                resolve(URL.createObjectURL(blob));
                if (audioContext) audioContext.close();
            };

            // Start recorder with timeslice to ensure data flushes
            recorder.start(100);

            for (const url of videoUrls) {
                try {
                    console.log(`[ffmpegService] Concatenating clip: ${url}`);
                    const vid = await loadVideo(url);

                    // Route video audio to MediaStream
                    // Note: Chrome requires user interaction for AudioContext, 
                    // which is usually true if this is triggered by a button click.
                    const sourceNode = audioContext.createMediaElementSource(vid);
                    sourceNode.connect(dest);

                    // Autoplay compliance: keep muted while playing, 
                    // createMediaElementSource still captures the stream.
                    vid.muted = true;
                    vid.playsInline = true;

                    try {
                        await vid.play();
                    } catch (playErr) {
                        console.warn("Play failed (possibly autoplay policy), attempting to proceed anyway", playErr);
                    }

                    const safeDuration = (Number.isFinite(vid.duration) && vid.duration > 0) ? vid.duration : 5;
                    const startTime = Date.now();

                    await new Promise<void>((res) => {
                        let isDone = false;

                        const draw = () => {
                            if (isDone) return;

                            // We check ended or elapsed time. 
                            // Avoid checking vid.paused here because it might be true if play() was blocked,
                            // but we still want to TRY drawing whatever is available.
                            if (vid.ended || (Date.now() - startTime) > (safeDuration * 1000 + 1000)) {
                                if (!isDone) {
                                    isDone = true;
                                    sourceNode.disconnect();
                                    res();
                                }
                                return;
                            }

                            ctx.drawImage(vid, 0, 0, width, height);
                            requestAnimationFrame(draw);
                        };

                        vid.onended = () => {
                            if (!isDone) {
                                isDone = true;
                                sourceNode.disconnect();
                                res();
                            }
                        };

                        // Safety timeout
                        const safety = setTimeout(() => {
                            if (!isDone) {
                                console.warn("Scene safety timeout reached for", url);
                                isDone = true;
                                sourceNode.disconnect();
                                res();
                            }
                        }, (safeDuration * 1000) + 2000);

                        draw();
                    });
                } catch (err) {
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
            if (!ctx) throw new Error("No ctx");

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

            const mimeTypes = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

            const recorder = new MediaRecorder(combined, { mimeType: selectedMime });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: selectedMime });
                resolve(URL.createObjectURL(blob));
                actx.close();
            };

            recorder.start(100);
            await video.play();

            const draw = () => {
                if (video.paused || video.ended) {
                    if (recorder.state !== 'inactive') recorder.stop();
                    return;
                }
                const sx = (video.videoWidth - targetW) / 2;
                const sy = (video.videoHeight - targetH) / 2;
                ctx.drawImage(video, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
                requestAnimationFrame(draw);
            };
            draw();

        } catch (e) { reject(e); }
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

            const proxiedAudioUrl = await proxyAsset(audioUrl);
            const response = await fetch(proxiedAudioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const dest = audioContext.createMediaStreamDestination();
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(dest);

            const stream = canvas.captureStream(30);
            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            const mimeTypes = ['video/mp4', 'video/webm;codecs=h264', 'video/webm'];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

            const recorder = new MediaRecorder(combinedStream, { mimeType: selectedMime });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: selectedMime });
                resolve(URL.createObjectURL(blob));
                audioContext.close();
            };

            recorder.start(100);
            sourceNode.start(0);
            await video.play();

            const draw = () => {
                if (video.paused || video.ended) {
                    if (recorder.state !== 'inactive') recorder.stop();
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
