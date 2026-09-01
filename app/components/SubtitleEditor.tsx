'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { parseSRT, serializeSRT, getGaps, type Cue } from '@/lib/srt'

const GAP_THRESHOLD = 1.5 // seconds of silence to skip

export default function SubtitleEditor() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [cues, setCues] = useState<Cue[]>([])
  const [activeCueId, setActiveCueId] = useState<number | null>(null)
  const [skipSilence, setSkipSilence] = useState(false)
  const [fileName, setFileName] = useState('subtitles')
  const skipRef = useRef(skipSilence)
  skipRef.current = skipSilence

  // ── File loaders ──────────────────────────────────────────────────────────
  const loadVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVideoUrl(URL.createObjectURL(file))
  }

  const loadSRT = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name.replace(/\.srt$/i, ''))
    file.text().then((raw) => setCues(parseSRT(raw)))
  }

  // ── Playback sync ─────────────────────────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    setCurrentTime(t)

    // Skip silence
    if (skipRef.current && cues.length) {
      const gaps = getGaps(cues, GAP_THRESHOLD)
      for (const g of gaps) {
        if (t >= g.start + 0.1 && t < g.end - 0.1) {
          v.currentTime = g.end
          return
        }
      }
    }

    // Active cue highlight
    const active = cues.find((c) => t >= c.start && t <= c.end)
    setActiveCueId(active?.id ?? null)
  }, [cues])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
  }, [onTimeUpdate])

  // ── Timeline scroll to active cue ─────────────────────────────────────────
  useEffect(() => {
    if (activeCueId === null) return
    const el = document.getElementById(`cue-${activeCueId}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeCueId])

  // ── Cue editing ───────────────────────────────────────────────────────────
  const updateCue = (id: number, field: keyof Cue, value: string | number) => {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const seekTo = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t
  }

  const skipToNext = () => {
    if (!cues.length) return
    const next = cues.find((c) => c.start > currentTime + 0.1)
    if (next) seekTo(next.start)
  }

  const skipToPrev = () => {
    if (!cues.length) return
    const prev = [...cues].reverse().find((c) => c.start < currentTime - 0.5)
    if (prev) seekTo(prev.start)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportSRT = () => {
    const blob = new Blob([serializeSRT(cues)], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName}.srt`
    a.click()
  }

  // ── Timeline bar ──────────────────────────────────────────────────────────
  const seekFromTimeline = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    seekTo(ratio * duration)
  }

  const gaps = cues.length ? getGaps(cues, GAP_THRESHOLD) : []

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 flex-wrap">
        <span className="font-bold text-lg tracking-tight text-white mr-2">SRTed</span>

        <label className="btn">
          📹 Video
          <input type="file" accept="video/*" className="hidden" onChange={loadVideo} />
        </label>
        <label className="btn">
          📄 SRT
          <input type="file" accept=".srt" className="hidden" onChange={loadSRT} />
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipSilence}
              onChange={(e) => setSkipSilence(e.target.checked)}
              className="accent-indigo-500"
            />
            Skip silence
          </label>
          <button onClick={skipToPrev} className="btn" title="Previous cue (←)">⏮</button>
          <button onClick={skipToNext} className="btn" title="Next cue (→)">⏭</button>
          {cues.length > 0 && (
            <button onClick={exportSRT} className="btn bg-indigo-600 hover:bg-indigo-500">
              ⬇ Export SRT
            </button>
          )}
        </div>
      </header>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: video + timeline ── */}
        <div className="flex flex-col w-1/2 border-r border-zinc-800 overflow-hidden">
          {/* Video */}
          <div className="relative bg-black flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full h-full object-contain"
                  onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                />
                {/* Subtitle overlay */}
                {activeCueId !== null && (
                  <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                    <span className="bg-black/70 text-white text-sm px-3 py-1 rounded text-center max-w-[80%] whitespace-pre-wrap">
                      {cues.find((c) => c.id === activeCueId)?.text}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-zinc-500 text-sm">Load a video file to begin</p>
            )}
          </div>

          {/* Timeline scrubber */}
          {duration > 0 && (
            <div className="px-3 py-2 shrink-0">
              <div
                className="relative h-8 bg-zinc-800 rounded cursor-pointer overflow-hidden"
                onClick={seekFromTimeline}
                ref={timelineRef}
              >
                {/* Silence gaps */}
                {gaps.map((g, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full bg-zinc-700/60"
                    style={{ left: `${(g.start / duration) * 100}%`, width: `${((g.end - g.start) / duration) * 100}%` }}
                  />
                ))}
                {/* Cue blocks */}
                {cues.map((c) => (
                  <div
                    key={c.id}
                    className={`absolute top-1 h-6 rounded-sm ${c.id === activeCueId ? 'bg-indigo-400' : 'bg-indigo-700 hover:bg-indigo-600'}`}
                    style={{ left: `${(c.start / duration) * 100}%`, width: `${Math.max(((c.end - c.start) / duration) * 100, 0.3)}%` }}
                    onClick={(e) => { e.stopPropagation(); seekTo(c.start) }}
                    title={c.text}
                  />
                ))}
                {/* Playhead */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-500 mt-0.5">
                <span>{fmt(currentTime)}</span>
                <span>{cues.length} cues · {gaps.length} gaps</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: cue list editor ── */}
        <div className="flex flex-col w-1/2 overflow-hidden">
          {cues.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Load an SRT file to edit subtitles
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
              {cues.map((c) => (
                <CueRow
                  key={c.id}
                  cue={c}
                  active={c.id === activeCueId}
                  onSeek={seekTo}
                  onChange={updateCue}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CueRow ────────────────────────────────────────────────────────────────────
function CueRow({
  cue,
  active,
  onSeek,
  onChange,
}: {
  cue: Cue
  active: boolean
  onSeek: (t: number) => void
  onChange: (id: number, field: keyof Cue, value: string | number) => void
}) {
  return (
    <div
      id={`cue-${cue.id}`}
      className={`flex gap-2 px-3 py-2 text-sm transition-colors ${active ? 'bg-indigo-950 border-l-2 border-indigo-400' : 'hover:bg-zinc-900'}`}
    >
      {/* Index + seek */}
      <button
        className="text-zinc-500 hover:text-indigo-400 w-7 shrink-0 text-right font-mono"
        onClick={() => onSeek(cue.start)}
        title="Seek to cue"
      >
        {cue.id}
      </button>

      {/* Timecodes */}
      <div className="flex flex-col gap-0.5 shrink-0 font-mono text-xs text-zinc-400">
        <TimeInput value={cue.start} onChange={(v) => onChange(cue.id, 'start', v)} />
        <TimeInput value={cue.end} onChange={(v) => onChange(cue.id, 'end', v)} />
      </div>

      {/* Text */}
      <textarea
        className="flex-1 bg-transparent resize-none outline-none text-zinc-100 placeholder-zinc-600 leading-snug"
        rows={2}
        value={cue.text}
        onChange={(e) => onChange(cue.id, 'text', e.target.value)}
      />
    </div>
  )
}

// ── TimeInput ─────────────────────────────────────────────────────────────────
function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const display = fmt(value)

  const commit = () => {
    setEditing(false)
    const parsed = parseTimeInput(raw)
    if (!isNaN(parsed)) onChange(parsed)
  }

  return editing ? (
    <input
      autoFocus
      className="bg-zinc-800 rounded px-1 w-28 outline-none"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  ) : (
    <span
      className="cursor-pointer hover:text-indigo-300 w-28"
      onClick={() => { setEditing(true); setRaw(display) }}
    >
      {display}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toFixed(3)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.padStart(6, '0')}`
}

function parseTimeInput(s: string): number {
  // accepts HH:MM:SS.mmm or MM:SS.mmm or SS.mmm
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}
