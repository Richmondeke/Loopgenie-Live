
/**
 * Stitches images and audio into a video CLIENT-SIDE using HTML5 Canvas and MediaRecorder.
 * This bypasses external API limits/schemas and works "Live" for immediate testing.
 * Includes audio mixing via Web Audio API.
 * 
 * Now supports resizing and cropping (object-cover) to target dimensions.
 */
export const stitchVideoFrames = async (
  images: string[], 
  audioUrl: string | undefined, 
  durationPerImageMs: number = 5000,
  targetWidth?: number,
  targetHeight?: number
): Promise<string> => {
  console.log("Starting client-side video stitching with audio...");

  // Timeout Promise for safety (60 seconds max for longer stories)
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
        reject(new Error("Video generation timed out (MediaRecorder stuck). Try a shorter duration or refresh."));
    }, 60000);

    try {
        // 1. Prepare Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error("Could not get canvas context");

        // Determine size
        // If target dimensions are provided, use them. Otherwise infer from first image.
        // We load the first image to check dimensions if not provided
        let firstImgDims = { w: 1280, h: 720 };
        try {
            const firstImage = await loadImage(images[0]);
            firstImgDims = { w: firstImage.naturalWidth, h: firstImage.naturalHeight };
        } catch (e) {
            console.warn("Could not load first image to determine dims, using default 720p");
        }
        
        canvas.width = targetWidth || firstImgDims.w;
        canvas.height = targetHeight || firstImgDims.h;
        
        // Clear any existing content
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Prepare Audio (if exists)
        let audioContext: AudioContext | null = null;
        let audioBuffer: AudioBuffer | null = null;
        let dest: MediaStreamAudioDestinationNode | null = null;
        let sourceNode: AudioBufferSourceNode | null = null;

        if (audioUrl) {
            try {
                // Use standard or webkit prefix
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioContextClass();
                
                const response = await fetch(audioUrl);
                const arrayBuffer = await response.arrayBuffer();
                
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Recalculate image duration to sync with audio
                // Total Audio Duration / Number of Images
                if (audioBuffer.duration && audioBuffer.duration > 1) {
                    durationPerImageMs = (audioBuffer.duration * 1000) / images.length;
                    console.log(`Syncing video to audio. Total: ${audioBuffer.duration}s. Per Image: ${durationPerImageMs}ms`);
                } else {
                    console.warn("Audio duration too short or invalid, using default duration.");
                }

                // Create stream destination
                dest = audioContext.createMediaStreamDestination();
                sourceNode = audioContext.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(dest);
                
                // Important: also connect to local output to keep the graph "alive" in some browsers
                // sourceNode.connect(audioContext.destination); // Optional: Mute this if you don't want to hear it while generating
            } catch (e) {
                console.error("Error preparing audio for stitch:", e);
                // Continue without audio if error
            }
        }

        // 3. Prepare Recorder with Mixed Stream
        const canvasStream = canvas.captureStream(30); // 30 FPS
        const combinedTracks = [...canvasStream.getVideoTracks()];
        
        if (dest) {
            const audioTracks = dest.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                combinedTracks.push(audioTracks[0]);
            }
        }
        
        const combinedStream = new MediaStream(combinedTracks);

        // Check supported mime types
        // Prefer codecs that work broadly
        const mimeTypes = [
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
        
        let mimeType = 'video/webm';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }

        const recorder = new MediaRecorder(combinedStream, { 
            mimeType, 
            videoBitsPerSecond: 2500000 // 2.5 Mbps is sufficient and safer for browser encoding
        });
        
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        recorder.onstop = () => {
            clearTimeout(timeoutId);
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            console.log(`Stitching complete. Blob size: ${blob.size} bytes`);
            
            if (sourceNode) { try { sourceNode.stop(); } catch(e) {} }
            if (audioContext) { 
                try { audioContext.close(); } catch(e) {} 
            }
            resolve(url);
        };

        // Start recording in chunks of 1 second to ensure ondataavailable fires frequently
        recorder.start(1000);
        
        // Start Audio Playback into Stream
        if (sourceNode && audioContext) {
            // Resume context if suspended (browser autoplay policy)
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            sourceNode.start(0);
        }

        // 4. Draw Loop
        // We use a simple loop with setTimeout to pace the drawing.
        for (const imgSrc of images) {
            // Use fallback if image load fails to prevent entire video failure
            let img: HTMLImageElement;
            try {
                img = await loadImage(imgSrc);
            } catch (err) {
                console.warn(`Failed to load image for frame, using placeholder.`, err);
                // Create a placeholder black/text image logic could go here, but for now we skip/use minimal
                continue; 
            }
            
            // Calculate Object Cover logic
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const targetRatio = canvas.width / canvas.height;
            
            let renderW, renderH, offsetX, offsetY;

            if (imgRatio > targetRatio) {
                // Image is wider than target
                renderH = canvas.height;
                renderW = img.naturalWidth * (canvas.height / img.naturalHeight);
                offsetX = (canvas.width - renderW) / 2; // Center horizontally
                offsetY = 0;
            } else {
                // Image is taller than target
                renderW = canvas.width;
                renderH = img.naturalHeight * (canvas.width / img.naturalWidth);
                offsetX = 0;
                offsetY = (canvas.height - renderH) / 2; // Center vertically
            }

            // Draw frames for the duration
            const startTime = Date.now();
            while (Date.now() - startTime < durationPerImageMs) {
                // Clear and Draw with crop
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
                
                // 30 FPS throttle
                await new Promise(r => setTimeout(r, 1000 / 30));
            }
        }

        // Slight buffer at the end to ensure last frames are captured
        await new Promise(r => setTimeout(r, 500));

        // Stop recording
        recorder.stop();

    } catch (e) {
        clearTimeout(timeoutId);
        console.error("Stitching Error:", e);
        reject(e);
    }
  });
};

/**
 * Loads a remote video URL and re-records it onto a canvas with specific cropping.
 * Useful for forcing aspect ratios on videos generated by external APIs.
 */
export const cropVideo = async (
    sourceUrl: string,
    targetWidth: number,
    targetHeight: number
): Promise<string> => {
    console.log(`Starting video crop to ${targetWidth}x${targetHeight}...`);

    return new Promise((resolve, reject) => {
        // Safety timeout
        const timeoutId = setTimeout(() => {
             reject(new Error("Video crop timed out. Network might be slow."));
        }, 60000); // 1 minute timeout for cropping large videos

        const video = document.createElement('video');
        video.crossOrigin = 'anonymous'; // Crucial for CORS
        video.src = sourceUrl;
        video.muted = false; // We want audio
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

        // Setup MediaRecorder
        const canvasStream = canvas.captureStream(30); // 30 FPS
        
        // We need to capture audio from the video element using Web Audio API
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        // We don't connect to destination speakers to prevent echo during processing

        // Combine tracks
        const combinedTracks = [
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ];
        const combinedStream = new MediaStream(combinedTracks);

        // Mime Type Check
        const mimeTypes = [
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
        let mimeType = 'video/webm';
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }

        const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: 2500000
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            clearTimeout(timeoutId);
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            audioCtx.close();
            console.log("Crop complete:", url);
            resolve(url);
        };

        // Render Loop
        const renderFrame = () => {
            if (video.paused || video.ended) return;

            // Object Cover Logic
            const vidRatio = video.videoWidth / video.videoHeight;
            const targetRatio = canvas.width / canvas.height;
            
            let renderW, renderH, offsetX, offsetY;

            if (vidRatio > targetRatio) {
                // Video is wider
                renderH = canvas.height;
                renderW = video.videoWidth * (canvas.height / video.videoHeight);
                offsetX = (canvas.width - renderW) / 2;
                offsetY = 0;
            } else {
                // Video is taller
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

        // Events
        video.onloadedmetadata = () => {
             // Ready to play
             recorder.start(1000); // Chunked recording
             video.play().catch(e => {
                 clearTimeout(timeoutId);
                 reject(e);
             });
             renderFrame();
        };

        video.onended = () => {
            recorder.stop();
        };

        video.onerror = (e) => {
            clearTimeout(timeoutId);
            reject(new Error("Error loading video source for crop. Likely CORS issue."));
        };
    });
};

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};
