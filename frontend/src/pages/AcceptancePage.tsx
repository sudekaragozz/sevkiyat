import { FormEvent, useState } from 'react'
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material'
import { ReferenceSelect } from '../components/ReferenceSelect'
import { useReferenceData } from '../context/ReferenceDataContext'
import { apiError, nameOf } from '../api/utils'
import { fetchPackageHistory } from '../api/packages'
import { historyStatus, initialForm, seferStatus } from '../constants'
import type { CargoForm, Package, PackageHistory } from '../types'

export default function AcceptancePage() {
  const { couriers, branches, branchNames, seferById, referenceLoading, referenceError } = useReferenceData()
  const [form, setForm] = useState<CargoForm>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdPackage, setCreatedPackage] = useState<Package | null>(null)
  const [createdHistory, setCreatedHistory] = useState<PackageHistory[]>([])

  const disabled = referenceLoading || Boolean(referenceError)
  const update = (field: keyof CargoForm, value: string) => setForm((current) => ({ ...current, [field]: value }))
  const updateReference = (field: 'employee' | 'origin_branch' | 'destination_branch', value: string) => setForm((current) => ({ ...current, [field]: Number(value) }))

  const submitCargo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setSubmitError(null); setCreatedPackage(null); setCreatedHistory([])
    if (form.employee === '' || form.origin_branch === '' || form.destination_branch === '') { setSubmitError('Çalışan, çıkış şubesi ve varış şubesi seçilmelidir.'); setSubmitting(false); return }
    const payload = { employee: Number(form.employee), origin_branch: Number(form.origin_branch), destination_branch: Number(form.destination_branch), recipient_name: form.recipient_name, recipient_phone: form.recipient_phone, desi: form.desi, payment_type: form.payment_type }
    try {
      const response = await fetch('/api/packages/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => null) as Package & Record<string, unknown> | null
      if (!response.ok) throw new Error(apiError(data, `Sunucu yanıtı: ${response.status}`))
      const created = data as Package
      setCreatedPackage(created)
      setForm(initialForm)
      fetchPackageHistory(created.id).then(setCreatedHistory).catch(() => setCreatedHistory([]))
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Kargo kabul işlemi tamamlanamadı.')
    } finally {
      setSubmitting(false)
    }
  }

  return <Box sx={{ maxWidth: 820 }}>
    <Typography variant="h4" fontWeight={700}>Kargo Kabul</Typography>
    <Typography color="text.secondary" sx={{ mt: .5, mb: 3 }}>Yeni kargo kaydını oluşturun.</Typography>
    {submitError && <Alert severity="error" sx={{ mb: 3 }}>{submitError}</Alert>}
    <Box component="form" onSubmit={submitCargo} className="cargo-form">
      <ReferenceSelect id="employee" label="Çalışan" placeholder="Çalışan seçin" value={form.employee} options={couriers} disabled={disabled} onChange={(id) => updateReference('employee', String(id))} />
      <TextField label="Alıcı adı" value={form.recipient_name} onChange={(e) => update('recipient_name', e.target.value)} required fullWidth />
      <TextField label="Alıcı telefonu" value={form.recipient_phone} onChange={(e) => update('recipient_phone', e.target.value)} required fullWidth />
      <ReferenceSelect id="origin-branch" label="Çıkış şubesi" placeholder="Çıkış şubesi seçin" value={form.origin_branch} options={branches} disabled={disabled} onChange={(id) => updateReference('origin_branch', String(id))} />
      <ReferenceSelect id="destination-branch" label="Varış şubesi" placeholder="Varış şubesi seçin" value={form.destination_branch} options={branches} disabled={disabled} onChange={(id) => updateReference('destination_branch', String(id))} />
      <TextField label="Desi" type="number" value={form.desi} onChange={(e) => update('desi', e.target.value)} required fullWidth inputProps={{ min: .01, step: .01 }} />
      <TextField select label="Ödeme tipi" value={form.payment_type} onChange={(e) => update('payment_type', e.target.value)} required fullWidth>
        <MenuItem value="Alıcı Ödemeli">Alıcı Ödemeli</MenuItem>
        <MenuItem value="Nakit">Nakit</MenuItem>
        <MenuItem value="Kredi Kartı">Kredi Kartı</MenuItem>
      </TextField>
      <Box sx={{ gridColumn: '1 / -1', pt: 1 }}><Button type="submit" variant="contained" size="large" disabled={submitting || disabled}>{submitting ? 'Gönderiliyor…' : 'Kargoyu Kabul Et'}</Button></Box>
    </Box>
    {createdPackage && <Alert severity="success" sx={{ mt: 3 }}>
      <Typography fontWeight={700}>Kargo oluşturuldu: {createdPackage.tracking_number}</Typography>
      <Typography>Mevcut şube: {nameOf(branchNames, createdPackage.current_branch)} · Durum: {createdPackage.sefer == null ? '-' : seferStatus[seferById.get(createdPackage.sefer)?.status ?? ''] ?? 'Durum bilinmiyor'}</Typography>
      <Typography>Geçmiş: {[...createdHistory].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((item) => historyStatus[item.status] ?? item.status).join(' → ') || 'Yok'}</Typography>
    </Alert>}
  </Box>
}
