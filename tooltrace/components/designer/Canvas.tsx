"use client";

import { useRef, useState, useEffect, MouseEvent } from 'react';
import styles from './Canvas.module.css';
import { Upload, MousePointer, Move } from 'lucide-react';
import { Point } from '../../lib/vision/toolDetection';

interface Tool {
    id: string;
    points: Point[];
    mask?: ImageData | null;
    confidence?: number;
}

interface CanvasProps {
    image: HTMLImageElement | null;
    onImageUpload: (img: HTMLImageElement) => void;
    scale: number;
    offset: { x: number; y: number };
    onTransformChange: (scale: number, offset: { x: number; y: number }) => void;
    onCanvasClick: (e: MouseEvent, imageCoords: { x: number; y: number }) => void;
    paperCorners: Point[];
    tools: Tool[];
    selectedToolId?: string | null;
    showMasks?: boolean;
    mode?: string;
}

export default function Canvas({
    image,
    onImageUpload,
    scale,
    offset,
    onTransformChange,
    onCanvasClick,
    paperCorners,
    tools,
    selectedToolId,
    showMasks = true,
    mode = 'view'
}: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
    const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

    // Update canvas size on resize
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setCanvasSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

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

    // Handle drag and drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => onImageUpload(img);
                    img.src = event.target?.result as string;
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
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
                ctx.font = `bold ${14 / scale}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((i + 1).toString(), p.x, p.y);
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
            } else if (paperCorners.length > 1) {
                // Draw lines between placed corners
                ctx.beginPath();
                ctx.moveTo(paperCorners[0].x, paperCorners[0].y);
                for (let i = 1; i < paperCorners.length; i++) {
                    ctx.lineTo(paperCorners[i].x, paperCorners[i].y);
                }
                ctx.stroke();
            }
        }

        // Draw Tools Overlay
        tools.forEach(tool => {
            if (tool.points.length < 2) return;

            const isSelected = selectedToolId === tool.id;

            ctx.beginPath();
            ctx.moveTo(tool.points[0].x, tool.points[0].y);
            tool.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();

            ctx.lineWidth = (isSelected ? 3 : 2) / scale;
            ctx.strokeStyle = isSelected ? '#f97316' : '#ef4444'; // orange-500 or red-500
            ctx.stroke();

            ctx.fillStyle = isSelected ? 'rgba(249, 115, 22, 0.3)' : 'rgba(239, 68, 68, 0.2)';
            ctx.fill();

            // Draw vertices for selected tool
            if (isSelected) {
                ctx.fillStyle = '#f97316';
                tool.points.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4 / scale, 0, 2 * Math.PI);
                    ctx.fill();
                });
            }
        });

        // Draw hover crosshair for tool/paper modes
        if (hoverPoint && mode !== 'view') {
            ctx.strokeStyle = mode.includes('paper') ? '#2563eb' : '#ef4444';
            ctx.lineWidth = 1 / scale;
            ctx.setLineDash([5 / scale, 5 / scale]);

            // Vertical line
            ctx.beginPath();
            ctx.moveTo(hoverPoint.x, 0);
            ctx.lineTo(hoverPoint.x, image.height);
            ctx.stroke();

            // Horizontal line
            ctx.beginPath();
            ctx.moveTo(0, hoverPoint.y);
            ctx.lineTo(image.width, hoverPoint.y);
            ctx.stroke();

            ctx.setLineDash([]);

            // Draw crosshair center
            ctx.fillStyle = mode.includes('paper') ? '#2563eb' : '#ef4444';
            ctx.beginPath();
            ctx.arc(hoverPoint.x, hoverPoint.y, 6 / scale, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2 / scale;
            ctx.stroke();
        }

    }, [image, scale, offset, paperCorners, tools, selectedToolId, hoverPoint, mode]);

    // Draw masks on separate canvas
    useEffect(() => {
        const maskCanvas = maskCanvasRef.current;
        if (!maskCanvas || !showMasks) return;

        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

        if (!image) return;

        ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);

        // Draw masks for tools that have them
        tools.forEach(tool => {
            if (tool.mask) {
                // Create a temporary canvas to draw the mask
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tool.mask.width;
                tempCanvas.height = tool.mask.height;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.putImageData(tool.mask, 0, 0);

                // Draw with color overlay
                ctx.globalAlpha = 0.4;
                ctx.drawImage(tempCanvas, 0, 0, image.width, image.height);
                ctx.globalAlpha = 1;
            }
        });

    }, [image, scale, offset, tools, showMasks]);

    // Mouse Handlers
    const handleMouseDown = (e: MouseEvent) => {
        // Middle click or Space+Click implies dragging
        if (e.button === 1 || e.shiftKey) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
            e.preventDefault();
        } else if (e.button === 0) {
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
        } else if (mode !== 'view') {
            // Update hover position
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const x = (e.clientX - rect.left - offset.x) / scale;
                const y = (e.clientY - rect.top - offset.y) / scale;
                setHoverPoint({ x, y });
            }
        }
    };

    const handleMouseUp = () => setIsDragging(false);
    const handleMouseLeave = () => {
        setIsDragging(false);
        setHoverPoint(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Get mouse position relative to canvas
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate zoom
        const zoomSensitivity = 0.001;
        const newScale = Math.max(0.1, Math.min(10, scale - e.deltaY * zoomSensitivity));
        const scaleRatio = newScale / scale;

        // Adjust offset to zoom toward mouse position
        const newOffsetX = mouseX - (mouseX - offset.x) * scaleRatio;
        const newOffsetY = mouseY - (mouseY - offset.y) * scaleRatio;

        onTransformChange(newScale, { x: newOffsetX, y: newOffsetY });
    };

    // Get cursor based on mode
    const getCursor = () => {
        if (isDragging) return 'grabbing';
        if (mode === 'view') return 'default';
        return 'crosshair';
    };

    if (!image) {
        return (
            <div
                className={styles.uploadContainer}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className={styles.uploadContent}>
                    <Upload className={styles.uploadIcon} />
                    <h3 className={styles.uploadTitle}>Upload an image</h3>
                    <p className={styles.uploadText}>
                        Take a photo of your tools on paper, then upload it here.
                    </p>
                    <p className={styles.uploadHint}>
                        Drag and drop or click to browse
                    </p>
                    <label className={styles.uploadButton}>
                        Choose File
                        <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                    </label>
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
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            style={{ cursor: getCursor() }}
        >
            {/* Mask canvas (behind main canvas for transparency) */}
            {showMasks && (
                <canvas
                    ref={maskCanvasRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    className={styles.maskCanvas}
                />
            )}

            {/* Main canvas */}
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                className={styles.canvas}
            />

            {/* Controls hint */}
            <div className={styles.controlsHint}>
                <div className={styles.hintItem}>
                    <MousePointer size={14} />
                    <span>Click to {mode.includes('paper') ? 'select paper' : mode.includes('tool') ? 'select tool' : 'view'}</span>
                </div>
                <div className={styles.hintItem}>
                    <Move size={14} />
                    <span>Shift+drag to pan</span>
                </div>
                <div className={styles.hintItem}>
                    Scroll to zoom
                </div>
            </div>

            {/* Zoom indicator */}
            <div className={styles.zoomIndicator}>
                {Math.round(scale * 100)}%
            </div>
        </div>
    );
}
