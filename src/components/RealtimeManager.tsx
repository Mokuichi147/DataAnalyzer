import { useState, useEffect } from 'react'
import { 
  Activity, 
  Bell, 
  BellOff, 
  Play, 
  Pause, 
  Settings, 
  Plus, 
  Trash2, 
  Clock,
  Database,
  CheckCircle
} from 'lucide-react'
import { useRealtimeStore } from '@/store/realtimeStore'
import { useDataStore } from '@/store/dataStore'
import { 
  changeNotificationManager, 
  requestNotificationPermission,
  type ChangeNotification 
} from '@/lib/realtime'
import { DataSimulator } from './DataSimulator'

export function RealtimeManager() {
  const [showSettings, setShowSettings] = useState(false)
  const [notifications, setNotifications] = useState<ChangeNotification[]>([])
  // const [monitor] = useState(() => setupRealtimeMonitoring()) // 将来的に使用予定
  
  const {
    settings,
    subscriptions,
    isMonitoring,
    updateSettings,
    addSubscription,
    removeSubscription,
    toggleSubscription,
  } = useRealtimeStore()
  
  const { tables } = useDataStore()

  useEffect(() => {
    const unsubscribe = changeNotificationManager.subscribe(setNotifications)
    return unsubscribe
  }, [])

  const handleToggleMonitoring = () => {
    updateSettings({ isEnabled: !settings.isEnabled })
  }

  const handleAddSubscription = (tableName: string) => {
    const table = tables.find(t => t.name === tableName)
    if (table) {
      addSubscription({
        tableName: table.name,
        connectionId: table.connectionId,
        rowCount: 0, // 初期値、実際の値は最初のチェック時に更新
      })
    }
  }

  const handleRequestNotificationPermission = async () => {
    const granted = await requestNotificationPermission()
    if (granted) {
      alert('ブラウザ通知が有効になりました')
    } else {
      alert('ブラウザ通知の許可が必要です')
    }
  }

  const unacknowledgedCount = notifications.filter(n => !n.acknowledged).length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">リアルタイム更新</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 hover:text-gray-800"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={handleRequestNotificationPermission}
            className="p-2 text-gray-600 hover:text-gray-800"
            title="ブラウザ通知を有効にする"
          >
            {typeof Notification !== 'undefined' && Notification.permission === 'granted' ? (
              <Bell className="h-5 w-5 text-green-600" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={handleToggleMonitoring}
            className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
              settings.isEnabled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {settings.isEnabled ? (
              <>
                <Pause className="h-4 w-4" />
                <span>停止</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>開始</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ステータス表示 */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-900">監視状態</h3>
          <div className="flex items-center space-x-2">
            <Activity className={`h-4 w-4 ${isMonitoring ? 'text-green-600' : 'text-gray-400'}`} />
            <span className={`text-sm ${isMonitoring ? 'text-green-600' : 'text-gray-600'}`}>
              {isMonitoring ? '監視中' : '停止中'}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-600">監視間隔</div>
            <div className="font-medium">{settings.interval}秒</div>
          </div>
          <div>
            <div className="text-gray-600">監視対象</div>
            <div className="font-medium">{subscriptions.filter(s => s.isActive).length}テーブル</div>
          </div>
          <div>
            <div className="text-gray-600">最終更新</div>
            <div className="font-medium">
              {settings.lastUpdate 
                ? settings.lastUpdate.toLocaleTimeString()
                : '未実行'
              }
            </div>
          </div>
          <div>
            <div className="text-gray-600">未読通知</div>
            <div className="font-medium text-red-600">{unacknowledgedCount}件</div>
          </div>
        </div>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <SettingsPanel 
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 監視対象テーブル */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium text-gray-900">監視対象テーブル</h3>
          <SubscriptionSelector onAdd={handleAddSubscription} />
        </div>
        
        {subscriptions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Database className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>監視対象のテーブルがありません</p>
            <p className="text-sm">テーブルを追加して監視を開始してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => toggleSubscription(subscription.id)}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      subscription.isActive 
                        ? 'bg-green-600 border-green-600' 
                        : 'border-gray-300'
                    }`}
                  >
                    {subscription.isActive && <CheckCircle className="h-3 w-3 text-white" />}
                  </button>
                  <div>
                    <div className="font-medium">{subscription.tableName}</div>
                    <div className="text-sm text-gray-600">
                      最終チェック: {subscription.lastChecked.toLocaleTimeString()}
                      {subscription.rowCount > 0 && ` | ${subscription.rowCount}行`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeSubscription(subscription.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* データシミュレーター */}
      <DataSimulator />

      {/* 通知履歴 */}
      <NotificationHistory 
        notifications={notifications}
        onAcknowledge={(id) => changeNotificationManager.acknowledgeNotification(id)}
        onClear={() => changeNotificationManager.clearNotifications()}
      />
    </div>
  )
}

interface SettingsPanelProps {
  settings: any
  onUpdateSettings: (settings: any) => void
  onClose: () => void
}

function SettingsPanel({ settings, onUpdateSettings, onClose }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings)

  const handleSave = () => {
    onUpdateSettings(localSettings)
    onClose()
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-900">リアルタイム設定</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            監視間隔（秒）
          </label>
          <input
            type="number"
            min="5"
            max="3600"
            value={localSettings.interval}
            onChange={(e) => setLocalSettings({
              ...localSettings,
              interval: parseInt(e.target.value)
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={localSettings.autoRefresh}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                autoRefresh: e.target.checked
              })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              データ変更時に自動リフレッシュ
            </span>
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={localSettings.dataChangeDetection}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                dataChangeDetection: e.target.checked
              })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              データ変更検出を有効にする
            </span>
          </label>
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

interface SubscriptionSelectorProps {
  onAdd: (tableName: string) => void
}

function SubscriptionSelector({ onAdd }: SubscriptionSelectorProps) {
  const [showSelector, setShowSelector] = useState(false)
  const { tables } = useDataStore()
  const { subscriptions } = useRealtimeStore()
  
  const availableTables = tables.filter(table => 
    !subscriptions.some(sub => sub.tableName === table.name)
  )

  if (!showSelector) {
    return (
      <button
        onClick={() => setShowSelector(true)}
        className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 flex items-center space-x-1"
      >
        <Plus className="h-4 w-4" />
        <span>追加</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <select
        onChange={(e) => {
          if (e.target.value) {
            onAdd(e.target.value)
            setShowSelector(false)
          }
        }}
        className="px-3 py-1 border border-gray-300 rounded-md"
        defaultValue=""
      >
        <option value="">テーブルを選択</option>
        {availableTables.map((table) => (
          <option key={table.id} value={table.name}>
            {table.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setShowSelector(false)}
        className="ml-2 text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  )
}

interface NotificationHistoryProps {
  notifications: ChangeNotification[]
  onAcknowledge: (id: string) => void
  onClear: () => void
}

function NotificationHistory({ notifications, onAcknowledge, onClear }: NotificationHistoryProps) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-900">変更通知履歴</h3>
        {notifications.length > 0 && (
          <button
            onClick={onClear}
            className="text-sm text-red-600 hover:text-red-800"
          >
            すべて削除
          </button>
        )}
      </div>
      
      {notifications.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p>変更通知はありません</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-3 rounded border ${
                notification.acknowledged 
                  ? 'bg-gray-50 border-gray-200' 
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{notification.tableName}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      notification.changeType === 'inserted' ? 'bg-green-100 text-green-800' :
                      notification.changeType === 'updated' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {notification.changeType === 'inserted' ? '挿入' :
                       notification.changeType === 'updated' ? '更新' : '削除'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {notification.count}件の変更 • {notification.timestamp.toLocaleString()}
                  </div>
                </div>
                {!notification.acknowledged && (
                  <button
                    onClick={() => onAcknowledge(notification.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    確認
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}