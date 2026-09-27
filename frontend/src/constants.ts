import type { CargoForm } from './types'

export const initialForm: CargoForm = { employee: '', origin_branch: '', destination_branch: '', recipient_name: '', recipient_phone: '', desi: '', payment_type: 'Alıcı Ödemeli' }

export const drawerWidth = 250

// Matches PackageHistory.Status choices in shipments/models.py.
export const historyStatus: Record<string, string> = {
  AT_BRANCH: 'Şubeye Ulaştı',
  LEAVE_BRANCH: 'Şubeden Ayrıldı',
  IN_TRANSIT: 'Yolda',
  LEFT_TRANSIT: 'Sefer Bitti',
  OUT_FOR_DELIVERY: 'Dağıtıma Çıktı',
  DELIVERED: 'Teslim Edildi',
  DELIVERY_FAILED: 'Teslim Edilemedi',
}

export const seferStatus: Record<string, string> = { PLANNED: 'Planlandı', LOADING: 'Yükleniyor', IN_TRANSIT: 'Yolda', ARRIVED: 'Vardı', COMPLETED: 'Tamamlandı' }

// Matches Distribution.Status and DistributionPackage.Result in shipments/models.py.
export const distributionStatus: Record<string, string> = { READY_TO_GO: 'Dağıtıma Hazır', OUT_FOR_DELIVERY: 'Dağıtımda', COMPLETED: 'Tamamlandı' }

export const distributionResult: Record<string, string> = { PENDING: 'Bekliyor', DELIVERED: 'Teslim Edildi', FAILED: 'Teslim Edilemedi' }
