import { create } from 'zustand'

// iOS Safari対応のUUID生成関数
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // iOS Safari用のフォールバック
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export interface RealtimeSettings {
  isEnabled: boolean
  interval: number // seconds
  lastUpdate: Date | null
  autoRefresh: boolean
  dataChangeDetection: boolean
}

export interface RealtimeSubscription {
  id: string
  tableName: string
  connectionId: string
  isActive: boolean
  lastChecked: Date
  rowCount: number
  checksum?: string
}

export interface RealtimeStoreState {
  settings: RealtimeSettings
  subscriptions: RealtimeSubscription[]
  isMonitoring: boolean
  
  // Actions
  updateSettings: (settings: Partial<RealtimeSettings>) => void
  addSubscription: (subscription: Omit<RealtimeSubscription, 'id' | 'isActive' | 'lastChecked'>) => void
  removeSubscription: (id: string) => void
  toggleSubscription: (id: string) => void
  updateSubscription: (id: string, updates: Partial<RealtimeSubscription>) => void
  setMonitoring: (isMonitoring: boolean) => void
  markLastUpdate: () => void
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  settings: {
    isEnabled: false,
    interval: 30, // 30 seconds default
    lastUpdate: null,
    autoRefresh: true,
    dataChangeDetection: true,
  },
  subscriptions: [],
  isMonitoring: false,
  
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    }))
  },
  
  addSubscription: (subscription) => {
    const newSubscription: RealtimeSubscription = {
      ...subscription,
      id: generateUUID(),
      isActive: true,
      lastChecked: new Date(),
    }
    set((state) => ({
      subscriptions: [...state.subscriptions, newSubscription]
    }))
  },
  
  removeSubscription: (id) => {
    set((state) => ({
      subscriptions: state.subscriptions.filter(sub => sub.id !== id)
    }))
  },
  
  toggleSubscription: (id) => {
    set((state) => ({
      subscriptions: state.subscriptions.map(sub =>
        sub.id === id ? { ...sub, isActive: !sub.isActive } : sub
      )
    }))
  },
  
  updateSubscription: (id, updates) => {
    set((state) => ({
      subscriptions: state.subscriptions.map(sub =>
        sub.id === id ? { ...sub, ...updates } : sub
      )
    }))
  },
  
  setMonitoring: (isMonitoring) => {
    set({ isMonitoring })
  },
  
  markLastUpdate: () => {
    set((state) => ({
      settings: { ...state.settings, lastUpdate: new Date() }
    }))
  },
}))