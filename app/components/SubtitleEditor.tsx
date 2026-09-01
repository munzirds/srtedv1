'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { parseSRT, parseVTT, serializeSRT, serializeVTT, getGaps, type Cue } from '@/lib/srt'

const GAP_THRESHOLD = 1.5

// ── Theme hook ────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    setDark(!document.documentElement.classList.contains('light'))
  }, [])
  const toggle = () => {
    const isLight = document.documentElement.classList.toggle('light')
    localStorage.setItem('theme', isLight ? 'light' : 'dark')
    setDark(!isLight)
  }
  return { dark, toggle }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toFixed(3)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.padStart(6, '0')}`
}

function parseTimeInput(s: string): number {
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

function charCountColor(len: number) {
  if (len > 80) return 'text-red-400'
  if (len > 60) return 'text-yellow-400'
  return 'text-zinc-600'
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({
  accept,
  label,
  icon,
  onFile,
}: {
  accept: string
  label: string
  icon: string
  onFile: (f: File) => void
}) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (f: File | undefined) => { if (f) onFile(f) }

  return (
    <div
      className={`drop-zone h-28 w-full${over ? ' drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]) }}
    >
      <span className="text-3xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-zinc-600">or click to browse</span>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
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
  const [fileFormat, setFileFormat] = useState<'srt' | 'vtt'>('srt')
  const [timelineTooltip, setTimelineTooltip] = useState<{ x: number; time: string } | null>(null)
  const [splitPct, setSplitPct] = useState(50)
  const [searchQuery, setSearchQuery] = useState('')
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const wasPlayingRef = useRef(false)
  const skipRef = useRef(skipSilence)
  skipRef.current = skipSilence
  const { dark, toggle: toggleTheme } = useTheme()

  // Pause video when editing starts, resume when done
  const onEditStart = () => {
    const v = videoRef.current
    if (v && !v.paused) {
      wasPlayingRef.current = true
      v.pause()
    }
  }
  const onEditEnd = () => {
    const v = videoRef.current
    if (v && wasPlayingRef.current) {
      wasPlayingRef.current = false
      v.play()
    }
  }

  // Filter cues by search
  const filteredCues = searchQuery
    ? cues.filter((c) => c.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : cues

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── File loaders ──────────────────────────────────────────────────────────
  const loadVideo = (file: File) => setVideoUrl(URL.createObjectURL(file))

  const loadSubtitle = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    setFileName(file.name.replace(/\.(srt|vtt)$/i, ''))
    setFileFormat(ext === 'vtt' ? 'vtt' : 'srt')
    file.text().then((raw) => setCues(ext === 'vtt' ? parseVTT(raw) : parseSRT(raw)))
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); skipToPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skipToNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues, currentTime])

  // ── Playback sync ─────────────────────────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    setCurrentTime(t)
    if (skipRef.current && cues.length) {
      const gaps = getGaps(cues, GAP_THRESHOLD)
      for (const g of gaps) {
        if (t >= g.start + 0.1 && t < g.end - 0.1) { v.currentTime = g.end; return }
      }
    }
    const active = cues.find((c) => t >= c.start && t <= c.end)
    setActiveCueId(active?.id ?? null)
  }, [cues])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
  }, [onTimeUpdate])

  useEffect(() => {
    if (activeCueId === null) return
    document.getElementById(`cue-${activeCueId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeCueId])

  // ── Cue editing ───────────────────────────────────────────────────────────
  const updateCue = (id: number, field: keyof Cue, value: string | number) =>
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))

  const seekTo = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t }

  const skipToNext = () => {
    const next = cues.find((c) => c.start > currentTime + 0.1)
    if (next) seekTo(next.start)
  }

  const skipToPrev = () => {
    const prev = [...cues].reverse().find((c) => c.start < currentTime - 0.5)
    if (prev) seekTo(prev.start)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportFile = (fmt: 'srt' | 'vtt') => {
    const content = fmt === 'vtt' ? serializeVTT(cues) : serializeSRT(cues)
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName}.${fmt}`
    a.click()
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  const seekFromTimeline = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    seekTo(((e.clientX - rect.left) / rect.width) * duration)
  }

  const onTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * duration
    setTimelineTooltip({ x: e.clientX - rect.left, time: fmt(t) })
  }

  const gaps = cues.length ? getGaps(cues, GAP_THRESHOLD) : []

  // ── Divider drag ──────────────────────────────────────────────────────────
  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(Math.max(pct, 20), 80))
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Active cue text (works for both SRT and VTT) ─────────────────────────
  const activeCueText = activeCueId !== null ? (cues.find((c) => c.id === activeCueId)?.text ?? null) : null

  // ── Empty state ───────────────────────────────────────────────────────────
  const isEmpty = !videoUrl && cues.length === 0

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="font-bold text-base tracking-tight text-white mr-1">SRTed</span>

        {/* File buttons — hidden on mobile when we have content */}
        <label className="btn hidden sm:inline-flex items-center gap-1.5">
          <VideoIcon /> Video
          <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && loadVideo(e.target.files[0])} />
        </label>
        <label className="btn hidden sm:inline-flex items-center gap-1.5">
          <SubIcon /> SRT / VTT
          <input type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => e.target.files?.[0] && loadSubtitle(e.target.files[0])} />
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-zinc-400">
            <input
              type="checkbox"
              checked={skipSilence}
              onChange={(e) => setSkipSilence(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="hidden sm:inline">Skip silence</span>
          </label>

          <button onClick={skipToPrev} className="btn px-2" title="Previous cue (←)">
            <PrevIcon />
          </button>
          <button onClick={skipToNext} className="btn px-2" title="Next cue (→)">
            <NextIcon />
          </button>

          {cues.length > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={() => exportFile(fileFormat)} className="btn bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5">
                <DownloadIcon />
                <span className="hidden sm:inline">Export</span>
                <span className="uppercase text-xs opacity-70">.{fileFormat}</span>
              </button>
              <button
                onClick={() => exportFile(fileFormat === 'srt' ? 'vtt' : 'srt')}
                className="btn text-xs text-zinc-400"
                title={`Also export as .${fileFormat === 'srt' ? 'vtt' : 'srt'}`}
              >
                .{fileFormat === 'srt' ? 'vtt' : 'srt'}
              </button>
            </div>
          )}

          <button onClick={toggleTheme} className="btn px-2" title="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ── Search bar (when cues loaded) ── */}
      {cues.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900/50 border-b border-zinc-800 shrink-0">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search cues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder-zinc-500"
          />
          {searchQuery && (
            <span className="text-xs text-zinc-500">{filteredCues.length} / {cues.length}</span>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-zinc-300 p-1">
              <CloseIcon />
            </button>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <p className="text-zinc-400 text-sm font-medium">Drop files to get started</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
            <DropZone accept="video/*" label="Video file" icon="🎬" onFile={loadVideo} />
            <DropZone accept=".srt,.vtt" label="SRT or VTT file" icon="💬" onFile={loadSubtitle} />
          </div>
          <p className="text-zinc-600 text-xs">Keyboard: Space play/pause · ← prev cue · → next cue</p>
        </div>
      )}

      {/* ── Main area ── */}
      {!isEmpty && (
        // Mobile: vertical stack (video top, cues below), scrollable
        // Desktop: horizontal split with draggable divider
        <div
          className="flex flex-col sm:flex-row flex-1 sm:overflow-hidden overflow-y-auto"
          ref={containerRef}
        >
          {/* ── Left: video + timeline ── */}
          <div
            className="flex flex-col shrink-0 sm:overflow-hidden"
            style={{ width: isMobile ? '100%' : `${splitPct}%` }}
          >
            {/* Video or drop zone */}
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
                  {activeCueText !== null && (
                    <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                      <span className="bg-black/75 text-white text-sm px-3 py-1 rounded-md text-center max-w-[80%] whitespace-pre-wrap leading-snug shadow-lg">
                        {activeCueText}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 p-4 flex items-center justify-center">
                  <DropZone accept="video/*" label="Drop video here" icon="🎬" onFile={loadVideo} />
                </div>
              )}
            </div>


            {/* Timeline scrubber */}
            {duration > 0 && (
              <div className="px-3 py-2 shrink-0 border-t border-zinc-800/60">
                <div
                  className="relative h-8 bg-zinc-800 rounded cursor-pointer overflow-hidden"
                  onClick={seekFromTimeline}
                  onMouseMove={onTimelineMouseMove}
                  onMouseLeave={() => setTimelineTooltip(null)}
                  ref={timelineRef}
                >
                  {gaps.map((g, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full bg-zinc-700/50"
                      style={{ left: `${(g.start / duration) * 100}%`, width: `${((g.end - g.start) / duration) * 100}%` }}
                    />
                  ))}
                  {cues.map((c) => (
                    <div
                      key={c.id}
                      className={`absolute top-1 h-6 rounded-sm transition-colors ${c.id === activeCueId ? 'bg-indigo-400' : 'bg-indigo-700 hover:bg-indigo-500'}`}
                      style={{ left: `${(c.start / duration) * 100}%`, width: `${Math.max(((c.end - c.start) / duration) * 100, 0.3)}%` }}
                      onClick={(e) => { e.stopPropagation(); seekTo(c.start) }}
                      title={c.text}
                    />
                  ))}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-red-500 pointer-events-none"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                  {timelineTooltip && (
                    <div
                      className="absolute top-0 -translate-y-full -translate-x-1/2 bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                      style={{ left: timelineTooltip.x }}
                    >
                      {timelineTooltip.time}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>{fmt(currentTime)}</span>
                  <span>{cues.length} cues · {gaps.length} gaps</span>
                  <span>{fmt(duration)}</span>
                </div>
              </div>
            )}

            {/* Keyboard hint */}
            <p className="hidden sm:block text-center text-xs text-zinc-700 pb-1">
              Space play/pause · ← prev · → next cue
            </p>
          </div>

          {/* ── Divider (desktop only) ── */}
          <div
            className="hidden sm:flex w-1.5 bg-zinc-800 hover:bg-indigo-500 active:bg-indigo-400 cursor-col-resize shrink-0 transition-colors items-center justify-center group"
            onMouseDown={onDividerMouseDown}
          >
            <div className="w-0.5 h-6 rounded-full bg-zinc-600 group-hover:bg-indigo-300 transition-colors" />
          </div>

          {/* ── Right: cue list editor ── */}
          <div
            className="flex flex-col min-w-0 overflow-hidden sm:border-t-0 border-t border-zinc-800"
            style={{ width: isMobile ? '100%' : `${100 - splitPct}%`, ...(isMobile ? { height: '50vh' } : {}) }}
          >
            {cues.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                <DropZone accept=".srt,.vtt" label="Drop SRT or VTT file" icon="💬" onFile={loadSubtitle} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/70 cue-scroll">
                {filteredCues.map((c) => (
                  <CueRow
                    key={c.id}
                    cue={c}
                    active={c.id === activeCueId}
                    onSeek={seekTo}
                    onChange={updateCue}
                    onEditStart={onEditStart}
                    onEditEnd={onEditEnd}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CueRow ────────────────────────────────────────────────────────────────────
function CueRow({
  cue,
  active,
  onSeek,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  cue: Cue
  active: boolean
  onSeek: (t: number) => void
  onChange: (id: number, field: keyof Cue, value: string | number) => void
  onEditStart: () => void
  onEditEnd: () => void
}) {
  const dur = cue.end - cue.start
  const charLen = cue.text.replace(/\n/g, '').length

  return (
    <div
      id={`cue-${cue.id}`}
      className={`flex gap-3 sm:gap-2 px-3 py-3 sm:py-2 text-sm transition-colors ${
        active
          ? 'bg-indigo-950/70 border-l-4 border-indigo-400'
          : 'border-l-4 border-transparent hover:bg-zinc-900'
      }`}
    >
      {/* Index + seek */}
      <button
        className="text-zinc-500 hover:text-indigo-400 w-8 sm:w-7 shrink-0 text-right font-mono min-h-[44px] sm:min-h-0 flex items-start justify-end pt-0.5"
        onClick={() => onSeek(cue.start)}
        title="Seek to cue"
      >
        {cue.id}
      </button>

      {/* Timecodes + duration */}
      <div className="flex flex-col gap-1 sm:gap-0.5 shrink-0 font-mono text-xs text-zinc-400">
        <TimeInput value={cue.start} onChange={(v) => onChange(cue.id, 'start', v)} onEditStart={onEditStart} onEditEnd={onEditEnd} />
        <TimeInput value={cue.end} onChange={(v) => onChange(cue.id, 'end', v)} onEditStart={onEditStart} onEditEnd={onEditEnd} />
        <span className="text-zinc-600 tabular-nums">{dur.toFixed(2)}s</span>
      </div>

      {/* Text + char count */}
      <div className="flex flex-col flex-1 gap-0.5">
        <textarea
          className="flex-1 bg-transparent resize-none outline-none text-zinc-100 placeholder-zinc-600 leading-snug min-h-[3rem] sm:min-h-[2.5rem] text-base sm:text-sm"
          rows={2}
          value={cue.text}
          onChange={(e) => onChange(cue.id, 'text', e.target.value)}
          onFocus={onEditStart}
          onBlur={onEditEnd}
        />
        <span className={`text-xs self-end tabular-nums ${charCountColor(charLen)}`}>
          {charLen}
        </span>
      </div>
    </div>
  )
}

// ── TimeInput ─────────────────────────────────────────────────────────────────
function TimeInput({ value, onChange, onEditStart, onEditEnd }: { value: number; onChange: (v: number) => void; onEditStart: () => void; onEditEnd: () => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const startEdit = () => {
    setEditing(true)
    setRaw(fmt(value))
    onEditStart()
  }

  const commit = () => {
    setEditing(false)
    const parsed = parseTimeInput(raw)
    if (!isNaN(parsed)) onChange(parsed)
    onEditEnd()
  }

  return editing ? (
    <input
      autoFocus
      className="bg-zinc-800 rounded px-1 w-28 outline-none min-h-[44px] sm:min-h-0"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  ) : (
    <span
      className="cursor-pointer hover:text-indigo-300 w-28 min-h-[44px] sm:min-h-0 flex items-center"
      onClick={startEdit}
    >
      {fmt(value)}
    </span>
  )
}

// ── Icons (inline SVG, no extra deps) ────────────────────────────────────────
const VideoIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.36A1 1 0 0122 9.07v5.86a1 1 0 01-1.53.9L15.75 13.5M4 8h8.25A2.25 2.25 0 0114.5 10.25v3.5A2.25 2.25 0 0112.25 16H4a2 2 0 01-2-2v-4a2 2 0 012-2z" />
  </svg>
)

const SubIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
)

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)

const PrevIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 010-1.954l7.108-4.061A1.125 1.125 0 0121 8.689v8.122zM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 010-1.954l7.108-4.061a1.125 1.125 0 011.683.977v8.122z" />
  </svg>
)

const NextIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954L4.683 17.788A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 0112.75 16.811V8.69z" />
  </svg>
)

const SunIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
  </svg>
)

const MoonIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
  </svg>
)

const SearchIcon = () => (
  <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
)

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

