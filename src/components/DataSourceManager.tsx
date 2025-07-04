import React, { useState } from 'react'
import { Plus, Database, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { DataConnection } from '@/store/dataStore'

export function DataSourceManager() {
  const { connections, addConnection, removeConnection, updateConnection, setConnectionStatus } = useDataStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState<DataConnection | null>(null)

  const handleAddConnection = (connectionData: Omit<DataConnection, 'id' | 'isConnected'>) => {
    addConnection(connectionData)
    setShowAddForm(false)
  }

  const handleEditConnection = (connection: DataConnection) => {
    setEditingConnection(connection)
  }

  const handleUpdateConnection = (id: string, updates: Partial<DataConnection>) => {
    updateConnection(id, updates)
    setEditingConnection(null)
  }

  const handleDeleteConnection = (id: string) => {
    if (confirm('この接続を削除しますか？')) {
      removeConnection(id)
    }
  }

  const testConnection = async (connection: DataConnection) => {
    try {
      setConnectionStatus(connection.id, false)
      // TODO: 実際の接続テストを実装
      await new Promise(resolve => setTimeout(resolve, 1000))
      setConnectionStatus(connection.id, true)
    } catch (error) {
      setConnectionStatus(connection.id, false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">データソース管理</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新しい接続
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Database className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p>まだ接続が設定されていません</p>
          <p className="text-sm">「新しい接続」ボタンから接続を追加してください</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {connections.map((connection) => (
            <div key={connection.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-gray-900">{connection.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      connection.isConnected 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {connection.type}
                    </span>
                    {connection.isConnected ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {connection.type !== 'file' && (
                      <p>{connection.config.host}:{connection.config.port}/{connection.config.database}</p>
                    )}
                    {connection.lastConnected && (
                      <p>最終接続: {connection.lastConnected.toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => testConnection(connection)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    接続テスト
                  </button>
                  <button
                    onClick={() => handleEditConnection(connection)}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteConnection(connection.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showAddForm || editingConnection) && (
        <ConnectionForm
          connection={editingConnection}
          onSave={editingConnection 
            ? (data) => handleUpdateConnection(editingConnection.id, data)
            : handleAddConnection
          }
          onCancel={() => {
            setShowAddForm(false)
            setEditingConnection(null)
          }}
        />
      )}
    </div>
  )
}

interface ConnectionFormProps {
  connection?: DataConnection | null
  onSave: (data: any) => void
  onCancel: () => void
}

function ConnectionForm({ connection, onSave, onCancel }: ConnectionFormProps) {
  const [formData, setFormData] = useState({
    name: connection?.name || '',
    type: connection?.type || 'postgresql',
    host: connection?.config.host || '',
    port: connection?.config.port || 5432,
    database: connection?.config.database || '',
    username: connection?.config.username || '',
    password: connection?.config.password || '',
    ssl: connection?.config.ssl || false,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name: formData.name,
      type: formData.type,
      config: {
        host: formData.host,
        port: formData.port,
        database: formData.database,
        username: formData.username,
        password: formData.password,
        ssl: formData.ssl,
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium mb-4">
          {connection ? '接続を編集' : '新しい接続を追加'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              接続名
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              データベースタイプ
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>

          {formData.type !== 'sqlite' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ホスト
                </label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ポート
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  データベース名
                </label>
                <input
                  type="text"
                  value={formData.database}
                  onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ユーザー名
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  パスワード
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ssl"
                  checked={formData.ssl}
                  onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="ssl" className="ml-2 block text-sm text-gray-700">
                  SSL接続を使用
                </label>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {connection ? '更新' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}