import { useState } from 'react'
import { Play, Pause, Database, TrendingUp } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'

export function DataSimulator() {
  const [isSimulating, setIsSimulating] = useState(false)
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null)
  const [simulationSettings, setSimulationSettings] = useState({
    tableName: 'sample_data',
    interval: 5000, // 5 seconds
    recordsPerBatch: 5,
  })
  const { addTable } = useDataStore()

  const createSampleTable = async () => {
    try {
      console.log('Creating sample table:', simulationSettings.tableName)
      
      // メモリストアを使用してテーブルを作成
      const { memoryDataStore } = await import('@/lib/memoryDataStore')
      
      // テーブルが既に存在する場合は削除
      try {
        memoryDataStore.dropTable(simulationSettings.tableName)
        console.log('Existing table dropped:', simulationSettings.tableName)
      } catch (e) {
        // テーブルが存在しない場合は無視
        console.log('Table did not exist, proceeding with creation')
      }

      // 初期データを生成（数値分析に適したデータ）
      const initialData = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
        temperature: Math.round((Math.random() * 40 + 10) * 100) / 100, // 10-50℃
        humidity: Math.round((Math.random() * 60 + 30) * 100) / 100, // 30-90%
        pressure: Math.round((Math.random() * 200 + 950) * 100) / 100, // 950-1150hPa
        sales: Math.round(Math.random() * 10000 + 1000), // 1000-11000円
        score: Math.round((Math.random() * 40 + 60) * 100) / 100, // 60-100点
        category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
        status: ['active', 'inactive'][Math.floor(Math.random() * 2)],
        description: `Sample text data ${i + 1} - ${['良好', '普通', '要改善'][Math.floor(Math.random() * 3)]}`
      }))

      console.log('Generated initial data:', initialData.length, 'records')

      // メモリストアにテーブルを作成（数値カラムをNUMBERとして定義）
      memoryDataStore.createTable(simulationSettings.tableName, [
        { name: 'id', type: 'NUMBER', nullable: false },
        { name: 'timestamp', type: 'TEXT', nullable: false },
        { name: 'temperature', type: 'NUMBER', nullable: false },
        { name: 'humidity', type: 'NUMBER', nullable: false },
        { name: 'pressure', type: 'NUMBER', nullable: false },
        { name: 'sales', type: 'NUMBER', nullable: false },
        { name: 'score', type: 'NUMBER', nullable: false },
        { name: 'category', type: 'TEXT', nullable: false },
        { name: 'status', type: 'TEXT', nullable: false },
        { name: 'description', type: 'TEXT', nullable: false },
      ])

      // 初期データを挿入
      for (const record of initialData) {
        memoryDataStore.insertRow(simulationSettings.tableName, {
          id: record.id.toString(),
          timestamp: record.timestamp,
          temperature: record.temperature.toString(),
          humidity: record.humidity.toString(),
          pressure: record.pressure.toString(),
          sales: record.sales.toString(),
          score: record.score.toString(),
          category: record.category,
          status: record.status,
          description: record.description
        })
      }

      console.log('Data inserted into memory store')

      // テーブルをストアに追加
      addTable({
        name: simulationSettings.tableName,
        connectionId: 'file',
        columns: [
          { name: 'id', type: 'NUMBER', nullable: false },
          { name: 'timestamp', type: 'TEXT', nullable: false },
          { name: 'temperature', type: 'NUMBER', nullable: false },
          { name: 'humidity', type: 'NUMBER', nullable: false },
          { name: 'pressure', type: 'NUMBER', nullable: false },
          { name: 'sales', type: 'NUMBER', nullable: false },
          { name: 'score', type: 'NUMBER', nullable: false },
          { name: 'category', type: 'TEXT', nullable: false },
          { name: 'status', type: 'TEXT', nullable: false },
          { name: 'description', type: 'TEXT', nullable: false },
        ],
        rowCount: initialData.length,
        isLoaded: true
      })

      console.log('Table added to store')
      
      // テーブル作成イベントを発生させる
      window.dispatchEvent(new CustomEvent('dataChanged', { 
        detail: { 
          tableName: simulationSettings.tableName, 
          changeType: 'inserted', 
          count: initialData.length 
        } 
      }))
      console.log('Dispatched dataChanged event for table creation:', simulationSettings.tableName)
      
      alert(`サンプルテーブル「${simulationSettings.tableName}」を作成しました（${initialData.length}件のデータ）`)
    } catch (error) {
      console.error('Failed to create sample table:', error)
      alert(`サンプルテーブルの作成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const startSimulation = () => {
    if (isSimulating) return

    const id = setInterval(async () => {
      try {
        // メモリストアを使用してデータを挿入
        const { memoryDataStore } = await import('@/lib/memoryDataStore')
        
        // テーブルが存在するかチェック
        const tables = memoryDataStore.listTables()
        if (!tables.includes(simulationSettings.tableName)) {
          console.warn(`Table ${simulationSettings.tableName} does not exist in memory store`)
          return
        }

        // 現在のデータを取得して最新のIDを算出
        const tableSchema = memoryDataStore.getTableSchema(simulationSettings.tableName)
        const currentData = tableSchema?.data || []
        const maxId = currentData.length > 0 
          ? Math.max(...currentData.map(row => parseInt(row.id || '0', 10))) 
          : 0

        // 新しいレコードを生成
        const newRecords = Array.from({ length: simulationSettings.recordsPerBatch }, (_, i) => {
          const recordId = maxId + i + 1
          return {
            id: recordId.toString(),
            timestamp: new Date().toISOString(),
            temperature: (Math.random() * 40 + 10).toFixed(2), // 10-50℃
            humidity: (Math.random() * 60 + 30).toFixed(2), // 30-90%
            pressure: (Math.random() * 200 + 950).toFixed(2), // 950-1150hPa
            sales: Math.round(Math.random() * 10000 + 1000).toString(), // 1000-11000円
            score: (Math.random() * 40 + 60).toFixed(2), // 60-100点
            category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
            status: ['active', 'inactive'][Math.floor(Math.random() * 2)],
            description: `Sample text data ${recordId} - ${['良好', '普通', '要改善'][Math.floor(Math.random() * 3)]}`
          }
        })

        // データを挿入
        for (const record of newRecords) {
          memoryDataStore.insertRow(simulationSettings.tableName, record)
        }

        console.log(`Inserted ${newRecords.length} records into ${simulationSettings.tableName}`)
        
        // データ変更イベントを発生させる
        window.dispatchEvent(new CustomEvent('dataChanged', { 
          detail: { 
            tableName: simulationSettings.tableName, 
            changeType: 'inserted', 
            count: newRecords.length 
          } 
        }))
        console.log('Dispatched dataChanged event for', simulationSettings.tableName)
      } catch (error) {
        console.error('Failed to insert simulated data:', error)
      }
    }, simulationSettings.interval)

    setIntervalId(id)
    setIsSimulating(true)
  }

  const stopSimulation = () => {
    if (intervalId) {
      clearInterval(intervalId)
      setIntervalId(null)
    }
    setIsSimulating(false)
  }

  const handleToggleSimulation = () => {
    if (isSimulating) {
      stopSimulation()
    } else {
      startSimulation()
    }
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <h3 className="font-medium text-gray-900">データシミュレーター</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={createSampleTable}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm hover:bg-blue-200"
          >
            <Database className="h-4 w-4 inline mr-1" />
            サンプル作成
          </button>
          <button
            onClick={handleToggleSimulation}
            className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
              isSimulating
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isSimulating ? (
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            テーブル名
          </label>
          <input
            type="text"
            value={simulationSettings.tableName}
            onChange={(e) => setSimulationSettings({
              ...simulationSettings,
              tableName: e.target.value
            })}
            disabled={isSimulating}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            間隔（秒）
          </label>
          <input
            type="number"
            min="1"
            max="60"
            value={simulationSettings.interval / 1000}
            onChange={(e) => setSimulationSettings({
              ...simulationSettings,
              interval: parseInt(e.target.value) * 1000
            })}
            disabled={isSimulating}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            バッチ件数
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={simulationSettings.recordsPerBatch}
            onChange={(e) => setSimulationSettings({
              ...simulationSettings,
              recordsPerBatch: parseInt(e.target.value)
            })}
            disabled={isSimulating}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
          />
        </div>
      </div>

      {isSimulating && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-700">
              データシミュレーション実行中 - {simulationSettings.interval / 1000}秒ごとに{simulationSettings.recordsPerBatch}件のデータを挿入
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-600">
        <p>このシミュレーターは、リアルタイム更新機能のテスト用にダミーデータを定期的に挿入します。</p>
        <p>まず「サンプル作成」でテーブルを作成し、「開始」でデータの挿入を開始してください。</p>
      </div>
    </div>
  )
}