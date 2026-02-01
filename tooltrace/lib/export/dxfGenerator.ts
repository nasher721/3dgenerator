import { Point } from '../vision/toolDetection';

export function generateDXF(
    outlines: Point[][],
    paperScale: number // pixels per mm
): string {
    // Header
    let dxf = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";

    // Convert pixels to mm
    const scale = 1 / paperScale;

    outlines.forEach(outline => {
        if (outline.length < 2) return;

        dxf += "0\nPOLYLINE\n8\n0\n66\n1\n"; // Layer 0, Flag 1 (follows vertices)

        outline.forEach((pt) => {
            const x = pt.x * scale;
            const y = -pt.y * scale; // Flip Y for CAD
            dxf += "0\nVERTEX\n8\n0\n10\n" + x.toFixed(4) + "\n20\n" + y.toFixed(4) + "\n30\n0.0\n";
        });

        // Close loop
        const first = outline[0];
        const x = first.x * scale;
        const y = -first.y * scale;
        dxf += "0\nVERTEX\n8\n0\n10\n" + x.toFixed(4) + "\n20\n" + y.toFixed(4) + "\n30\n0.0\n";

        dxf += "0\nSEQEND\n";
    });

    // Footer
    dxf += "0\nENDSEC\n0\nEOF\n";
    return dxf;
}
