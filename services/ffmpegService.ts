


export interface VideoScene {
    imageUrl: string;
    text: string;
}

/**
 * Stitches images and audio into a video CLIENT-SIDE using HTML5 Canvas and MediaRecorder.
 * Features:
 * - Ken Burns Effect (Slow Zoom)
 * - Professional Captioning with Wrapping and Backgrounds
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
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out. Try a shorter duration."));
    }, 90000); // 90s timeout

    try {
        // 1. Prepare Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error("Could not get canvas context");

        // Determine size
        let firstImgDims = { w: 1280, h: 720 };
        try {
            const firstImage = await loadImage(scenes[0].imageUrl);
            firstImgDims = { w: firstImage.naturalWidth, h: firstImage.naturalHeight };
        } catch (e) {
            console.warn("Could not load first image to determine dims, using default 720p");
        }
        
        canvas.width = targetWidth || firstImgDims.w;
        canvas.height = targetHeight || firstImgDims.h;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Prepare Audio
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
                }
                
                dest = audioContext.createMediaStreamDestination();
                sourceNode = audioContext.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(dest);
            } catch (e) {
                console.error("Error preparing audio:", e);
            }
        }

        // 3. Prepare Recorder
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const combinedTracks = [...canvasStream.getVideoTracks()];
        
        if (dest) {
            const audioTracks = dest.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                combinedTracks.push(audioTracks[0]);
            }
        }
        
        const combinedStream = new MediaStream(combinedTracks);
        
        // Mime Type Selection
        const mimeTypes = ['video/webm; codecs=vp9', 'video/webm', 'video/mp4'];
        let mimeType = 'video/webm';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }

        const recorder = new MediaRecorder(combinedStream, { 
            mimeType, 
            videoBitsPerSecond: 3000000 // 3 Mbps
        });
        
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            clearTimeout(timeoutId);
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            if (sourceNode) { try { sourceNode.stop(); } catch(e) {} }
            if (audioContext) { try { audioContext.close(); } catch(e) {} }
            resolve(url);
        };

        recorder.start(1000);
        
        if (sourceNode && audioContext) {
            if (audioContext.state === 'suspended') await audioContext.resume();
            sourceNode.start(0);
        }

        // 4. Draw Loop with Ken Burns + Captions
        for (const scene of scenes) {
            let img: HTMLImageElement;
            try {
                img = await loadImage(scene.imageUrl);
            } catch (err) {
                console.warn(`Failed to load image.`, err);
                continue; 
            }
            
            const startTime = Date.now();
            
            // Render loop for this scene
            while (Date.now() - startTime < durationPerImageMs) {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / durationPerImageMs; // 0 to 1

                // --- KEN BURNS EFFECT ---
                // Slowly zoom from 1.0 to 1.15
                const zoomFactor = 1.0 + (progress * 0.15); 
                
                // Calculate dimensions of the "camera" on the source image
                const srcWidth = img.naturalWidth / zoomFactor;
                const srcHeight = img.naturalHeight / zoomFactor;
                
                // Center the crop
                const srcX = (img.naturalWidth - srcWidth) / 2;
                const srcY = (img.naturalHeight - srcHeight) / 2;

                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw crop to full canvas
                ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);

                // --- CAPTIONS ---
                if (scene.text) {
                    drawCaptions(ctx, scene.text, canvas.width, canvas.height);
                }
                
                // 30 FPS throttle
                await new Promise(r => setTimeout(r, 1000 / 30));
            }
        }

        // Buffer
        await new Promise(r => setTimeout(r, 500));
        recorder.stop();

    } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
    }
  });
};

/**
 * Concatenates multiple video URLs into a single video sequence.
 * Uses a hidden video element to play each source sequentially while recording the canvas.
 */
export const concatenateVideos = async (
    videoUrls: string[],
    targetWidth: number = 1280,
    targetHeight: number = 720
): Promise<string> => {
    console.log(`Starting concatenation of ${videoUrls.length} videos...`);
    
    return new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("Concatenation timeout")), 120000); // 2 mins

        try {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas context failed");
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Audio Context for mixing sound
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioContextClass();
            const dest = audioCtx.createMediaStreamDestination();

            // Video Element player
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.width = targetWidth;
            video.height = targetHeight;
            video.muted = false; // We want audio
            video.volume = 1;

            // Connect video audio to destination
            const sourceNode = audioCtx.createMediaElementSource(video);
            sourceNode.connect(dest);
            // Also connect to speakers if debugging? No, keep it silent for user.
            
            // Setup Recorder
            const canvasStream = canvas.captureStream(30);
            const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...dest.stream.getAudioTracks()
            ]);
            
            let mimeType = 'video/webm';
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) mimeType = 'video/webm; codecs=vp9';
            else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';

            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 4000000 });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                clearTimeout(timeoutId);
                const blob = new Blob(chunks, { type: mimeType });
                audioCtx.close();
                resolve(URL.createObjectURL(blob));
            };

            recorder.start();

            // Playback Loop
            for (const url of videoUrls) {
                await new Promise<void>((resScene, rejScene) => {
                    video.src = url;
                    
                    video.onloadedmetadata = () => {
                        video.play().catch(rejScene);
                        // Draw loop
                        const draw = () => {
                            if (video.paused || video.ended) return;
                            
                            // Aspect ratio fit
                            const vidRatio = video.videoWidth / video.videoHeight;
                            const targetRatio = canvas.width / canvas.height;
                            let renderW, renderH, offsetX, offsetY;

                            if (vidRatio > targetRatio) {
                                renderH = canvas.height;
                                renderW = video.videoWidth * (canvas.height / video.videoHeight);
                                offsetX = (canvas.width - renderW) / 2;
                                offsetY = 0;
                            } else {
                                renderW = canvas.width;
                                renderH = video.videoHeight * (canvas.width / video.videoWidth);
                                offsetX = 0;
                                offsetY = (canvas.height - renderH) / 2;
                            }
                            
                            ctx.fillStyle = '#000';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(video, offsetX, offsetY, renderW, renderH);
                            requestAnimationFrame(draw);
                        };
                        draw();
                    };

                    video.onended = () => resScene();
                    video.onerror = (e) => {
                        console.warn("Error playing segment:", e);
                        resScene(); // Skip invalid segment
                    };
                });
            }

            // Finish
            recorder.stop();

        } catch (e) {
            clearTimeout(timeoutId);
            reject(e);
        }
    });
};

/**
 * Draws text with wrapping and background box for visibility.
 * Positioned in lower third to avoid obscuring main visual but staying readable.
 */
function drawCaptions(ctx: CanvasRenderingContext2D, text: string, cvsWidth: number, cvsHeight: number) {
    const fontSize = Math.floor(cvsHeight * 0.05); // Responsive font size
    ctx.font = `bold ${fontSize}px "Inter", "Arial", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = cvsWidth * 0.85;
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

    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    
    // Position: Bottom area (e.g. 80% down)
    const yStart = cvsHeight * 0.85 - (totalTextHeight / 2);
    
    // Draw Background Box
    const padding = fontSize * 0.5;
    const boxWidth = maxWidth + (padding * 2); 
    const boxHeight = totalTextHeight + padding;
    const boxX = (cvsWidth - boxWidth) / 2;
    const boxY = yStart - (padding / 2);

    // Semi-transparent black box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; 
    ctx.beginPath();
    // Use simple rect for broader compatibility if roundRect missing, though most browsers have it
    if (ctx.roundRect) {
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
    } else {
        ctx.rect(boxX, boxY, boxWidth, boxHeight);
    }
    ctx.fill();

    // Draw Text
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    lines.forEach((line, i) => {
        ctx.fillText(line, cvsWidth / 2, yStart + (i * lineHeight) + (lineHeight/2));
    });

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

export const cropVideo = async (
    sourceUrl: string,
    targetWidth: number,
    targetHeight: number
): Promise<string> => {
    console.log(`Starting video crop to ${targetWidth}x${targetHeight}...`);

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
             reject(new Error("Video crop timed out. Network might be slow."));
        }, 60000);

        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.src = sourceUrl;
        video.muted = false;
        video.volume = 1;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            clearTimeout(timeoutId);
            reject(new Error("Canvas context not available"));
            return;
        }

        const canvasStream = canvas.captureStream(30);
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);

        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const mimeTypes = ['video/webm; codecs=vp9', 'video/webm', 'video/mp4'];
        let mimeType = 'video/webm';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            clearTimeout(timeoutId);
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            audioCtx.close();
            resolve(url);
        };

        const renderFrame = () => {
            if (video.paused || video.ended) return;
            const vidRatio = video.videoWidth / video.videoHeight;
            const targetRatio = canvas.width / canvas.height;
            let renderW, renderH, offsetX, offsetY;

            if (vidRatio > targetRatio) {
                renderH = canvas.height;
                renderW = video.videoWidth * (canvas.height / video.videoHeight);
                offsetX = (canvas.width - renderW) / 2;
                offsetY = 0;
            } else {
                renderW = canvas.width;
                renderH = video.videoHeight * (canvas.width / video.videoWidth);
                offsetX = 0;
                offsetY = (canvas.height - renderH) / 2;
            }
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, offsetX, offsetY, renderW, renderH);
            requestAnimationFrame(renderFrame);
        };

        video.onloadedmetadata = () => {
             recorder.start(1000);
             video.play();
             renderFrame();
        };
        video.onended = () => recorder.stop();
        video.onerror = (e) => reject(new Error("Error loading video source for crop."));
    });
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};
