/**
 * Vision module exports
 * Provides image segmentation, tool detection, and paper detection utilities
 */

export {
    type Point,
    traceTool,
    traceToolWithAI,
    floodFillTrace
} from './toolDetection';

export {
    type PaperConfig,
    PAPER_SIZES,
    calculateScale,
    calculateScaleBidirectional,
    detectPaperWithAI,
    detectPaperCV
} from './paperDetection';

export {
    type SegmentationResult,
    type SegmentationProgress,
    initializeSegmentation,
    isModelLoaded,
    segmentAtPoint,
    segmentWithBox,
    detectPaper,
    disposeSegmentation
} from './segmentation';
