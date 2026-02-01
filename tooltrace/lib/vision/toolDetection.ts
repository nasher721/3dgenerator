export interface Point {
    x: number;
    y: number;
}

import { segmentAtPoint, isModelLoaded, SegmentationProgress } from './segmentation';

/**
 * Trace a tool using AI-powered segmentation (SAM)
 * Falls back to flood-fill if segmentation fails
 */
export async function traceTool(
    image: HTMLImageElement,
    startPoint: Point,
    threshold: number = 30,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<Point[]> {
    // Try AI segmentation first if model is available
    if (isModelLoaded()) {
        try {
            const result = await segmentAtPoint(image, startPoint, onProgress);
            if (result && result.outline.length > 2) {
                return result.outline;
            }
        } catch (error) {
            console.warn('AI segmentation failed, falling back to flood-fill:', error);
        }
    }

    // Fallback to flood-fill algorithm
    return floodFillTrace(image, startPoint, threshold);
}

/**
 * Trace a tool using AI segmentation
 * Returns null if segmentation is not available or fails
 */
export async function traceToolWithAI(
    image: HTMLImageElement,
    startPoint: Point,
    onProgress?: (progress: SegmentationProgress) => void
): Promise<{ outline: Point[]; mask: ImageData | null; confidence: number } | null> {
    try {
        const result = await segmentAtPoint(image, startPoint, onProgress);
        if (result && result.outline.length > 2) {
            return {
                outline: result.outline,
                mask: result.mask,
                confidence: result.confidence
            };
        }
        return null;
    } catch (error) {
        console.error('AI tool tracing failed:', error);
        return null;
    }
}

/**
 * Original flood-fill based tool tracing
 * Used as fallback when AI segmentation is not available
 */
export function floodFillTrace(
    image: HTMLImageElement,
    startPoint: Point,
    threshold: number = 30
): Promise<Point[]> {
    return new Promise((resolve) => {
        // Create an offscreen canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            console.error("Could not get canvas context");
            resolve([]);
            return;
        }

        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { width, height, data } = imageData;

        // Simple Region Growing (Flood Fill style) to find the tool
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        const regionPixels: Point[] = [];

        // Get starting color
        const sx = Math.floor(startPoint.x);
        const sy = Math.floor(startPoint.y);

        if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
            resolve([]);
            return;
        }

        const startIdx = (sy * width + sx) * 4;
        const seedColor = {
            r: data[startIdx],
            g: data[startIdx + 1],
            b: data[startIdx + 2]
        };

        queue.push(sx, sy);
        visited[sy * width + sx] = 1;

        // 4-way connectivity for flood fill
        const dx = [1, -1, 0, 0];
        const dy = [0, 0, 1, -1];

        // Safety limit
        let iterations = 0;
        const maxIterations = width * height;

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const cy = queue.pop()!;
            const cx = queue.pop()!;
            regionPixels.push({ x: cx, y: cy });

            for (let i = 0; i < 4; i++) {
                const nx = cx + dx[i];
                const ny = cy + dy[i];

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = (ny * width + nx);
                    if (!visited[nIdx]) {
                        const pixelIdx = nIdx * 4;
                        const r = data[pixelIdx];
                        const g = data[pixelIdx + 1];
                        const b = data[pixelIdx + 2];

                        // Euclidean distance for color difference
                        const dist = Math.sqrt(
                            Math.pow(r - seedColor.r, 2) +
                            Math.pow(g - seedColor.g, 2) +
                            Math.pow(b - seedColor.b, 2)
                        );

                        if (dist < threshold) {
                            visited[nIdx] = 1;
                            queue.push(nx, ny);
                        }
                    }
                }
            }
        }

        // If we found a reasonable region, extract its outline
        if (regionPixels.length > 10) {
            const outline = extractOutline(visited, width, height);
            if (outline.length > 2) {
                resolve(simplifyPolygon(outline, 2.0));
                return;
            }
        }

        // Fallback: Return a box around the click point
        const boxSize = 50;
        resolve([
            { x: sx - boxSize, y: sy - boxSize },
            { x: sx + boxSize, y: sy - boxSize },
            { x: sx + boxSize, y: sy + boxSize },
            { x: sx - boxSize, y: sy + boxSize },
        ]);
    });
}

/**
 * Extract outline from a binary visited mask
 */
function extractOutline(visited: Uint8Array, width: number, height: number): Point[] {
    const outline: Point[] = [];
    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx]) {
                // Check if this is an edge pixel
                let isEdge = false;
                for (let d = 0; d < 4; d++) {
                    const nx = x + dx[d];
                    const ny = y + dy[d];
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                        isEdge = true;
                        break;
                    }
                    if (!visited[ny * width + nx]) {
                        isEdge = true;
                        break;
                    }
                }
                if (isEdge) {
                    outline.push({ x, y });
                }
            }
        }
    }

    // Order outline points
    if (outline.length < 3) return outline;
    return orderOutlinePoints(outline);
}

/**
 * Order outline points to form a continuous path
 */
function orderOutlinePoints(points: Point[]): Point[] {
    if (points.length < 3) return points;

    const ordered: Point[] = [points[0]];
    const remaining = new Set(points.slice(1).map((p, i) => i + 1));

    while (remaining.size > 0) {
        const current = ordered[ordered.length - 1];
        let nearest = -1;
        let nearestDist = Infinity;

        for (const idx of remaining) {
            const p = points[idx];
            const dist = Math.pow(p.x - current.x, 2) + Math.pow(p.y - current.y, 2);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = idx;
            }
        }

        if (nearest >= 0 && nearestDist < 100) { // Max 10 pixels distance
            ordered.push(points[nearest]);
            remaining.delete(nearest);
        } else {
            break; // Gap too large, stop
        }
    }

    return ordered;
}

/**
 * Simplify polygon using Douglas-Peucker algorithm
 */
function simplifyPolygon(points: Point[], tolerance: number): Point[] {
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

    if (maxDist > tolerance) {
        const left = simplifyPolygon(points.slice(0, maxIdx + 1), tolerance);
        const right = simplifyPolygon(points.slice(maxIdx), tolerance);
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
