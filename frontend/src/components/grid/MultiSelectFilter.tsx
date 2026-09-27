import { useEffect, useRef, useState } from 'react'
import { Autocomplete, Box, Button, Checkbox, CircularProgress, TextField } from '@mui/material'
import type { CustomFilterProps } from '@ag-grid-community/react'
import { useGridFilter } from '@ag-grid-community/react'
import { fetchPackageFilterOptions } from '../../api/packages'
import type { PackageFilterOptionField } from '../../types'

// Filtreler sadece seçimi tutar; asıl süzme backend'de yapılır (PackagesPage onFilterChanged).
const passAll = () => true

// Autocomplete listesi body'ye portal edilir; bu sınıf olmadan AG Grid dışarı tıklandı sanıp
// filtre menüsünü kapatır.
const popperProps = { popper: { className: 'ag-custom-component-popup' } }

export type ValuesFilterModel<T> = { values: T[] }
export type FilterOption<T> = { value: T; label: string }

function ClearButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
    <Button size="small" disabled={disabled} onClick={onClick}>Temizle</Button>
  </Box>
}

// Seçenek listesi küçük olan kolonlar. Seçenekler ya hazır verilir (options) ya da filtre menüsü
// her açıldığında backend'den yüklenir (loadOptions) — böylece yeni eklenen değerler de listelenir.
export function MultiSelectFilter<T extends string | number>({ model, onModelChange, options: staticOptions, loadOptions }: CustomFilterProps<unknown, unknown, ValuesFilterModel<T>> & { options?: FilterOption<T>[]; loadOptions?: () => Promise<FilterOption<T>[]> }) {
  const [loadedOptions, setLoadedOptions] = useState<FilterOption<T>[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [openCount, setOpenCount] = useState(0)
  // Seçili değerlerin etiketleri, seçenekler yeniden yüklenirken de görünsün diye saklanır.
  const labels = useRef(new Map<T, string>())

  useGridFilter({ doesFilterPass: passAll, afterGuiAttached: () => setOpenCount((count) => count + 1) })

  useEffect(() => {
    if (!loadOptions || openCount === 0) return
    let cancelled = false
    setLoading(true); setLoadError(false)
    loadOptions()
      .then((items) => { if (!cancelled) setLoadedOptions(items) })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [loadOptions, openCount])

  const options = loadOptions ? loadedOptions : staticOptions ?? []
  options.forEach((option) => labels.current.set(option.value, option.label))
  const selected = (model?.values ?? []).map((value) => ({ value, label: labels.current.get(value) ?? String(value) }))

  return <Box sx={{ p: 1.5, width: 300 }}>
    <Autocomplete
      multiple
      disableCloseOnSelect
      size="small"
      options={options}
      value={selected}
      loading={loading}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, value) => option.value === value.value}
      onChange={(_event, value) => onModelChange(value.length ? { values: value.map((option) => option.value) } : null)}
      noOptionsText={loadError ? 'Seçenekler alınamadı' : 'Sonuç yok'}
      loadingText="Yükleniyor…"
      renderOption={({ key, ...props }, option, { selected: checked }) => <li key={key} {...props}><Checkbox size="small" checked={checked} sx={{ mr: 1, p: 0.25 }} />{option.label}</li>}
      renderInput={(params) => <TextField {...params} placeholder="Seçin" autoFocus slotProps={{ input: { ...params.InputProps, endAdornment: <>{loading && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> } }} />}
      slotProps={popperProps}
    />
    <ClearButton disabled={!model} onClick={() => onModelChange(null)} />
  </Box>
}

// Farklı değeri çok olan serbest metin kolonları: seçenekler yazdıkça backend'den aranır.
export function AsyncMultiSelectFilter({ model, onModelChange, field }: CustomFilterProps<unknown, unknown, ValuesFilterModel<string>> & { field: PackageFilterOptionField }) {
  useGridFilter({ doesFilterPass: passAll })
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const selected = model?.values ?? []

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetchPackageFilterOptions(field, search, controller.signal)
        .then(setOptions)
        .catch(() => { if (!controller.signal.aborted) setOptions([]) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [field, search])

  return <Box sx={{ p: 1.5, width: 300 }}>
    <Autocomplete
      multiple
      disableCloseOnSelect
      size="small"
      options={options}
      value={selected}
      loading={loading}
      filterOptions={(items) => items}
      inputValue={search}
      onInputChange={(_event, value, reason) => { if (reason !== 'reset') setSearch(value) }}
      onChange={(_event, value) => onModelChange(value.length ? { values: value } : null)}
      noOptionsText="Sonuç yok"
      loadingText="Yükleniyor…"
      renderOption={({ key, ...props }, option, { selected: checked }) => <li key={key} {...props}><Checkbox size="small" checked={checked} sx={{ mr: 1, p: 0.25 }} />{option}</li>}
      renderInput={(params) => <TextField {...params} placeholder="Ara ve seçin" autoFocus slotProps={{ input: { ...params.InputProps, endAdornment: <>{loading && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> } }} />}
      slotProps={popperProps}
    />
    <ClearButton disabled={!model} onClick={() => onModelChange(null)} />
  </Box>
}
