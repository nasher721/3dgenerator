import { Point } from './toolDetection';

export interface PaperConfig {
    widthMM: number;
    heightMM: number;
}

export const PAPER_SIZES = {
    LETTER: { widthMM: 215.9, heightMM: 279.4 },
    A4: { widthMM: 210, heightMM: 297 }
};

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
