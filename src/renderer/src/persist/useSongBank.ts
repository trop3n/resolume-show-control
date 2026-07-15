import { useCallback, useEffect, useRef, useState } from 'react'
import type { TransportApi } from '../hooks/useTransport'
import type { ShowApi } from '../show/useShow'
import type { SavedShow, SongMeta } from './types'

export interface SongBankApi {
  library: SongMeta[]
  currentId: string | null
  name: string
  audioName: string | null
  audioMissing: boolean
  dirty: boolean
  setName: (n: string) => void
  refresh: () => Promise<void>
  openAudio: () => Promise<void>
  loadDropped: (file: File) => Promise<void>
  save: () => Promise<void>
  saveAsNew: () => Promise<void>
  loadShow: (id: string) => Promise<void>
  deleteShow: (id: string) => Promise<void>
  newShow: () => void
}

function deriveName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

/** Signature of the persistable state — used to detect unsaved changes. */
function signature(
  name: string,
  audioPath: string | null,
  bpm: number,
  beatOffset: number,
  cues: unknown[]
): string {
  return JSON.stringify({ name, audioPath, bpm, beatOffset, cues })
}

export function useSongBank(t: TransportApi, show: ShowApi): SongBankApi {
  const [library, setLibrary] = useState<SongMeta[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string | null>(null)
  const [audioMissing, setAudioMissing] = useState(false)
  const [savedSig, setSavedSig] = useState<string>(() => signature('', null, 120, 0, []))

  const sig = signature(name, audioPath, t.bpm, t.beatOffset, show.triggers)
  const dirty = sig !== savedSig

  const refresh = useCallback(async () => {
    setLibrary(await window.bank.list())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openAudio = useCallback(async () => {
    const r = await window.bank.openAudio()
    if (!r) return
    await t.loadData(r.data, r.name)
    setAudioPath(r.path)
    setAudioName(r.name)
    setAudioMissing(false)
    setName((n) => n || deriveName(r.name))
  }, [t])

  const loadDropped = useCallback(
    async (file: File) => {
      await t.loadData(await file.arrayBuffer(), file.name)
      const path = window.bank.pathForFile(file)
      setAudioPath(path || null)
      setAudioName(file.name)
      setAudioMissing(false)
      setName((n) => n || deriveName(file.name))
    },
    [t]
  )

  const buildShow = useCallback(
    (): SavedShow => ({
      version: 1,
      name: name || 'Untitled',
      audioPath,
      audioName,
      bpm: t.bpm,
      beatOffset: t.beatOffset,
      cues: show.triggers,
      savedAt: new Date().toISOString()
    }),
    [name, audioPath, audioName, t.bpm, t.beatOffset, show.triggers]
  )

  const persist = useCallback(
    async (id?: string) => {
      const showData = buildShow()
      const res = await window.bank.save(showData, id)
      setCurrentId(res.id)
      setSavedSig(signature(showData.name, showData.audioPath, showData.bpm, showData.beatOffset, showData.cues))
      if (!name) setName(showData.name)
      await refresh()
    },
    [buildShow, name, refresh]
  )

  const save = useCallback(async () => {
    await persist(currentId ?? undefined)
  }, [persist, currentId])

  const saveAsNew = useCallback(async () => {
    await persist(undefined)
  }, [persist])

  const loadShow = useCallback(
    async (id: string) => {
      const s = await window.bank.load(id)
      if (!s) return
      show.loadTriggers(s.cues)
      t.setBpm(s.bpm)
      t.setBeatOffset(s.beatOffset)
      setName(s.name)
      setAudioPath(s.audioPath)
      setAudioName(s.audioName)
      setCurrentId(id)
      if (s.audioPath) {
        const audio = await window.bank.readAudio(s.audioPath)
        if (audio) {
          await t.loadData(audio.data, audio.name)
          setAudioMissing(false)
        } else {
          t.unload()
          setAudioMissing(true)
        }
      } else {
        t.unload()
        setAudioMissing(false)
      }
      setSavedSig(signature(s.name, s.audioPath, s.bpm, s.beatOffset, s.cues))
    },
    [show, t]
  )

  const deleteShow = useCallback(
    async (id: string) => {
      await window.bank.remove(id)
      if (id === currentId) setCurrentId(null)
      await refresh()
    },
    [currentId, refresh]
  )

  const newShow = useCallback(() => {
    show.clear()
    t.setBpm(120)
    t.setBeatOffset(0)
    t.unload()
    setName('')
    setAudioPath(null)
    setAudioName(null)
    setAudioMissing(false)
    setCurrentId(null)
    setSavedSig(signature('', null, 120, 0, []))
  }, [show, t])

  // Debounced autosave — only once a show has been saved at least once (has an id).
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (!currentId || !dirty) return
    const h = window.setTimeout(() => void saveRef.current(), 1200)
    return () => window.clearTimeout(h)
  }, [sig, currentId, dirty])

  return {
    library,
    currentId,
    name,
    audioName,
    audioMissing,
    dirty,
    setName,
    refresh,
    openAudio,
    loadDropped,
    save,
    saveAsNew,
    loadShow,
    deleteShow,
    newShow
  }
}
