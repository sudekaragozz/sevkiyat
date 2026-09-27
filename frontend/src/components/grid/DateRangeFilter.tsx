import { Box, Button, TextField } from '@mui/material'
import type { CustomFilterProps } from '@ag-grid-community/react'
import { useGridFilter } from '@ag-grid-community/react'
import { useRangeDraft } from './useRangeDraft'
import type { RangeFilterModel } from './useRangeDraft'

// Tarihler YYYY-MM-DD; iki uç da dahil. Süzme backend'de yapılır.
export type DateRangeFilterModel = RangeFilterModel

const passAll = () => true

const MIN_DATE = '1900-01-01'
const MAX_DATE = '9999-12-31'

// Backend yalnızca ISO 8601 YYYY-MM-DD kabul eder. Native date input ise yıl yazılırken
// "0002-..", "0020-.." gibi yarım değerler, 4 haneden uzun yıllarda da "20266-.." üretir;
// bunlar ve takvimde olmayan günler gönderilmez.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidIsoDate(value: string) {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const isComplete = (value: string) => value === '' || isValidIsoDate(value)

export function DateRangeFilter({ model, onModelChange }: CustomFilterProps<unknown, unknown, DateRangeFilterModel>) {
  useGridFilter({ doesFilterPass: passAll })
  const { draft, update, commitDraft, clear, canClear } = useRangeDraft(model, onModelChange, isComplete)

  return <Box sx={{ p: 1.5, width: 260, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <TextField type="date" size="small" label="Başlangıç" value={draft.from ?? ''} onChange={(e) => update('from', e.target.value)} onBlur={commitDraft} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: MIN_DATE, max: draft.to && isValidIsoDate(draft.to) ? draft.to : MAX_DATE } }} />
    <TextField type="date" size="small" label="Bitiş" value={draft.to ?? ''} onChange={(e) => update('to', e.target.value)} onBlur={commitDraft} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.from && isValidIsoDate(draft.from) ? draft.from : MIN_DATE, max: MAX_DATE } }} />
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button size="small" disabled={!canClear} onClick={clear}>Temizle</Button>
    </Box>
  </Box>
}
