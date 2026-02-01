import { Point } from './toolDetection';
import { segmentAtPoint, SegmentationProgress } from './segmentation';

export interface PaperConfig {
    widthMM: number;
    heightMM: number;
}

export const PAPER_SIZES: Record<string, PaperConfig> = {
    LETTER: { widthMM: 215.9, heightMM: 279.4 },
    A4: { widthMM: 210, heightMM: 297 },
    LEGAL: { widthMM: 215.9, heightMM: 355.6 },
    A3: { widthMM: 297, heightMM: 420 },
    TABLOID: { widthMM: 279.4, heightMM: 431.8 }
};

/**
 * Calculate scale (pixels per mm) from paper corners
 */
export function calculateScale(
    corners: [Point, Point, Point, Point],
    paperSize: PaperConfig
): number {
    // Calculate distance in pixels between corners
    // Assumption: corners are TL, TR, BR, BL order

    // Average width in pixels
    const topWidth = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2));
    const botWidth = Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2));
    const avgWidthPx = (topWidth + botWidth) / 2;

    const scale = avgWidthPx / paperSize.widthMM; // pixels per mm
    return scale;
}

/**
 * Automatically detect paper in the image using AI segmentation
 * Click on the paper to segment it, then extract corners
 */
export async function detectPaperWithAI(
    image: HTMLImageElement,
    clickPoint: Point,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<Point[] | null> {
    try {
        const result = await segmentAtPoint(image, clickPoint, onProgress);
        if (!result || result.outline.length < 4) {
            return null;
        }

        // Find the 4 corners from the segmented outline
        const corners = findQuadrilateralCorners(result.outline);
        return corners;
    } catch (error) {
        console.error('AI paper detection failed:', error);
        return null;
    }
}

/**
 * Detect paper using traditional computer vision
 * Looks for large white/bright rectangular regions
 */
export async function detectPaperCV(
    image: HTMLImageElement,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<Point[] | null> {
    onProgress?.({ status: 'processing', message: 'Detecting paper...' });

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    // Step 1: Find bright pixels (paper is usually white/light)
    const brightMask = new Uint8Array(width * height);
    let totalBrightness = 0;
    const brightnessValues: number[] = [];

    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const brightness = (r + g + b) / 3;
        brightnessValues.push(brightness);
        totalBrightness += brightness;
    }

    // Calculate adaptive threshold (top 30% brightness)
    const sortedBrightness = [...brightnessValues].sort((a, b) => b - a);
    const thresholdIdx = Math.floor(sortedBrightness.length * 0.3);
    const brightnessThreshold = sortedBrightness[thresholdIdx];

    for (let i = 0; i < width * height; i++) {
        brightMask[i] = brightnessValues[i] >= brightnessThreshold ? 1 : 0;
    }

    // Step 2: Find largest connected region
    const largestRegion = findLargestConnectedRegion(brightMask, width, height);

    if (!largestRegion || largestRegion.length < (width * height * 0.01)) {
        onProgress?.({ status: 'complete', message: 'No paper detected' });
        return null;
    }

    // Step 3: Extract boundary points
    const boundary = extractBoundaryPoints(largestRegion, brightMask, width, height);

    // Step 4: Find convex hull
    const hull = convexHull(boundary);

    // Step 5: Approximate to quadrilateral
    const corners = approximateQuadrilateral(hull);

    onProgress?.({ status: 'complete', message: 'Paper detected' });

    return corners;
}

/**
 * Find the 4 corners of a quadrilateral from an outline
 */
function findQuadrilateralCorners(outline: Point[]): Point[] {
    if (outline.length < 4) return outline;

    // Find convex hull first
    const hull = convexHull(outline);

    // Approximate to 4 corners
    return approximateQuadrilateral(hull);
}

/**
 * Find largest connected region using flood fill
 */
function findLargestConnectedRegion(
    mask: Uint8Array,
    width: number,
    height: number
): Point[] | null {
    const visited = new Uint8Array(width * height);
    let largestRegion: Point[] = [];

    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1 && !visited[idx]) {
                // Flood fill to find region
                const region: Point[] = [];
                const stack: number[] = [x, y];

                while (stack.length > 0) {
                    const cy = stack.pop()!;
                    const cx = stack.pop()!;
                    const cidx = cy * width + cx;

                    if (visited[cidx]) continue;
                    visited[cidx] = 1;
                    region.push({ x: cx, y: cy });

                    for (let d = 0; d < 4; d++) {
                        const nx = cx + dx[d];
                        const ny = cy + dy[d];
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nidx = ny * width + nx;
                            if (mask[nidx] === 1 && !visited[nidx]) {
                                stack.push(nx, ny);
                            }
                        }
                    }
                }

                if (region.length > largestRegion.length) {
                    largestRegion = region;
                }
            }
        }
    }

    return largestRegion.length > 0 ? largestRegion : null;
}

/**
 * Extract boundary points from a region
 */
function extractBoundaryPoints(
    region: Point[],
    mask: Uint8Array,
    width: number,
    height: number
): Point[] {
    const boundary: Point[] = [];
    const dx = [1, -1, 0, 0, 1, -1, 1, -1];
    const dy = [0, 0, 1, -1, 1, 1, -1, -1];

    // Create a set for faster lookup
    const regionSet = new Set(region.map(p => `${p.x},${p.y}`));

    for (const p of region) {
        let isBoundary = false;
        for (let d = 0; d < 8; d++) {
            const nx = p.x + dx[d];
            const ny = p.y + dy[d];
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                isBoundary = true;
                break;
            }
            if (!regionSet.has(`${nx},${ny}`)) {
                isBoundary = true;
                break;
            }
        }
        if (isBoundary) {
            boundary.push(p);
        }
    }

    return boundary;
}

/**
 * Compute convex hull using Graham scan
 */
function convexHull(points: Point[]): Point[] {
    if (points.length < 3) return points;

    // Sample points for performance
    let sampled = points;
    if (points.length > 2000) {
        const step = Math.floor(points.length / 2000);
        sampled = points.filter((_, i) => i % step === 0);
    }

    // Find lowest point
    let lowest = sampled[0];
    for (const p of sampled) {
        if (p.y > lowest.y || (p.y === lowest.y && p.x < lowest.x)) {
            lowest = p;
        }
    }

    // Sort by polar angle
    const sorted = sampled
        .filter(p => p.x !== lowest.x || p.y !== lowest.y)
        .sort((a, b) => {
            const angleA = Math.atan2(a.y - lowest.y, a.x - lowest.x);
            const angleB = Math.atan2(b.y - lowest.y, b.x - lowest.x);
            if (Math.abs(angleA - angleB) < 0.0001) {
                const distA = (a.x - lowest.x) ** 2 + (a.y - lowest.y) ** 2;
                const distB = (b.x - lowest.x) ** 2 + (b.y - lowest.y) ** 2;
                return distA - distB;
            }
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
 * Cross product for determining turn direction
 */
function cross(o: Point, a: Point, b: Point): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Approximate a convex hull to a quadrilateral (4 corners)
 */
function approximateQuadrilateral(hull: Point[]): Point[] {
    if (hull.length <= 4) return reorderCorners(hull);

    // Use Ramer-Douglas-Peucker to simplify to approximately 4 points
    let simplified = hull;
    let tolerance = 5;

    while (simplified.length > 4 && tolerance < 100) {
        simplified = douglasPeucker(hull, tolerance);
        tolerance += 5;
    }

    // If we have more than 4 points, pick the 4 most extreme
    if (simplified.length > 4) {
        simplified = pickExtremePoints(simplified);
    }

    return reorderCorners(simplified);
}

/**
 * Ramer-Douglas-Peucker simplification
 */
function douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

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

    if (maxDist > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIdx), epsilon);
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
        return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
    const nearestX = lineStart.x + t * dx;
    const nearestY = lineStart.y + t * dy;

    return Math.sqrt((point.x - nearestX) ** 2 + (point.y - nearestY) ** 2);
}

/**
 * Pick the 4 most extreme points (corners)
 */
function pickExtremePoints(points: Point[]): Point[] {
    // Find min/max x and y
    let minX = points[0], maxX = points[0];
    let minY = points[0], maxY = points[0];

    for (const p of points) {
        if (p.x < minX.x) minX = p;
        if (p.x > maxX.x) maxX = p;
        if (p.y < minY.y) minY = p;
        if (p.y > maxY.y) maxY = p;
    }

    // Return unique points
    const result: Point[] = [];
    const seen = new Set<string>();

    for (const p of [minX, maxX, minY, maxY]) {
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        if (!seen.has(key)) {
            result.push(p);
            seen.add(key);
        }
    }

    // If we don't have 4, find additional extreme points
    while (result.length < 4 && points.length > result.length) {
        let maxDist = 0;
        let farthest: Point | null = null;

        for (const p of points) {
            const key = `${Math.round(p.x)},${Math.round(p.y)}`;
            if (seen.has(key)) continue;

            // Calculate min distance to existing points
            let minDistToExisting = Infinity;
            for (const existing of result) {
                const dist = Math.sqrt((p.x - existing.x) ** 2 + (p.y - existing.y) ** 2);
                minDistToExisting = Math.min(minDistToExisting, dist);
            }

            if (minDistToExisting > maxDist) {
                maxDist = minDistToExisting;
                farthest = p;
            }
        }

        if (farthest) {
            result.push(farthest);
            seen.add(`${Math.round(farthest.x)},${Math.round(farthest.y)}`);
        } else {
            break;
        }
    }

    return result;
}

/**
 * Reorder corners to TL, TR, BR, BL order
 */
function reorderCorners(corners: Point[]): Point[] {
    if (corners.length !== 4) return corners;

    // Find center
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;

    // Sort by angle from center
    const sorted = [...corners].sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        return angleA - angleB;
    });

    // Find top-left (smallest x + y)
    let tlIdx = 0;
    let minSum = sorted[0].x + sorted[0].y;
    for (let i = 1; i < 4; i++) {
        const sum = sorted[i].x + sorted[i].y;
        if (sum < minSum) {
            minSum = sum;
            tlIdx = i;
        }
    }

    // Rotate to start from TL
    const result: Point[] = [];
    for (let i = 0; i < 4; i++) {
        result.push(sorted[(tlIdx + i) % 4]);
    }

    return result;
}

/**
 * Get scale in both dimensions for perspective-corrected measurements
 */
export function calculateScaleBidirectional(
    corners: [Point, Point, Point, Point],
    paperSize: PaperConfig
): { scaleX: number; scaleY: number; avgScale: number } {
    // Calculate widths and heights
    const topWidth = Math.sqrt((corners[1].x - corners[0].x) ** 2 + (corners[1].y - corners[0].y) ** 2);
    const botWidth = Math.sqrt((corners[2].x - corners[3].x) ** 2 + (corners[2].y - corners[3].y) ** 2);
    const leftHeight = Math.sqrt((corners[3].x - corners[0].x) ** 2 + (corners[3].y - corners[0].y) ** 2);
    const rightHeight = Math.sqrt((corners[2].x - corners[1].x) ** 2 + (corners[2].y - corners[1].y) ** 2);

    const avgWidth = (topWidth + botWidth) / 2;
    const avgHeight = (leftHeight + rightHeight) / 2;

    const scaleX = avgWidth / paperSize.widthMM;
    const scaleY = avgHeight / paperSize.heightMM;
    const avgScale = (scaleX + scaleY) / 2;

    return { scaleX, scaleY, avgScale };
}
