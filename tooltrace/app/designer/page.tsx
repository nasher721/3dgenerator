"use client";

import { useState, useCallback, useEffect } from 'react';
import Navbar from '@/components/common/Navbar';
import Canvas from '@/components/designer/Canvas';
import styles from './designer.module.css';
import { Download, Plus, Trash2, FileText, Wand2, Loader2, AlertCircle, CheckCircle, Cpu } from 'lucide-react';
import { traceTool, traceToolWithAI, Point } from '../../lib/vision/toolDetection';
import { calculateScale, PAPER_SIZES, detectPaperWithAI, detectPaperCV } from '../../lib/vision/paperDetection';
import { generateDXF } from '../../lib/export/dxfGenerator';
import { generateGridfinitySTL } from '../../lib/export/gridfinityGenerator';
import { initializeSegmentation, isModelLoaded, SegmentationProgress } from '../../lib/vision/segmentation';

type Mode = 'view' | 'paper' | 'paper-auto' | 'tool' | 'tool-ai';
type PaperSizeKey = keyof typeof PAPER_SIZES;

interface Tool {
    id: string;
    points: Point[];
    mask?: ImageData | null;
    confidence?: number;
}

export default function DesignerPage() {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [transform, setTransform] = useState({ scale: 1, offset: { x: 0, y: 0 } });

    // State
    const [mode, setMode] = useState<Mode>('view');
    const [paperCorners, setPaperCorners] = useState<Point[]>([]);
    const [tools, setTools] = useState<Tool[]>([]);
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [exportFormat, setExportFormat] = useState<'gridfinity' | 'foam'>('gridfinity');
    const [gridHeight, setGridHeight] = useState('3');
    const [paperSize, setPaperSize] = useState<PaperSizeKey>('LETTER');
    const [offset, setOffset] = useState('0');

    // AI Segmentation state
    const [aiStatus, setAiStatus] = useState<SegmentationProgress | null>(null);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [showMasks, setShowMasks] = useState(true);

    // Initialize model check
    useEffect(() => {
        setModelLoaded(isModelLoaded());
    }, []);

    // Load AI model
    const handleLoadAI = useCallback(async () => {
        try {
            setAiStatus({ status: 'loading', progress: 0, message: 'Initializing AI...' });
            await initializeSegmentation((progress) => {
                setAiStatus(progress);
            });
            setModelLoaded(isModelLoaded());
            setAiStatus({ status: 'complete', message: 'AI ready!' });
            setTimeout(() => setAiStatus(null), 2000);
        } catch (error) {
            setAiStatus({ status: 'error', message: `Failed to load AI: ${error}` });
        }
    }, []);

    const handleExport = () => {
        if (paperCorners.length < 4) {
            alert("Please set paper corners first to calibrate scale.");
            return;
        }

        if (tools.length === 0) {
            alert("Please add at least one tool before exporting.");
            return;
        }

        // Calculate scale with selected paper size
        const scale = calculateScale(
            paperCorners as [Point, Point, Point, Point],
            PAPER_SIZES[paperSize]
        );

        // Apply offset (convert mm to pixels)
        const offsetMM = parseFloat(offset);
        const toolsWithOffset = tools.map(t => ({
            ...t,
            points: offsetMM > 0 ? offsetPolygon(t.points, offsetMM * scale) : t.points
        }));

        if (exportFormat === 'foam') {
            const dxfContent = generateDXF(toolsWithOffset.map(t => t.points), scale);
            const blob = new Blob([dxfContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tooltrace_foam.dxf';
            a.click();
        } else {
            // Gridfinity
            const stlContent = generateGridfinitySTL(toolsWithOffset.map(t => t.points), scale, {
                gridHeight: parseInt(gridHeight)
            });
            const blob = new Blob([stlContent], { type: 'application/vnd.ms-pki.stl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tooltrace_gridfinity.stl';
            a.click();
        }
    };

    const handleCanvasClick = async (e: any, coords: { x: number; y: number }) => {
        if (!image) return;

        if (mode === 'paper') {
            // Manual paper corner selection
            if (paperCorners.length < 4) {
                setPaperCorners([...paperCorners, coords]);
            }
        } else if (mode === 'paper-auto') {
            // AI-assisted paper detection
            setIsProcessing(true);
            setAiStatus({ status: 'processing', message: 'Detecting paper...' });

            try {
                let corners: Point[] | null = null;

                if (modelLoaded) {
                    corners = await detectPaperWithAI(image, coords, setAiStatus);
                }

                // Fallback to CV detection if AI fails
                if (!corners || corners.length < 4) {
                    corners = await detectPaperCV(image, setAiStatus);
                }

                if (corners && corners.length === 4) {
                    setPaperCorners(corners);
                    setAiStatus({ status: 'complete', message: 'Paper detected!' });
                } else {
                    setAiStatus({ status: 'error', message: 'Could not detect paper. Try manual selection.' });
                }
            } catch (error) {
                setAiStatus({ status: 'error', message: `Detection failed: ${error}` });
            }

            setIsProcessing(false);
            setMode('view');
            setTimeout(() => setAiStatus(null), 3000);
        } else if (mode === 'tool') {
            // Basic tool detection (flood-fill)
            setIsProcessing(true);
            const outline = await traceTool(image, coords);
            setTools([...tools, { id: Date.now().toString(), points: outline }]);
            setIsProcessing(false);
            setMode('view');
        } else if (mode === 'tool-ai') {
            // AI-powered tool segmentation
            setIsProcessing(true);
            setAiStatus({ status: 'processing', message: 'Segmenting tool...' });

            try {
                const result = await traceToolWithAI(image, coords, setAiStatus);

                if (result && result.outline.length > 2) {
                    setTools([...tools, {
                        id: Date.now().toString(),
                        points: result.outline,
                        mask: result.mask,
                        confidence: result.confidence
                    }]);
                    setAiStatus({ status: 'complete', message: `Tool detected (${Math.round(result.confidence * 100)}% confidence)` });
                } else {
                    // Fallback to flood-fill
                    const outline = await traceTool(image, coords);
                    setTools([...tools, { id: Date.now().toString(), points: outline }]);
                    setAiStatus({ status: 'complete', message: 'Tool detected (fallback method)' });
                }
            } catch (error) {
                setAiStatus({ status: 'error', message: `Segmentation failed: ${error}` });
            }

            setIsProcessing(false);
            setMode('view');
            setTimeout(() => setAiStatus(null), 3000);
        }
    };

    const resetPaper = () => {
        setPaperCorners([]);
        setMode('view');
    };

    const deleteTool = (id: string) => {
        setTools(tools.filter(t => t.id !== id));
        if (selectedToolId === id) setSelectedToolId(null);
    };

    const getModeStatusText = () => {
        if (isProcessing) return aiStatus?.message || "Processing...";

        switch (mode) {
            case 'paper':
                return `Click corner ${paperCorners.length + 1}/4`;
            case 'paper-auto':
                return "Click on the paper to detect it";
            case 'tool':
                return "Click on a tool to trace";
            case 'tool-ai':
                return "Click on a tool for AI segmentation";
            default:
                return "";
        }
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />

            <div className={styles.layout}>
                {/* Left Sidebar: Tool List */}
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <span>Tools ({tools.length})</span>
                    </div>
                    <div className={styles.sidebarContent}>
                        <div className={styles.toolList}>
                            {tools.map((tool, idx) => (
                                <div
                                    key={tool.id}
                                    className={`${styles.toolItem} ${selectedToolId === tool.id ? styles.selected : ''}`}
                                    onClick={() => setSelectedToolId(tool.id === selectedToolId ? null : tool.id)}
                                >
                                    <div className={styles.toolItemContent}>
                                        <span>Tool {idx + 1}</span>
                                        {tool.confidence && (
                                            <span className={styles.confidence}>
                                                {Math.round(tool.confidence * 100)}%
                                            </span>
                                        )}
                                    </div>
                                    <Trash2
                                        size={16}
                                        className={styles.deleteIcon}
                                        onClick={(e) => { e.stopPropagation(); deleteTool(tool.id); }}
                                    />
                                </div>
                            ))}
                        </div>

                        {tools.length === 0 && (
                            <div className={styles.emptyState}>
                                {image ? 'Click "Add Tool" to start' : 'Upload an image first'}
                            </div>
                        )}

                        {tools.length > 0 && (
                            <div className={styles.maskToggle}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={showMasks}
                                        onChange={(e) => setShowMasks(e.target.checked)}
                                    />
                                    Show masks
                                </label>
                            </div>
                        )}
                    </div>

                    {/* AI Status Section */}
                    <div className={styles.aiSection}>
                        <div className={styles.aiHeader}>
                            <Cpu size={16} />
                            <span>AI Segmentation</span>
                        </div>
                        {!modelLoaded ? (
                            <button
                                className={styles.loadAiButton}
                                onClick={handleLoadAI}
                                disabled={aiStatus?.status === 'loading'}
                            >
                                {aiStatus?.status === 'loading' ? (
                                    <>
                                        <Loader2 size={14} className={styles.spinner} />
                                        {aiStatus.progress !== undefined ? `${aiStatus.progress}%` : 'Loading...'}
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={14} />
                                        Load AI Model
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className={styles.aiReady}>
                                <CheckCircle size={14} />
                                <span>AI Ready</span>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Canvas Area */}
                <main className={styles.mainArea}>
                    {/* Top Toolbar */}
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarGroup}>
                            {/* Paper Selection */}
                            <div className={styles.toolGroup}>
                                <span className={styles.groupLabel}>Paper</span>
                                <button
                                    className={`${styles.toolButton} ${mode === 'paper' ? styles.active : ''}`}
                                    onClick={() => setMode('paper')}
                                    title="Manually select 4 corners of the paper"
                                >
                                    <FileText size={18} /> Manual
                                </button>
                                <button
                                    className={`${styles.toolButton} ${mode === 'paper-auto' ? styles.active : ''}`}
                                    onClick={() => setMode('paper-auto')}
                                    title="Click on paper to auto-detect corners"
                                    disabled={!image}
                                >
                                    <Wand2 size={18} /> Auto
                                </button>
                                {paperCorners.length > 0 && (
                                    <button
                                        className={styles.toolButton}
                                        onClick={resetPaper}
                                        title="Reset paper selection"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>

                            <div className={styles.divider} />

                            {/* Tool Selection */}
                            <div className={styles.toolGroup}>
                                <span className={styles.groupLabel}>Tools</span>
                                <button
                                    className={`${styles.toolButton} ${mode === 'tool' ? styles.active : ''}`}
                                    onClick={() => setMode('tool')}
                                    title="Basic tool detection (color-based)"
                                    disabled={!image}
                                >
                                    <Plus size={18} /> Basic
                                </button>
                                <button
                                    className={`${styles.toolButton} ${mode === 'tool-ai' ? styles.active : ''} ${!modelLoaded ? styles.disabled : ''}`}
                                    onClick={() => {
                                        if (!modelLoaded) {
                                            handleLoadAI();
                                        } else {
                                            setMode('tool-ai');
                                        }
                                    }}
                                    title={modelLoaded ? "AI-powered tool segmentation" : "Load AI model first"}
                                    disabled={!image}
                                >
                                    <Wand2 size={18} /> AI
                                </button>
                            </div>
                        </div>

                        <div className={styles.statusArea}>
                            {mode !== 'view' && (
                                <div className={styles.statusText}>
                                    {getModeStatusText()}
                                </div>
                            )}
                            {aiStatus && mode === 'view' && (
                                <div className={`${styles.aiStatusBadge} ${styles[aiStatus.status]}`}>
                                    {aiStatus.status === 'loading' && <Loader2 size={14} className={styles.spinner} />}
                                    {aiStatus.status === 'error' && <AlertCircle size={14} />}
                                    {aiStatus.status === 'complete' && <CheckCircle size={14} />}
                                    {aiStatus.message}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.canvasContainer}>
                        <Canvas
                            image={image}
                            onImageUpload={setImage}
                            scale={transform.scale}
                            offset={transform.offset}
                            onTransformChange={(s, o) => setTransform({ scale: s, offset: o })}
                            onCanvasClick={handleCanvasClick}
                            paperCorners={paperCorners}
                            tools={tools}
                            selectedToolId={selectedToolId}
                            showMasks={showMasks}
                            mode={mode}
                        />
                    </div>
                </main>

                {/* Right Sidebar: Settings & Export */}
                <aside className={styles.exportPanel}>
                    <div>
                        <h3 className={styles.panelTitle}>Configuration</h3>

                        <div className={styles.controlGroup}>
                            <label className={styles.label}>Insert Type</label>
                            <select
                                className={styles.select}
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.target.value as 'gridfinity' | 'foam')}
                            >
                                <option value="gridfinity">Gridfinity Bin</option>
                                <option value="foam">Shadowbox Foam</option>
                            </select>
                        </div>

                        <div className={styles.controlGroup}>
                            <label className={styles.label}>Paper Size</label>
                            <select
                                className={styles.select}
                                value={paperSize}
                                onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)}
                            >
                                <option value="LETTER">Letter (8.5" x 11")</option>
                                <option value="A4">A4 (210mm x 297mm)</option>
                                <option value="LEGAL">Legal (8.5" x 14")</option>
                                <option value="A3">A3 (297mm x 420mm)</option>
                                <option value="TABLOID">Tabloid (11" x 17")</option>
                            </select>
                        </div>

                        <div className={styles.controlGroup}>
                            <label className={styles.label}>Tool Offset</label>
                            <select
                                className={styles.select}
                                value={offset}
                                onChange={(e) => setOffset(e.target.value)}
                            >
                                <option value="0">None (Exact fit)</option>
                                <option value="0.5">Tight (0.5mm)</option>
                                <option value="1">Small (1mm)</option>
                                <option value="1.5">Medium (1.5mm)</option>
                                <option value="2">Large (2mm)</option>
                                <option value="3">Extra Large (3mm)</option>
                            </select>
                            <span className={styles.hint}>
                                Add clearance around tools
                            </span>
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                        {exportFormat === 'gridfinity' && (
                            <div className={styles.controlGroup}>
                                <label className={styles.label}>Bin Height (Units)</label>
                                <select
                                    className={styles.select}
                                    value={gridHeight}
                                    onChange={(e) => setGridHeight(e.target.value)}
                                >
                                    <option value="2">2 Units (14mm)</option>
                                    <option value="3">3 Units (21mm)</option>
                                    <option value="4">4 Units (28mm)</option>
                                    <option value="5">5 Units (35mm)</option>
                                    <option value="6">6 Units (42mm)</option>
                                </select>
                            </div>
                        )}

                        <div className={styles.exportInfo}>
                            {paperCorners.length === 4 && (
                                <div className={styles.infoItem}>
                                    <CheckCircle size={14} />
                                    Paper calibrated
                                </div>
                            )}
                            {tools.length > 0 && (
                                <div className={styles.infoItem}>
                                    <CheckCircle size={14} />
                                    {tools.length} tool{tools.length > 1 ? 's' : ''} traced
                                </div>
                            )}
                        </div>

                        <button
                            className={styles.primaryButton}
                            onClick={handleExport}
                            disabled={paperCorners.length < 4 || tools.length === 0}
                        >
                            <Download size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
                            Export {exportFormat === 'gridfinity' ? 'STL' : 'DXF'}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}

/**
 * Offset a polygon by a given amount (positive = expand, negative = shrink)
 */
function offsetPolygon(points: Point[], amount: number): Point[] {
    if (points.length < 3) return points;

    const result: Point[] = [];

    for (let i = 0; i < points.length; i++) {
        const prev = points[(i - 1 + points.length) % points.length];
        const curr = points[i];
        const next = points[(i + 1) % points.length];

        // Calculate edge vectors
        const v1x = curr.x - prev.x;
        const v1y = curr.y - prev.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;

        // Normalize
        const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

        if (len1 === 0 || len2 === 0) {
            result.push(curr);
            continue;
        }

        // Normal vectors (perpendicular, pointing outward for CCW polygon)
        const n1x = -v1y / len1;
        const n1y = v1x / len1;
        const n2x = -v2y / len2;
        const n2y = v2x / len2;

        // Average normal at vertex
        const nx = (n1x + n2x) / 2;
        const ny = (n1y + n2y) / 2;
        const nlen = Math.sqrt(nx * nx + ny * ny);

        if (nlen > 0) {
            // Scale by amount / cos(half-angle between edges)
            const scale = amount / nlen;
            result.push({
                x: curr.x + nx * scale,
                y: curr.y + ny * scale
            });
        } else {
            result.push(curr);
        }
    }

    return result;
}
