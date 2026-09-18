import type { SelectChangeEvent } from '@mui/material'
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import type { Reference } from '../types'

export function ReferenceSelect({ id, label, placeholder, value, options, disabled, onChange }: { id: string; label: string; placeholder: string; value: number | ''; options: Reference[]; disabled: boolean; onChange: (id: number) => void }) {
  const labelId = `${id}-label`
  return <FormControl fullWidth required disabled={disabled}>
    <InputLabel id={labelId}>{label}</InputLabel>
    <Select labelId={labelId} id={id} label={label} value={value === '' ? '' : String(value)} onChange={(e: SelectChangeEvent<string>) => onChange(Number(e.target.value))}>
      <MenuItem value="" disabled>{placeholder}</MenuItem>
      {options.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
    </Select>
  </FormControl>
}
