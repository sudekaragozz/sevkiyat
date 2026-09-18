import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Employee, Reference, Sefer, Vehicle } from '../types'
import { normalize } from '../api/utils'

type ReferenceDataValue = {
  employees: Employee[]
  drivers: Employee[]
  couriers: Employee[]
  branches: Reference[]
  vehicles: Vehicle[]
  sefers: Sefer[]
  employeeNames: Map<number, string>
  branchNames: Map<number, string>
  seferById: Map<number, Sefer>
  referenceLoading: boolean
  referenceError: string | null
  sefersLoading: boolean
  seferError: string | null
  reloadReferences: () => Promise<void>
  reloadSefers: () => Promise<void>
}

const ReferenceDataContext = createContext<ReferenceDataValue | null>(null)

export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [branches, setBranches] = useState<Reference[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [sefers, setSefers] = useState<Sefer[]>([])
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [sefersLoading, setSefersLoading] = useState(true)
  const [seferError, setSeferError] = useState<string | null>(null)

  const reloadReferences = useCallback(async () => {
    setReferenceLoading(true); setReferenceError(null)
    try {
      const [employeeResponse, branchResponse] = await Promise.all([fetch('/api/employees/'), fetch('/api/branches/')])
      if (!employeeResponse.ok || !branchResponse.ok) throw new Error('Çalışan veya şube listesi alınamadı.')
      const [employeeData, branchData] = await Promise.all([employeeResponse.json(), branchResponse.json()])
      setEmployees(normalize(employeeData)); setBranches(normalize(branchData))
    } catch (error) { setReferenceError(error instanceof Error ? error.message : 'Seçim listeleri yüklenemedi.') } finally { setReferenceLoading(false) }
  }, [])

  const reloadSefers = useCallback(async () => {
    setSefersLoading(true); setSeferError(null)
    try {
      const [seferResponse, vehicleResponse] = await Promise.all([fetch('/api/sefer/'), fetch('/api/vehicles/')])
      if (!seferResponse.ok || !vehicleResponse.ok) throw new Error('Sefer veya araç listesi alınamadı.')
      const [seferData, vehicleData] = await Promise.all([seferResponse.json(), vehicleResponse.json()])
      setSefers(normalize(seferData)); setVehicles(normalize(vehicleData))
    } catch (error) { setSeferError(error instanceof Error ? error.message : 'Sefer listeleri yüklenemedi.') } finally { setSefersLoading(false) }
  }, [])

  useEffect(() => { void reloadReferences() }, [reloadReferences])
  useEffect(() => { void reloadSefers() }, [reloadSefers])

  const employeeNames = useMemo(() => new Map(employees.map((item) => [item.id, item.name])), [employees])
  const branchNames = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches])
  const seferById = useMemo(() => new Map(sefers.map((item) => [item.id, item])), [sefers])
  const drivers = useMemo(() => employees.filter((item) => item.role === 'SOFOR'), [employees])
  const couriers = useMemo(() => employees.filter((item) => item.role === 'KURYE'), [employees])

  const value = useMemo<ReferenceDataValue>(() => ({
    employees, drivers, couriers, branches, vehicles, sefers,
    employeeNames, branchNames, seferById,
    referenceLoading, referenceError,
    sefersLoading, seferError,
    reloadReferences, reloadSefers,
  }), [employees, drivers, couriers, branches, vehicles, sefers, employeeNames, branchNames, seferById, referenceLoading, referenceError, sefersLoading, seferError, reloadReferences, reloadSefers])

  return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>
}

export function useReferenceData() {
  const context = useContext(ReferenceDataContext)
  if (!context) throw new Error('useReferenceData must be used within a ReferenceDataProvider')
  return context
}
