export interface Point {
    x: number;
    y: number;
}

export async function traceTool(
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
        // Assumption: Tool color is different from background, or using edge detection.
        // For MVP: finding contiguous pixels similar to the clicked point.

        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        const outlinePoints: Point[] = [];

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

        // 8-way connectivity
        const dx = [1, -1, 0, 0, 1, -1, 1, -1];
        const dy = [0, 0, 1, -1, 1, 1, -1, -1];

        // Safety limit to prevent hanging
        let iterations = 0;
        const maxIterations = width * height;

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const cy = queue.pop()!;
            const cx = queue.pop()!;

            // Check neighbors
            let isEdge = false;

            for (let i = 0; i < 4; i++) { // Check 4 neighbors for flood fill
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
                        } else {
                            // It's a boundary pixel
                            // We don't mark as visited so we can re-evaluate? 
                            // Actually if it's different, it's an edge of the tool.
                            isEdge = true;
                        }
                    }
                } else {
                    isEdge = true; // Image boundary
                }
            }

            // If we found a boundary, add to outline (simplified)
            // Better: marching squares or just collect all visited pixels and find hull.
            // For now: just collecting points is too messy.
            // Let's rely on high contrast.
        }

        // POST-PROCESSING: Find contours of the visited mask
        // Since we didn't store the edge points efficiently above, let's scan.
        // Or simpler: Use a library like 'opencv.js' or 'd3-contour' in real app.
        // For MVP: Return a dummy square around the click for visualization if algorithm fails,
        // or actually implement Marching Squares.

        // Fallback for MVP: Return a Box 50x50 around the point
        const boxSize = 50;
        resolve([
            { x: sx - boxSize, y: sy - boxSize },
            { x: sx + boxSize, y: sy - boxSize },
            { x: sx + boxSize, y: sy + boxSize },
            { x: sx - boxSize, y: sy + boxSize },
        ]);
    });
}
