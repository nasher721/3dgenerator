"use client";

import { useState } from 'react';
import Navbar from '@/components/common/Navbar';
import Canvas from '@/components/designer/Canvas';
import styles from './designer.module.css';
import { Download, Plus, Trash2, Grid, Layers, MousePointer2, FileText, X } from 'lucide-react';
import { traceTool, Point } from '../../lib/vision/toolDetection';
import { calculateScale, PAPER_SIZES } from '../../lib/vision/paperDetection';
import { generateDXF } from '../../lib/export/dxfGenerator';
import { generateGridfinitySTL } from '../../lib/export/gridfinityGenerator';

export default function DesignerPage() {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [transform, setTransform] = useState({ scale: 1, offset: { x: 0, y: 0 } });

    // State
    const [mode, setMode] = useState<'view' | 'paper' | 'tool'>('view');
    const [paperCorners, setPaperCorners] = useState<Point[]>([]);
    const [tools, setTools] = useState<{ id: string; points: Point[] }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [exportFormat, setExportFormat] = useState<'gridfinity' | 'foam'>('gridfinity');
    const [gridHeight, setGridHeight] = useState('3');

    const handleExport = () => {
        if (paperCorners.length < 4) {
            alert("Please set paper corners first to calibrate scale.");
            return;
        }

        // Calculate scale
        // Assumption: User is using Letter paper for MVP default
        // TODO: Let user select Paper Size
        const scale = calculateScale(paperCorners as [Point, Point, Point, Point], PAPER_SIZES.LETTER);

        if (exportFormat === 'foam') {
            const dxfContent = generateDXF(tools.map(t => t.points), scale);
            const blob = new Blob([dxfContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tooltrace_foam.dxf';
            a.click();
        } else {
            // Gridfinity
            const stlContent = generateGridfinitySTL(tools.map(t => t.points), scale, {
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
            if (paperCorners.length < 4) {
                setPaperCorners([...paperCorners, coords]);
            }
        } else if (mode === 'tool') {
            setIsProcessing(true);
            const outline = await traceTool(image, coords);
            setTools([...tools, { id: Date.now().toString(), points: outline }]);
            setIsProcessing(false);
            setMode('view'); // Switch back after adding
        }
    };

    const resetPaper = () => setPaperCorners([]);
    const deleteTool = (id: string) => setTools(tools.filter(t => t.id !== id));

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />

            <div className={styles.layout}>
                {/* Left Sidebar: Tool List */}
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <span>Tools</span>
                        <button className={styles.iconButton}><Plus size={20} /></button>
                    </div>
                    <div className={styles.sidebarContent}>
                        <div className={styles.toolList}>
                            {tools.map((tool, idx) => (
                                <div key={tool.id} className={styles.toolItem}>
                                    <span>Tool {idx + 1}</span>
                                    <Trash2 size={16} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteTool(tool.id); }} />
                                </div>
                            ))}
                        </div>
                        <div className="text-sm text-gray-500 text-center mt-4">
                            {image && tools.length === 0 && 'Click "Add Tool" to start'}
                            {!image && 'Upload an image first'}
                        </div>
                    </div>
                </aside>

                {/* Main Canvas Area */}
                <main className={styles.mainArea}>
                    {/* Top Toolbar */}
                    <div className={styles.toolbar}>
                        <div className="flex gap-2">
                            <button
                                className={`${styles.toolButton} ${mode === 'paper' ? 'bg-blue-100 text-blue-600' : ''}`}
                                onClick={() => setMode('paper')}
                                title="Select 4 corners of the paper"
                            >
                                <FileText size={18} /> Set Paper
                            </button>
                            <button
                                className={`${styles.toolButton} ${mode === 'tool' ? 'bg-blue-100 text-blue-600' : ''}`}
                                onClick={() => setMode('tool')}
                                title="Click on a tool to trace it"
                            >
                                <Plus size={18} /> Add Tool
                            </button>
                        </div>
                        <div className="text-sm text-gray-500 ml-4">
                            {mode === 'paper' && `Select Corner ${paperCorners.length + 1}/4`}
                            {mode === 'tool' && "Click on a tool to trace"}
                            {isProcessing && "Processing..."}
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
                                <option value="gridfinity">Gridfinity</option>
                                <option value="foam">Shadowbox Foam</option>
                            </select>
                        </div>

                        <div className={styles.controlGroup}>
                            <label className={styles.label}>Paper Size</label>
                            <select className={styles.select}>
                                <option>Letter (8.5" x 11")</option>
                                <option>A4 (210mm x 297mm)</option>
                            </select>
                        </div>

                        <div className={styles.controlGroup}>
                            <label className={styles.label}>Offset</label>
                            <select className={styles.select}>
                                <option>None (Exact)</option>
                                <option>Small (1.5mm)</option>
                                <option>Medium (3mm)</option>
                                <option>Large (4.5mm)</option>
                            </select>
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
                                    <option value="6">6 Units (42mm)</option>
                                </select>
                            </div>
                        )}
                        <button className={styles.primaryButton} onClick={handleExport}>
                            <Download size={18} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
                            Export {exportFormat === 'gridfinity' ? 'STL' : 'DXF'}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
