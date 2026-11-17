import { describe, expect, it } from 'vitest';
import { canvasHolds, canvasRecord, inkThroughDraw, newCanvasSession } from './signature';

describe('signature reading boxes', () => {
  it('inkThroughDraw carries a row canvas\'s ink onto the frame where drawImage puts it (a wipe\'s row at y 520)', () => {
    // a 1920×200 row whose glyphs sit at its middle, drawn at (0, 420): the ink lands round y 520, not y 100
    expect(inkThroughDraw([300, 60, 900, 140], { width: 1920, height: 200 }, [0, 420])).toEqual([300, 480, 900, 560]);
  });

  it('inkThroughDraw follows the source and destination rects: a slice\'s half, slid and scaled', () => {
    // the right half of the row (x 960–1920) drawn 40 px further right at half height
    expect(inkThroughDraw([300, 60, 1200, 140], { width: 1920, height: 200 }, [960, 0, 960, 200, 1000, 420, 960, 100])).toEqual([1000, 450, 1240, 490]);
    // a part of the canvas the source rect leaves out carries nothing
    expect(inkThroughDraw([300, 60, 900, 140], { width: 1920, height: 200 }, [960, 0, 960, 200, 1000, 420, 960, 200])).toBeUndefined();
  });

  it('inkThroughDraw reads a negative width or height as the rect measured the other way, as the Canvas spec does (no flip)', () => {
    expect(inkThroughDraw([0, 0, 10, 10], { width: 100, height: 100 }, [0, 0, 100, 100, 100, 0, -100, 100])).toEqual([0, 0, 10, 10]);
    // a negative source rect is the same source rect, not a miss
    expect(inkThroughDraw([0, 0, 10, 10], { width: 100, height: 100 }, [100, 100, -100, -100, 0, 0, 100, 100])).toEqual([0, 0, 10, 10]);
  });

  it('a canvas cached across frames (melt\'s glyph pictures) keeps its ink however many measures later it is drawn', () => {
    const cached = {};
    newCanvasSession();
    canvasRecord(cached).b = [10, 20, 30, 40];
    // a later frame, then a second measure: the cached canvas is only drawn again, never redrawn
    newCanvasSession();
    newCanvasSession();
    expect(canvasHolds(cached)?.b).toEqual([10, 20, 30, 40]);
    // a canvas drawn into again in a new session starts its record afresh, as its content does
    canvasRecord(cached).b = [0, 0, 5, 5];
    expect(canvasHolds(cached)?.b).toEqual([0, 0, 5, 5]);
  });
});
