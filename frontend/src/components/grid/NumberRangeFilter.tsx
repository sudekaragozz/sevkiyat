import { Box, Button, TextField } from '@mui/material'
import type { CustomFilterProps } from '@ag-grid-community/react'
import { useGridFilter } from '@ag-grid-community/react'
import { useRangeDraft } from './useRangeDraft'
import type { RangeFilterModel } from './useRangeDraft'

// En az / en çok (iki uç dahil), negatif olmayan tam sayılar. Süzme backend'de yapılır.
export type NumberRangeFilterModel = RangeFilterModel

const passAll = () => true

const isComplete = (value: string) => value === '' || /^\d+$/.test(value)

export function NumberRangeFilter({ model, onModelChange }: CustomFilterProps<unknown, unknown, NumberRangeFilterModel>) {
  useGridFilter({ doesFilterPass: passAll })
  const { draft, update, commitDraft, clear, canClear } = useRangeDraft(model, onModelChange, isComplete)

  return <Box sx={{ p: 1.5, width: 220, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <TextField type="number" size="small" label="En az" value={draft.from ?? ''} onChange={(e) => update('from', e.target.value)} onBlur={commitDraft} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: 1 } }} autoFocus />
    <TextField type="number" size="small" label="En çok" value={draft.to ?? ''} onChange={(e) => update('to', e.target.value)} onBlur={commitDraft} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: 1 } }} />
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button size="small" disabled={!canClear} onClick={clear}>Temizle</Button>
    </Box>
  </Box>
}
