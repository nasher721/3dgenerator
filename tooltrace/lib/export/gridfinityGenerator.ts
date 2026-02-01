import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
import { Point } from '../vision/toolDetection';

export function generateGridfinitySTL(
    outlines: Point[][],
    paperScale: number,
    settings: {
        gridHeight: number; // in 7mm units
    }
): string {
    const scene = new THREE.Scene();

    // 1. Calculate Bounding Box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const scale = 1 / paperScale;

    if (outlines.length === 0) {
        // Default 1x1 if no tools
        minX = 0; minY = 0; maxX = 42 * paperScale; maxY = 42 * paperScale;
    } else {
        outlines.forEach(poly => {
            poly.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });
    }

    const widthMM = (maxX - minX) * scale;
    const depthMM = (maxY - minY) * scale;

    const unitSize = 42;
    const unitsX = Math.max(1, Math.ceil(widthMM / unitSize));
    const unitsY = Math.max(1, Math.ceil(depthMM / unitSize));

    const totalWidth = unitsX * unitSize;
    const totalDepth = unitsY * unitSize;
    const totalHeight = settings.gridHeight * 7;

    // 2. Create Base Geometry (The Bin)
    // We create a group to hold the parts
    const binGroup = new THREE.Group();

    // Main Body
    const geometry = new THREE.BoxGeometry(totalWidth - 0.5, totalHeight, totalDepth - 0.5);
    const material = new THREE.MeshBasicMaterial({ color: 0x0070f3 });
    const mesh = new THREE.Mesh(geometry, material);

    // Position so bottom is at 0
    mesh.position.y = totalHeight / 2;
    // Center logic: Gridfinity bins usually centered on grid
    mesh.position.x = totalWidth / 2;
    mesh.position.z = totalDepth / 2;

    binGroup.add(mesh);

    // Lip (Top stacking lip) - Simplified for MVP as a slightly larger top rim
    const lipHeight = 4.4;
    const lipGeo = new THREE.BoxGeometry(totalWidth - 0.5, lipHeight, totalDepth - 0.5);
    const lipMesh = new THREE.Mesh(lipGeo, material);
    lipMesh.position.y = totalHeight + (lipHeight / 2);
    lipMesh.position.x = totalWidth / 2;
    lipMesh.position.z = totalDepth / 2;
    // binGroup.add(lipMesh); // Disabled for simple box MVP

    scene.add(binGroup);

    // 3. Export to STL
    const exporter = new STLExporter();
    const result = exporter.parse(scene, { binary: false }); // ASCII for checking, or binary for size
    return result as string;
}
