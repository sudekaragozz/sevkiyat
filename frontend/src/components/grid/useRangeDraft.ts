import { useEffect, useRef, useState } from 'react'

// Aralık filtrelerinin (tarih, sayı) ortak modeli; değerler input'tan geldiği gibi string tutulur.
export type RangeFilterModel = { from?: string; to?: string }

const COMMIT_DELAY_MS = 500

// Yazılan değer önce taslakta tutulur; kullanıcı durunca (ya da alandan çıkınca) ve iki uç da
// isComplete'ten geçerse grid modeline yazılır. Böylece yarım değerler backend'e istek atmaz.
export function useRangeDraft(model: RangeFilterModel | null, onModelChange: (model: RangeFilterModel | null) => void, isComplete: (value: string) => boolean) {
  const [draft, setDraft] = useState<RangeFilterModel>(model ?? {})
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Model dışarıdan değişirse (Temizle, grid sıfırlama) taslak da güncellenir.
  useEffect(() => { setDraft(model ?? {}) }, [model])
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (next: RangeFilterModel) => {
    clearTimeout(timer.current)
    if (!isComplete(next.from ?? '') || !isComplete(next.to ?? '')) return
    if ((next.from ?? '') === (model?.from ?? '') && (next.to ?? '') === (model?.to ?? '')) return
    onModelChange(next.from || next.to ? next : null)
  }

  const update = (key: keyof RangeFilterModel, value: string) => {
    const next = { ...draft, [key]: value || undefined }
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(next), COMMIT_DELAY_MS)
  }

  const clear = () => { clearTimeout(timer.current); setDraft({}); onModelChange(null) }

  return { draft, update, commitDraft: () => commit(draft), clear, canClear: Boolean(model || draft.from || draft.to) }
}
