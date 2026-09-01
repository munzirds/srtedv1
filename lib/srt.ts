export interface Cue {
  id: number
  start: number // seconds
  end: number   // seconds
  text: string
}

const timeToSec = (t: string): number => {
  const [h, m, rest] = t.split(':')
  const [s, ms] = rest.replace(',', '.').split('.')
  return +h * 3600 + +m * 60 + +s + +ms / 1000
}

const secToTime = (s: number): string => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function parseSRT(raw: string): Cue[] {
  return raw
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split('\n')
      const id = parseInt(lines[0], 10)
      const [startStr, endStr] = lines[1].split(' --> ')
      const text = lines.slice(2).join('\n')
      return { id, start: timeToSec(startStr.trim()), end: timeToSec(endStr.trim()), text }
    })
    .filter((c) => !isNaN(c.id))
}

export function serializeSRT(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${secToTime(c.start)} --> ${secToTime(c.end)}\n${c.text}`)
    .join('\n\n') + '\n'
}

/** Returns gaps (silence) between cues longer than minGap seconds */
export function getGaps(cues: Cue[], minGap = 1.5): Array<{ start: number; end: number }> {
  const gaps: Array<{ start: number; end: number }> = []
  for (let i = 0; i < cues.length - 1; i++) {
    const gap = cues[i + 1].start - cues[i].end
    if (gap > minGap) gaps.push({ start: cues[i].end, end: cues[i + 1].start })
  }
  return gaps
}
