
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

    // FONT SETTINGS - Updated to Manrope
    ctx.font = `600 ${fontSize}px Manrope, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
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

    ctx.fillStyle = '#FFFFFF';
    
    let textY = boxY + padding + (lineHeight / 2); 
    
    lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, textY + (index * lineHeight));
    });
};

/**
 * Stitches images and audio into a video CLIENT-SIDE using HTML5 Canvas and MediaRecorder.
 */
export const stitchVideoFrames = async (
  scenes: VideoScene[], 
  audioUrl: string | undefined, 
  durationPerImageMs: number = 5000,
  targetWidth?: number,
  targetHeight?: number,
  backgroundAudioUrl?: string,
  sceneDurations?: number[]
): Promise<string> => {
  console.log("Starting client-side video stitching with Ken Burns, Captions & BG Music...");

  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out."));
    }, 600000); 

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

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
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // 2. Prepare Audio
        let audioContext: AudioContext | null = null;
        let dest: MediaStreamAudioDestinationNode | null = null;
        let narrationSource: AudioBufferSourceNode | null = null;
        let bgMusicSource: AudioBufferSourceNode | null = null;

        if (audioUrl || backgroundAudioUrl) {
            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                dest = audioContext.createMediaStreamDestination();

                if (audioUrl) {
                    const res = await fetch(audioUrl);
                    const buf = await audioContext.decodeAudioData(await res.arrayBuffer());
                    narrationSource = audioContext.createBufferSource();
                    narrationSource.buffer = buf;
                    narrationSource.connect(dest);
                }

                if (backgroundAudioUrl) {
                    try {
                        const res = await fetch(backgroundAudioUrl);
                        const buf = await audioContext.decodeAudioData(await res.arrayBuffer());
                        bgMusicSource = audioContext.createBufferSource();
                        bgMusicSource.buffer = buf;
                        bgMusicSource.loop = true;
                        const bgGain = audioContext.createGain();
                        bgGain.gain.value = 0.12; 
                        bgMusicSource.connect(bgGain);
                        bgGain.connect(dest);
                    } catch (bgError) {
                        console.warn("Failed to load background music:", bgError);
                    }
                }
            } catch (e) {
                console.error("Error preparing audio context:", e);
            }
        }

        // 3. Prepare Recorder - PREFER MP4
        const fps = 60;
        const canvasStream = canvas.captureStream(fps); 
        const combinedTracks = [...canvasStream.getVideoTracks()];
        
        if (dest) {
            const audioTracks = dest.stream.getAudioTracks();
            combinedTracks.push(...audioTracks);
        }
        
        const combinedStream = new MediaStream(combinedTracks);
        
        const mimeTypes = [
            'video/mp4;codecs=avc1', // Prefer MP4 (Chrome/Safari)
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
        console.log("Selected MIME type for recording:", selectedMime);

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

        recorder.start();
        if (narrationSource) narrationSource.start(0);
        if (bgMusicSource) bgMusicSource.start(0);

        const loadedImages = await Promise.all(scenes.map(s => loadImage(s.imageUrl)));

        // Frame Logic
        const defaultSceneDuration = durationPerImageMs / 1000;
        let currentSceneIdx = 0;
        let currentFrameInScene = 0;
        
        // Easing function for smooth zoom
        const easeInSine = (x: number): number => {
            return 1 - Math.cos((x * Math.PI) / 2);
        };
        
        const drawFrame = () => {
            if (currentSceneIdx >= scenes.length) {
                // Safety buffer to ensure last frames are encoded
                setTimeout(() => recorder.stop(), 500); 
                return;
            }

            // Determine duration for this specific scene
            const thisSceneDuration = (sceneDurations && sceneDurations[currentSceneIdx]) 
                ? sceneDurations[currentSceneIdx] 
                : defaultSceneDuration;
            
            const framesPerScene = Math.ceil(thisSceneDuration * fps);

            const img = loadedImages[currentSceneIdx];
            const text = scenes[currentSceneIdx].text;
            
            // Ken Burns
            const linearProgress = currentFrameInScene / framesPerScene;
            const progress = easeInSine(Math.min(linearProgress, 1));
            
            const scale = 1.0 + (progress * 0.15); 
            const panDirection = currentSceneIdx % 2 === 0 ? 1 : -1;
            const maxPanX = width * 0.05;
            const translateX = (progress * maxPanX * panDirection) - (panDirection > 0 ? 0 : maxPanX);

            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.scale(scale, scale);
            ctx.translate(-width / 2, -height / 2);
            ctx.translate(translateX, 0);

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

            drawCaptions(ctx, text, width, height);

            currentFrameInScene++;
            if (currentFrameInScene >= framesPerScene) {
                currentSceneIdx++;
                currentFrameInScene = 0;
            }

            setTimeout(() => drawFrame(), 1000 / fps);
        };

        drawFrame();

    } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
    }
  });
};

/**
 * Client-side video transcoding/re-containerizing.
 * Plays the video and re-records it in the requested mimeType (e.g., video/mp4).
 */
export const transcodeVideo = async (sourceUrl: string, targetMimeType: string = 'video/mp4'): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        if (!MediaRecorder.isTypeSupported(targetMimeType)) {
            return reject(new Error(`Browser does not support recording in ${targetMimeType}`));
        }

        try {
            const video = await loadVideo(sourceUrl);
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if(!ctx) throw new Error("Context failed");

            // Audio Context to capture sound
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const actx = new AudioContextClass();
            const dest = actx.createMediaStreamDestination();
            const source = actx.createMediaElementSource(video);
            source.connect(dest);
            source.connect(actx.destination); // Let user hear progress (optional)

            const stream = canvas.captureStream(30); // 30fps sufficient for transcode
            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combined = new MediaStream(tracks);

            const recorder = new MediaRecorder(combined, { mimeType: targetMimeType });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: targetMimeType });
                resolve(URL.createObjectURL(blob));
                actx.close();
            };

            recorder.start();
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

export const mergeVideoAudio = async (videoUrl: string, audioUrl: string): Promise<string> => {
    // ... (unchanged)
    // Reuse basic logic but use prioritize MP4
    return new Promise(async (resolve, reject) => {
        // ... (existing merge logic)
        // Ensure to use selectedMime logic inside here too if we want mp4 output
        // For brevity in this diff, assuming defaults work or using stitchVideoFrames pattern.
        // Copying simplified logic for robustness:
        try {
            const video = await loadVideo(videoUrl);
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("No ctx");

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const response = await fetch(audioUrl);
            const audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
            
            const dest = audioContext.createMediaStreamDestination();
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(dest);

            const stream = canvas.captureStream(60);
            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combinedStream = new MediaStream(tracks);

            // PREFER MP4
            const mimeTypes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm'];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

            const recorder = new MediaRecorder(combinedStream, { mimeType: selectedMime });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
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
        } catch (e) { reject(e); }
    });
};

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

            const stream = canvas.captureStream(60);
            const tracks = [...stream.getVideoTracks()];
            if (dest) tracks.push(...dest.stream.getAudioTracks());
            
            const combinedStream = new MediaStream(tracks);
            
            // PREFER MP4
            const mimeTypes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm'];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

            const recorder = new MediaRecorder(combinedStream, { mimeType: selectedMime });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                 const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
                 resolve(URL.createObjectURL(blob));
                 if (audioContext) audioContext.close();
            };

            recorder.start();

            for (const url of videoUrls) {
                const vid = await loadVideo(url);
                await vid.play();
                await new Promise<void>(res => {
                    const draw = () => {
                        if (vid.paused || vid.ended) { res(); return; }
                        ctx.drawImage(vid, 0, 0, width, height);
                        requestAnimationFrame(draw);
                    };
                    draw();
                });
            }
            recorder.stop();
        } catch (e) { reject(e); }
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

            const stream = canvas.captureStream(60);
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const actx = new AudioContextClass();
            const dest = actx.createMediaStreamDestination();
            const source = actx.createMediaElementSource(video);
            source.connect(dest);
            source.connect(actx.destination); 

            const tracks = [...stream.getVideoTracks(), ...dest.stream.getAudioTracks()];
            const combined = new MediaStream(tracks);
            
            // PREFER MP4
            const mimeTypes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm'];
            const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

            const recorder = new MediaRecorder(combined, { mimeType: selectedMime });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, {type: selectedMime || 'video/webm'});
                resolve(URL.createObjectURL(blob));
                actx.close();
            };

            recorder.start();
            await video.play();
            const draw = () => {
                if(video.paused || video.ended) { recorder.stop(); return; }
                const sx = (video.videoWidth - targetW)/2;
                const sy = (video.videoHeight - targetH)/2;
                ctx.drawImage(video, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
                requestAnimationFrame(draw);
            };
            draw();
        } catch(e) { reject(e); }
    });
};
