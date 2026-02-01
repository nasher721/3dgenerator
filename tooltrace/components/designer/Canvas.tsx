"use client";

import { useRef, useState, useEffect, MouseEvent } from 'react';
import styles from './Canvas.module.css';
import { Upload } from 'lucide-react';
import { Point } from '../../lib/vision/toolDetection';

interface CanvasProps {
    image: HTMLImageElement | null;
    onImageUpload: (img: HTMLImageElement) => void;
    scale: number;
    offset: { x: number; y: number };
    onTransformChange: (scale: number, offset: { x: number; y: number }) => void;
    onCanvasClick: (e: MouseEvent, imageCoords: { x: number; y: number }) => void;
    paperCorners: Point[];
    tools: { id: string; points: Point[] }[];
}

export default function Canvas({
    image,
    onImageUpload,
    scale,
    offset,
    onTransformChange,
    onCanvasClick,
    paperCorners,
    tools
}: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Handle File Upload
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => onImageUpload(img);
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    // Draw Image & Overlays
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply Zoom/Pan
        ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
        ctx.drawImage(image, 0, 0);

        // Draw Paper Overlay
        if (paperCorners.length > 0) {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'; // blue-500
            ctx.strokeStyle = '#2563eb'; // blue-600
            ctx.lineWidth = 3 / scale;

            paperCorners.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 10 / scale, 0, 2 * Math.PI);
                ctx.fill();

                // Draw numbers
                ctx.fillStyle = 'white';
                ctx.font = `${12 / scale}px sans-serif`;
                ctx.fillText((i + 1).toString(), p.x - 3 / scale, p.y + 4 / scale);
                ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
            });

            if (paperCorners.length === 4) {
                ctx.beginPath();
                ctx.moveTo(paperCorners[0].x, paperCorners[0].y);
                ctx.lineTo(paperCorners[1].x, paperCorners[1].y);
                ctx.lineTo(paperCorners[2].x, paperCorners[2].y);
                ctx.lineTo(paperCorners[3].x, paperCorners[3].y);
                ctx.closePath();
                ctx.stroke();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
                ctx.fill();
            }
        }

        // Draw Tools Overlay
        tools.forEach(tool => {
            if (tool.points.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(tool.points[0].x, tool.points[0].y);
            tool.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();

            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = '#ef4444'; // red-500
            ctx.stroke();
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
            ctx.fill();
        });

    }, [image, scale, offset, paperCorners, tools]);

    // Mouse Handlers
    const handleMouseDown = (e: MouseEvent) => {
        // Middle click or Space+Click implies dragging
        if (e.button === 1 || e.shiftKey) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
        } else {
            // Normal click -> Pass to parent for Tool/Paper logic
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const x = (e.clientX - rect.left - offset.x) / scale;
                const y = (e.clientY - rect.top - offset.y) / scale;
                onCanvasClick(e, { x, y });
            }
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            onTransformChange(scale, {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const newScale = Math.max(0.1, Math.min(10, scale - e.deltaY * zoomSensitivity));

        // Zoom toward mouse pointer logic (simplified for now: center zoom or just scale)
        // For robust implementation, need to adjust offset to keep mouse point stable.
        onTransformChange(newScale, offset);
    };

    if (!image) {
        return (
            <div className={styles.uploadContainer}>
                <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">No image</h3>
                    <p className="mt-1 text-sm text-gray-500">Upload a photo to get started.</p>
                    <div className="mt-6">
                        <label className={styles.uploadButton}>
                            Upload Photo
                            <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                        </label>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={styles.container}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* Render fully transparent canvas that covers the container, 
            but logically we want the canvas to match image size or window size? 
            Usually canvas matches window size, and we transform context. */}
            <canvas
                ref={canvasRef}
                width={containerRef.current?.clientWidth || 800}
                height={containerRef.current?.clientHeight || 600}
                className={styles.canvas}
            />
        </div>
    );
}
