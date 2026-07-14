// Downsample an AudioBuffer into per-bucket min/max pairs for waveform drawing.
// One bucket per device pixel of canvas width. O(total samples) — run on load/resize,
// never per frame.

export interface Peaks {
  min: Float32Array
  max: Float32Array
  buckets: number
}

export function computePeaks(buffer: AudioBuffer, buckets: number): Peaks {
  const channels = buffer.numberOfChannels
  const len = buffer.length
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  if (buckets <= 0 || len === 0) return { min, max, buckets }

  const data: Float32Array[] = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))

  const samplesPerBucket = len / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * samplesPerBucket)
    const end = Math.min(len, Math.floor((b + 1) * samplesPerBucket))
    let mn = 0
    let mx = 0
    for (let i = start; i < end; i++) {
      let s = 0
      for (let c = 0; c < channels; c++) s += data[c][i]
      s /= channels
      if (s < mn) mn = s
      else if (s > mx) mx = s
    }
    min[b] = mn
    max[b] = mx
  }
  return { min, max, buckets }
}
