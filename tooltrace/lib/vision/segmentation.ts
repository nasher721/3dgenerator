/**
 * Image Segmentation Service using SAM (Segment Anything Model)
 * Uses Transformers.js for browser-based ML inference
 */

import {
    SamModel,
    SamProcessor,
    AutoProcessor,
    RawImage,
    Tensor
} from '@huggingface/transformers';
import { Point } from './toolDetection';

// Global model cache
let samModel: SamModel | null = null;
let samProcessor: SamProcessor | null = null;
let isModelLoading = false;
let modelLoadPromise: Promise<void> | null = null;

// Model configuration - using a smaller SAM model for browser performance
const MODEL_ID = 'Xenova/slimsam-77-uniform';

export interface SegmentationResult {
    mask: ImageData;
    outline: Point[];
    confidence: number;
}

export interface SegmentationProgress {
    status: 'loading' | 'processing' | 'complete' | 'error';
    progress?: number;
    message?: string;
}

/**
 * Initialize the SAM model
 */
export async function initializeSegmentation(
    onProgress?: (progress: SegmentationProgress) => void
): Promise<boolean> {
    if (samModel && samProcessor) {
        return true;
    }

    if (isModelLoading && modelLoadPromise) {
        await modelLoadPromise;
        return samModel !== null;
    }

    isModelLoading = true;

    modelLoadPromise = (async () => {
        try {
            onProgress?.({
                status: 'loading',
                progress: 0,
                message: 'Loading segmentation model...'
            });

            // Load model and processor in parallel
            const [model, processor] = await Promise.all([
                SamModel.from_pretrained(MODEL_ID, {
                    dtype: 'fp32',
                    device: 'webgpu' in navigator ? 'webgpu' : 'wasm',
                    progress_callback: (progress: any) => {
                        if (progress.status === 'progress') {
                            onProgress?.({
                                status: 'loading',
                                progress: Math.round(progress.progress),
                                message: `Downloading model: ${Math.round(progress.progress)}%`
                            });
                        }
                    }
                }),
                AutoProcessor.from_pretrained(MODEL_ID)
            ]);

            samModel = model as SamModel;
            samProcessor = processor as SamProcessor;

            onProgress?.({
                status: 'complete',
                progress: 100,
                message: 'Model loaded successfully'
            });

        } catch (error) {
            console.error('Failed to load SAM model:', error);
            onProgress?.({
                status: 'error',
                message: `Failed to load model: ${error}`
            });
            throw error;
        } finally {
            isModelLoading = false;
        }
    })();

    await modelLoadPromise;
    return samModel !== null;
}

/**
 * Check if the segmentation model is loaded
 */
export function isModelLoaded(): boolean {
    return samModel !== null && samProcessor !== null;
}

/**
 * Segment an object at a given point using SAM
 */
export async function segmentAtPoint(
    image: HTMLImageElement,
    clickPoint: Point,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<SegmentationResult | null> {
    // Ensure model is loaded
    if (!samModel || !samProcessor) {
        await initializeSegmentation(onProgress);
    }

    if (!samModel || !samProcessor) {
        throw new Error('Segmentation model not initialized');
    }

    try {
        onProgress?.({ status: 'processing', message: 'Processing image...' });

        // Create RawImage from HTMLImageElement
        const rawImage = await RawImage.fromURL(image.src);

        // Prepare input points - format is [[x, y]]
        const inputPoints = [[
            [clickPoint.x, clickPoint.y]
        ]];

        // Prepare input labels - 1 for foreground point
        const inputLabels = [[1]];

        // Process the image with the model
        const inputs = await samProcessor(rawImage, {
            input_points: inputPoints,
            input_labels: inputLabels
        });

        onProgress?.({ status: 'processing', message: 'Running segmentation...' });

        // Run the model
        const outputs = await samModel(inputs);

        // Get the mask from outputs
        const masks = outputs.pred_masks;
        const iouScores = outputs.iou_scores;

        // Get the best mask (highest IOU score)
        const scoresData = await iouScores.data;
        let bestMaskIdx = 0;
        let bestScore = scoresData[0];
        for (let i = 1; i < scoresData.length; i++) {
            if (scoresData[i] > bestScore) {
                bestScore = scoresData[i];
                bestMaskIdx = i;
            }
        }

        // Extract the mask data
        const maskData = await masks.data;
        const [batchSize, numMasks, height, width] = masks.dims;

        // Create ImageData from mask
        const maskImageData = createMaskImageData(
            maskData as Float32Array,
            width,
            height,
            bestMaskIdx,
            numMasks
        );

        // Scale mask to original image size if needed
        const scaledMask = scaleMaskToImage(maskImageData, image.width, image.height);

        // Extract outline from mask
        const outline = extractOutlineFromMask(scaledMask);

        onProgress?.({ status: 'complete', message: 'Segmentation complete' });

        return {
            mask: scaledMask,
            outline,
            confidence: bestScore
        };

    } catch (error) {
        console.error('Segmentation error:', error);
        onProgress?.({
            status: 'error',
            message: `Segmentation failed: ${error}`
        });
        return null;
    }
}

/**
 * Create ImageData from mask tensor data
 */
function createMaskImageData(
    maskData: Float32Array,
    width: number,
    height: number,
    maskIdx: number,
    numMasks: number
): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const maskOffset = maskIdx * width * height;

    for (let i = 0; i < width * height; i++) {
        const maskValue = maskData[maskOffset + i];
        const isObject = maskValue > 0 ? 255 : 0;

        data[i * 4] = isObject;     // R
        data[i * 4 + 1] = isObject; // G
        data[i * 4 + 2] = isObject; // B
        data[i * 4 + 3] = isObject > 0 ? 180 : 0; // A (semi-transparent)
    }

    return imageData;
}

/**
 * Scale mask to match original image dimensions
 */
function scaleMaskToImage(mask: ImageData, targetWidth: number, targetHeight: number): ImageData {
    if (mask.width === targetWidth && mask.height === targetHeight) {
        return mask;
    }

    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(mask, 0, 0);

    const targetCanvas = document.createElement('canvas');
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;
    const targetCtx = targetCanvas.getContext('2d')!;

    // Use nearest neighbor for crisp edges
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

    return targetCtx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Extract outline points from a binary mask using marching squares
 */
function extractOutlineFromMask(mask: ImageData): Point[] {
    const { width, height, data } = mask;

    // Create binary mask array
    const binaryMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        binaryMask[i] = data[i * 4] > 127 ? 1 : 0;
    }

    // Find contour using marching squares algorithm
    const contour = marchingSquares(binaryMask, width, height);

    // Simplify the contour to reduce points
    return simplifyContour(contour, 2.0);
}

/**
 * Marching Squares algorithm to find contour
 */
function marchingSquares(mask: Uint8Array, width: number, height: number): Point[] {
    const contour: Point[] = [];

    // Find starting point
    let startX = -1, startY = -1;
    outer: for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 1) {
                startX = x;
                startY = y;
                break outer;
            }
        }
    }

    if (startX === -1) return contour;

    // Direction lookup tables for marching squares
    const dx = [1, 0, -1, 0];
    const dy = [0, 1, 0, -1];

    // March around the contour
    let x = startX, y = startY;
    let dir = 0; // Start direction: right
    const visited = new Set<string>();

    do {
        const key = `${x},${y}`;
        if (!visited.has(key)) {
            contour.push({ x, y });
            visited.add(key);
        }

        // Check neighbors in priority order (turn right, go straight, turn left, go back)
        const turnOrder = [(dir + 3) % 4, dir, (dir + 1) % 4, (dir + 2) % 4];
        let moved = false;

        for (const newDir of turnOrder) {
            const nx = x + dx[newDir];
            const ny = y + dy[newDir];

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const idx = ny * width + nx;
                if (mask[idx] === 1) {
                    // Check if this is an edge pixel (has at least one non-mask neighbor)
                    let isEdge = false;
                    for (let d = 0; d < 4; d++) {
                        const ex = nx + dx[d];
                        const ey = ny + dy[d];
                        if (ex < 0 || ex >= width || ey < 0 || ey >= height || mask[ey * width + ex] === 0) {
                            isEdge = true;
                            break;
                        }
                    }

                    if (isEdge || !visited.has(`${nx},${ny}`)) {
                        x = nx;
                        y = ny;
                        dir = newDir;
                        moved = true;
                        break;
                    }
                }
            }
        }

        if (!moved) break;

    } while (!(x === startX && y === startY) && contour.length < width * height);

    return contour;
}

/**
 * Simplify contour using Douglas-Peucker algorithm
 */
function simplifyContour(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from line between first and last
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDist > tolerance) {
        const left = simplifyContour(points.slice(0, maxIdx + 1), tolerance);
        const right = simplifyContour(points.slice(maxIdx), tolerance);
        return [...left.slice(0, -1), ...right];
    }

    return [first, last];
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
        return Math.sqrt(
            Math.pow(point.x - lineStart.x, 2) +
            Math.pow(point.y - lineStart.y, 2)
        );
    }

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
    const nearestX = lineStart.x + t * dx;
    const nearestY = lineStart.y + t * dy;

    return Math.sqrt(
        Math.pow(point.x - nearestX, 2) +
        Math.pow(point.y - nearestY, 2)
    );
}

/**
 * Segment multiple objects using box prompts
 */
export async function segmentWithBox(
    image: HTMLImageElement,
    box: { x1: number; y1: number; x2: number; y2: number },
    onProgress?: (progress: SegmentationProgress) => void
): Promise<SegmentationResult | null> {
    if (!samModel || !samProcessor) {
        await initializeSegmentation(onProgress);
    }

    if (!samModel || !samProcessor) {
        throw new Error('Segmentation model not initialized');
    }

    try {
        onProgress?.({ status: 'processing', message: 'Processing region...' });

        const rawImage = await RawImage.fromURL(image.src);

        // Format box as [[x1, y1, x2, y2]]
        const inputBoxes = [[[box.x1, box.y1, box.x2, box.y2]]];

        const inputs = await samProcessor(rawImage, {
            input_boxes: inputBoxes
        });

        onProgress?.({ status: 'processing', message: 'Running segmentation...' });

        const outputs = await samModel(inputs);
        const masks = outputs.pred_masks;
        const iouScores = outputs.iou_scores;

        const scoresData = await iouScores.data;
        let bestMaskIdx = 0;
        let bestScore = scoresData[0];
        for (let i = 1; i < scoresData.length; i++) {
            if (scoresData[i] > bestScore) {
                bestScore = scoresData[i];
                bestMaskIdx = i;
            }
        }

        const maskData = await masks.data;
        const [, numMasks, height, width] = masks.dims;

        const maskImageData = createMaskImageData(
            maskData as Float32Array,
            width,
            height,
            bestMaskIdx,
            numMasks
        );

        const scaledMask = scaleMaskToImage(maskImageData, image.width, image.height);
        const outline = extractOutlineFromMask(scaledMask);

        onProgress?.({ status: 'complete', message: 'Segmentation complete' });

        return {
            mask: scaledMask,
            outline,
            confidence: bestScore
        };

    } catch (error) {
        console.error('Box segmentation error:', error);
        onProgress?.({
            status: 'error',
            message: `Segmentation failed: ${error}`
        });
        return null;
    }
}

/**
 * Detect rectangular paper in the image
 * Uses edge detection and Hough transform-like approach
 */
export async function detectPaper(
    image: HTMLImageElement,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<Point[] | null> {
    onProgress?.({ status: 'processing', message: 'Detecting paper edges...' });

    // Create canvas for image processing
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    // Convert to grayscale and apply edge detection
    const grayscale = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        grayscale[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    }

    // Apply Sobel edge detection
    const edges = sobelEdgeDetection(grayscale, width, height);

    // Find bright/white regions (paper typically appears white/light)
    const brightMask = new Uint8Array(width * height);
    const brightnessThreshold = 0.7;

    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4] / 255;
        const g = data[i * 4 + 1] / 255;
        const b = data[i * 4 + 2] / 255;
        const brightness = (r + g + b) / 3;
        brightMask[i] = brightness > brightnessThreshold ? 1 : 0;
    }

    // Find the largest connected bright region
    const largestRegion = findLargestConnectedRegion(brightMask, width, height);

    if (!largestRegion || largestRegion.length < 100) {
        onProgress?.({ status: 'complete', message: 'No paper detected' });
        return null;
    }

    // Find convex hull of the region
    const hull = convexHull(largestRegion);

    // Find 4 corners (approximate rectangle)
    const corners = findRectangleCorners(hull);

    onProgress?.({ status: 'complete', message: 'Paper detected' });

    return corners;
}

/**
 * Apply Sobel edge detection
 */
function sobelEdgeDetection(grayscale: Float32Array, width: number, height: number): Float32Array {
    const edges = new Float32Array(width * height);

    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = (y + ky) * width + (x + kx);
                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    gx += grayscale[idx] * sobelX[kernelIdx];
                    gy += grayscale[idx] * sobelY[kernelIdx];
                }
            }

            edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    return edges;
}

/**
 * Find the largest connected region using flood fill
 */
function findLargestConnectedRegion(mask: Uint8Array, width: number, height: number): Point[] | null {
    const visited = new Uint8Array(width * height);
    let largestRegion: Point[] = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1 && !visited[idx]) {
                const region = floodFillRegion(mask, visited, x, y, width, height);
                if (region.length > largestRegion.length) {
                    largestRegion = region;
                }
            }
        }
    }

    return largestRegion.length > 0 ? largestRegion : null;
}

/**
 * Flood fill to find connected region
 */
function floodFillRegion(
    mask: Uint8Array,
    visited: Uint8Array,
    startX: number,
    startY: number,
    width: number,
    height: number
): Point[] {
    const region: Point[] = [];
    const stack: number[] = [startX, startY];
    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    while (stack.length > 0) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        const idx = y * width + x;

        if (visited[idx]) continue;
        visited[idx] = 1;
        region.push({ x, y });

        for (let d = 0; d < 4; d++) {
            const nx = x + dx[d];
            const ny = y + dy[d];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (mask[nidx] === 1 && !visited[nidx]) {
                    stack.push(nx, ny);
                }
            }
        }
    }

    return region;
}

/**
 * Calculate convex hull using Graham scan
 */
function convexHull(points: Point[]): Point[] {
    if (points.length < 3) return points;

    // Sample points for performance (max 1000 points)
    let sampled = points;
    if (points.length > 1000) {
        const step = Math.floor(points.length / 1000);
        sampled = points.filter((_, i) => i % step === 0);
    }

    // Find lowest y-coordinate point (leftmost if tie)
    let lowest = sampled[0];
    for (const p of sampled) {
        if (p.y > lowest.y || (p.y === lowest.y && p.x < lowest.x)) {
            lowest = p;
        }
    }

    // Sort by polar angle
    const sorted = sampled
        .filter(p => p !== lowest)
        .sort((a, b) => {
            const angleA = Math.atan2(a.y - lowest.y, a.x - lowest.x);
            const angleB = Math.atan2(b.y - lowest.y, b.x - lowest.x);
            return angleA - angleB;
        });

    const hull: Point[] = [lowest];
    for (const p of sorted) {
        while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
            hull.pop();
        }
        hull.push(p);
    }

    return hull;
}

/**
 * Cross product of vectors OA and OB
 */
function cross(o: Point, a: Point, b: Point): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Find 4 corners from convex hull that best approximate a rectangle
 */
function findRectangleCorners(hull: Point[]): Point[] {
    if (hull.length < 4) return hull;

    // Find the 4 extreme points
    let minX = hull[0], maxX = hull[0];
    let minY = hull[0], maxY = hull[0];

    for (const p of hull) {
        if (p.x < minX.x) minX = p;
        if (p.x > maxX.x) maxX = p;
        if (p.y < minY.y) minY = p;
        if (p.y > maxY.y) maxY = p;
    }

    // Order as TL, TR, BR, BL
    const points = [minX, maxX, minY, maxY];

    // Sort by angle from center
    const cx = points.reduce((s, p) => s + p.x, 0) / 4;
    const cy = points.reduce((s, p) => s + p.y, 0) / 4;

    points.sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        return angleA - angleB;
    });

    // Reorder to TL, TR, BR, BL (clockwise from top-left)
    // Find top-left (smallest x+y sum)
    let tlIdx = 0;
    let minSum = points[0].x + points[0].y;
    for (let i = 1; i < 4; i++) {
        const sum = points[i].x + points[i].y;
        if (sum < minSum) {
            minSum = sum;
            tlIdx = i;
        }
    }

    // Rotate array so TL is first
    const result: Point[] = [];
    for (let i = 0; i < 4; i++) {
        result.push(points[(tlIdx + i) % 4]);
    }

    return result;
}

/**
 * Cleanup model resources
 */
export async function disposeSegmentation(): Promise<void> {
    if (samModel) {
        // Models in transformers.js are automatically garbage collected
        samModel = null;
    }
    samProcessor = null;
}
