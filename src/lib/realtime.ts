import { executeQuery, getTableCount } from './duckdb'
import { useRealtimeStore } from '@/store/realtimeStore'
import { useDataStore } from '@/store/dataStore'

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

export class RealtimeMonitor {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false
  
  constructor(
    private onDataChange: (tableName: string, changeType: 'inserted' | 'updated' | 'deleted', count: number) => void
  ) {}

  start() {
    if (this.isRunning) return
    
    const { settings, subscriptions } = useRealtimeStore.getState()
    if (!settings.isEnabled || subscriptions.length === 0) return
    
    this.isRunning = true
    useRealtimeStore.getState().setMonitoring(true)
    
    this.intervalId = setInterval(async () => {
      await this.checkForChanges()
    }, settings.interval * 1000)
    
    console.log(`Realtime monitoring started with ${settings.interval}s interval`)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    useRealtimeStore.getState().setMonitoring(false)
    console.log('Realtime monitoring stopped')
  }

  private async checkForChanges() {
    const { subscriptions, settings } = useRealtimeStore.getState()
    const activeSubscriptions = subscriptions.filter(sub => sub.isActive)
    
    for (const subscription of activeSubscriptions) {
      try {
        await this.checkSubscription(subscription)
      } catch (error) {
        console.error(`Error checking subscription ${subscription.id}:`, error)
      }
    }
    
    useRealtimeStore.getState().markLastUpdate()
  }

  private async checkSubscription(subscription: any) {
    try {
      // ファイルベースのテーブルの場合は行数をチェック
      if (subscription.connectionId === 'file') {
        const currentCount = await getTableCount(subscription.tableName)
        
        if (currentCount !== subscription.rowCount) {
          const changeType = currentCount > subscription.rowCount ? 'inserted' : 'deleted'
          const changeCount = Math.abs(currentCount - subscription.rowCount)
          
          // 購読情報を更新
          useRealtimeStore.getState().updateSubscription(subscription.id, {
            rowCount: currentCount,
            lastChecked: new Date(),
          })
          
          // 変更を通知
          this.onDataChange(subscription.tableName, changeType, changeCount)
        } else {
          // 変更がない場合もlastCheckedを更新
          useRealtimeStore.getState().updateSubscription(subscription.id, {
            lastChecked: new Date(),
          })
        }
      }
      
      // データベース接続の場合の処理（今後の拡張）
      // PostgreSQL、MySQLの場合はWALログやトリガーを使用
      
    } catch (error) {
      console.error(`Failed to check changes for table ${subscription.tableName}:`, error)
    }
  }

  isActive(): boolean {
    return this.isRunning
  }
}

export interface ChangeNotification {
  id: string
  tableName: string
  changeType: 'inserted' | 'updated' | 'deleted'
  count: number
  timestamp: Date
  acknowledged: boolean
}

export class ChangeNotificationManager {
  private notifications: ChangeNotification[] = []
  private listeners: ((notifications: ChangeNotification[]) => void)[] = []
  
  addNotification(tableName: string, changeType: 'inserted' | 'updated' | 'deleted', count: number) {
    const notification: ChangeNotification = {
      id: generateUUID(),
      tableName,
      changeType,
      count,
      timestamp: new Date(),
      acknowledged: false,
    }
    
    this.notifications.unshift(notification)
    
    // 最大50件まで保持
    if (this.notifications.length > 50) {
      this.notifications = this.notifications.slice(0, 50)
    }
    
    this.notifyListeners()
    
    // ブラウザ通知（ユーザーが許可している場合）
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`データ変更検出: ${tableName}`, {
        body: `${count}件の${this.getChangeTypeText(changeType)}が検出されました`,
        icon: '/favicon.ico',
      })
    }
  }
  
  acknowledgeNotification(id: string) {
    const notification = this.notifications.find(n => n.id === id)
    if (notification) {
      notification.acknowledged = true
      this.notifyListeners()
    }
  }
  
  clearNotifications() {
    this.notifications = []
    this.notifyListeners()
  }
  
  getNotifications(): ChangeNotification[] {
    return [...this.notifications]
  }
  
  getUnacknowledgedCount(): number {
    return this.notifications.filter(n => !n.acknowledged).length
  }
  
  subscribe(listener: (notifications: ChangeNotification[]) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }
  
  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.notifications]))
  }
  
  private getChangeTypeText(changeType: string): string {
    switch (changeType) {
      case 'inserted': return '挿入'
      case 'updated': return '更新'
      case 'deleted': return '削除'
      default: return '変更'
    }
  }
}

// シングルトンインスタンス
export const changeNotificationManager = new ChangeNotificationManager()

// リアルタイム監視のセットアップ
export function setupRealtimeMonitoring() {
  const monitor = new RealtimeMonitor((tableName, changeType, count) => {
    changeNotificationManager.addNotification(tableName, changeType, count)
    
    // データストアの現在のテーブルが変更された場合、自動リフレッシュ
    const { currentTable } = useDataStore.getState()
    const { settings } = useRealtimeStore.getState()
    
    if (settings.autoRefresh && currentTable?.name === tableName) {
      // データプレビューの自動更新をトリガー
      window.dispatchEvent(new CustomEvent('dataChanged', { 
        detail: { tableName, changeType, count } 
      }))
    }
  })
  
  // 設定変更を監視
  useRealtimeStore.subscribe((state) => {
    if (state.settings.isEnabled && state.subscriptions.some(s => s.isActive)) {
      if (!monitor.isActive()) {
        monitor.start()
      }
    } else {
      if (monitor.isActive()) {
        monitor.stop()
      }
    }
  })
  
  return monitor
}

// ブラウザ通知の許可を要求
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined' || !('Notification' in window)) {
    console.warn('This browser does not support notifications')
    return false
  }
  
  if (Notification.permission === 'granted') {
    return true
  }
  
  if (Notification.permission === 'denied') {
    return false
  }
  
  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch (error) {
    console.warn('Failed to request notification permission:', error)
    return false
  }
}