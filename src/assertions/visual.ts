/**
 * Visual Regression Assertions
 * Compare before/after screenshots using pixelmatch.
 * Adapted from Website Guru's visual-verify/diff.ts.
 */

import type { TestAssertion, AssertionResult } from '../core/types'

/**
 * Compare two screenshots (base64 PNG) for visual regression.
 * Returns pass/fail based on diff percentage threshold.
 */
export async function runVisualAssertion(
  assertion: TestAssertion,
  beforeScreenshot: string,
  afterScreenshot: string,
  maxDiffPercent = 5.0,
): Promise<AssertionResult> {
  try {
    const { PNG } = await import('pngjs')
    const pixelmatch = (await import('pixelmatch')).default

    const beforeBuf = Buffer.from(beforeScreenshot, 'base64')
    const afterBuf = Buffer.from(afterScreenshot, 'base64')

    const beforePng = PNG.sync.read(beforeBuf)
    const afterPng = PNG.sync.read(afterBuf)

    const width = Math.min(beforePng.width, afterPng.width)
    const height = Math.min(beforePng.height, afterPng.height)

    // Crop both images to same size
    const beforeData = cropImageData(beforePng, width, height)
    const afterData = cropImageData(afterPng, width, height)

    const diffPng = new PNG({ width, height })

    const diffPixels = pixelmatch(
      beforeData,
      afterData,
      diffPng.data,
      width,
      height,
      { threshold: 0.1, includeAA: false },
    )

    const totalPixels = width * height
    const diffPercentage = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0
    const passed = diffPercentage <= maxDiffPercent

    return {
      assertion,
      passed,
      actual: Math.round(diffPercentage * 100) / 100,
      error: passed
        ? undefined
        : `Visual regression: ${diffPercentage.toFixed(2)}% pixels differ (threshold: ${maxDiffPercent}%)`,
    }
  } catch (err) {
    return {
      assertion,
      passed: false,
      error: `Visual assertion error: ${err instanceof Error ? err.message : err}`,
    }
  }
}

function cropImageData(png: { data: Buffer; width: number; height: number }, targetWidth: number, targetHeight: number): Uint8Array {
  if (png.width === targetWidth && png.height === targetHeight) {
    return new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength)
  }
  const result = new Uint8Array(targetWidth * targetHeight * 4)
  for (let y = 0; y < targetHeight; y++) {
    const srcStart = y * png.width * 4
    const dstStart = y * targetWidth * 4
    const rowBytes = targetWidth * 4
    result.set(png.data.subarray(srcStart, srcStart + rowBytes), dstStart)
  }
  return result
}
