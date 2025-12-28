
import { ShortMakerManifest } from "../types";

export const generateComicBookHtml = (manifest: ShortMakerManifest): string => {
    const scenes = manifest.scenes || [];
    const title = manifest.title || "My Story";
    const date = new Date().toLocaleDateString();

    const sceneHtml = scenes.map((scene, index) => {
        const imgUrl = scene.generated_image_url || 'https://via.placeholder.com/1024x1024?text=No+Image';
        const text = scene.narration_text || scene.visual_description || "";
        const isWide = scene.image_prompt?.includes("wide") || false;
        
        return `
            <div class="panel ${isWide ? 'wide' : ''}">
                <div class="image-container">
                    <img src="${imgUrl}" alt="Scene ${index + 1}" crossorigin="anonymous" />
                </div>
                <div class="caption-box">
                    <p>${text}</p>
                </div>
                <div class="scene-number">${index + 1}</div>
            </div>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${title} - Comic Book</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap');
            
            body {
                background: #f0f0f0;
                font-family: 'Comic Neue', cursive, sans-serif;
                margin: 0;
                padding: 20px;
                color: #111;
            }
            .page-container {
                max-width: 210mm; /* A4 Width */
                margin: 0 auto;
                background: white;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
                min-height: 297mm;
                padding: 20px;
                box-sizing: border-box;
            }
            header {
                text-align: center;
                border-bottom: 4px solid #000;
                margin-bottom: 20px;
                padding-bottom: 10px;
            }
            h1 {
                font-size: 32px;
                text-transform: uppercase;
                margin: 0;
                letter-spacing: 2px;
            }
            .meta {
                font-size: 14px;
                color: #666;
                margin-top: 5px;
            }
            .comic-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
            }
            .panel {
                border: 3px solid #000;
                background: #fff;
                position: relative;
                box-shadow: 5px 5px 0px rgba(0,0,0,0.2);
                break-inside: avoid;
                display: flex;
                flex-direction: column;
            }
            .panel.wide {
                grid-column: span 2;
            }
            .image-container {
                width: 100%;
                overflow: hidden;
                border-bottom: 2px solid #000;
                flex: 1;
            }
            .image-container img {
                width: 100%;
                height: auto;
                display: block;
                object-fit: cover;
                aspect-ratio: 9/16; 
            }
            /* Adjust aspect ratio for storybook mode */
            .is-landscape .image-container img {
                aspect-ratio: 16/9;
            }
            .caption-box {
                padding: 10px;
                background: #fff;
                font-size: 14px;
                line-height: 1.4;
                font-weight: bold;
                min-height: 60px;
            }
            .scene-number {
                position: absolute;
                top: 0;
                left: 0;
                background: #000;
                color: #fff;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: bold;
            }
            @media print {
                body {
                    background: none;
                    padding: 0;
                }
                .page-container {
                    box-shadow: none;
                    margin: 0;
                    width: 100%;
                    max-width: none;
                }
                .no-print {
                    display: none;
                }
            }
        </style>
    </head>
    <body class="${manifest.output_settings?.video_resolution?.startsWith('1920') ? 'is-landscape' : ''}">
        <div class="no-print" style="text-align: center; margin-bottom: 20px;">
            <button onclick="window.print()" style="background: #000; color: #fff; border: none; padding: 10px 20px; font-size: 16px; cursor: pointer; border-radius: 5px; font-family: inherit; font-weight: bold;">🖨️ Print to PDF</button>
            <p style="font-size: 12px; color: #666; margin-top: 5px;">Choose "Save as PDF" in the print dialog.</p>
        </div>
        <div class="page-container">
            <header>
                <h1>${title}</h1>
                <div class="meta">Created with LoopGenie • ${date}</div>
            </header>
            <div class="comic-grid">
                ${sceneHtml}
            </div>
        </div>
    </body>
    </html>
    `;
};

export const openComicBookWindow = (manifest: ShortMakerManifest) => {
    const html = generateComicBookHtml(manifest);
    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    } else {
        alert("Please allow popups to view the Comic Book PDF.");
    }
};
