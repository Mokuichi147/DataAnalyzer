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
    missingDataRate: 10, // 欠損データの確率（%）
    includeNulls: true,
    includeEmptyStrings: true,
    includeZeros: true,
    includeUndefined: true,
  })
  const { addTable } = useDataStore()

  // 欠損値を生成するヘルパー関数
  const generateMissingValue = (originalValue: any, fieldType: 'number' | 'text') => {
    if (Math.random() * 100 >= simulationSettings.missingDataRate) {
      return originalValue // 欠損しない
    }

    const missingTypes = []
    if (simulationSettings.includeNulls) missingTypes.push('null')
    if (simulationSettings.includeEmptyStrings && fieldType === 'text') missingTypes.push('empty')
    if (simulationSettings.includeZeros && fieldType === 'number') missingTypes.push('zero')
    if (simulationSettings.includeUndefined) missingTypes.push('undefined')

    if (missingTypes.length === 0) return originalValue

    const randomType = missingTypes[Math.floor(Math.random() * missingTypes.length)]
    
    switch (randomType) {
      case 'null':
        return null
      case 'empty':
        return ''
      case 'zero':
        return fieldType === 'number' ? 0 : '0'
      case 'undefined':
        return undefined
      default:
        return originalValue
    }
  }

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
      const initialData = Array.from({ length: 20 }, (_, i) => {
        const baseData = {
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
        }

        // 欠損値を適用（idとtimestampは除く）
        return {
          ...baseData,
          temperature: generateMissingValue(baseData.temperature, 'number'),
          humidity: generateMissingValue(baseData.humidity, 'number'),
          pressure: generateMissingValue(baseData.pressure, 'number'),
          sales: generateMissingValue(baseData.sales, 'number'),
          score: generateMissingValue(baseData.score, 'number'),
          category: generateMissingValue(baseData.category, 'text'),
          status: generateMissingValue(baseData.status, 'text'),
          description: generateMissingValue(baseData.description, 'text')
        }
      })

      console.log('Generated initial data:', initialData.length, 'records')

      // メモリストアにテーブルを作成（数値カラムをNUMBERとして定義）
      memoryDataStore.createTable(simulationSettings.tableName, [
        { name: 'id', type: 'NUMBER', nullable: false },
        { name: 'timestamp', type: 'TEXT', nullable: false },
        { name: 'temperature', type: 'NUMBER', nullable: true },
        { name: 'humidity', type: 'NUMBER', nullable: true },
        { name: 'pressure', type: 'NUMBER', nullable: true },
        { name: 'sales', type: 'NUMBER', nullable: true },
        { name: 'score', type: 'NUMBER', nullable: true },
        { name: 'category', type: 'TEXT', nullable: true },
        { name: 'status', type: 'TEXT', nullable: true },
        { name: 'description', type: 'TEXT', nullable: true },
      ])

      // 初期データを挿入
      for (const record of initialData) {
        memoryDataStore.insertRow(simulationSettings.tableName, {
          id: record.id.toString(),
          timestamp: record.timestamp,
          temperature: record.temperature === null || record.temperature === undefined ? null : record.temperature.toString(),
          humidity: record.humidity === null || record.humidity === undefined ? null : record.humidity.toString(),
          pressure: record.pressure === null || record.pressure === undefined ? null : record.pressure.toString(),
          sales: record.sales === null || record.sales === undefined ? null : record.sales.toString(),
          score: record.score === null || record.score === undefined ? null : record.score.toString(),
          category: record.category === undefined ? null : record.category,
          status: record.status === undefined ? null : record.status,
          description: record.description === undefined ? null : record.description
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
          { name: 'temperature', type: 'NUMBER', nullable: true },
          { name: 'humidity', type: 'NUMBER', nullable: true },
          { name: 'pressure', type: 'NUMBER', nullable: true },
          { name: 'sales', type: 'NUMBER', nullable: true },
          { name: 'score', type: 'NUMBER', nullable: true },
          { name: 'category', type: 'TEXT', nullable: true },
          { name: 'status', type: 'TEXT', nullable: true },
          { name: 'description', type: 'TEXT', nullable: true },
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
          const baseRecord = {
            id: recordId.toString(),
            timestamp: new Date().toISOString(),
            temperature: parseFloat((Math.random() * 40 + 10).toFixed(2)), // 10-50℃
            humidity: parseFloat((Math.random() * 60 + 30).toFixed(2)), // 30-90%
            pressure: parseFloat((Math.random() * 200 + 950).toFixed(2)), // 950-1150hPa
            sales: Math.round(Math.random() * 10000 + 1000), // 1000-11000円
            score: parseFloat((Math.random() * 40 + 60).toFixed(2)), // 60-100点
            category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
            status: ['active', 'inactive'][Math.floor(Math.random() * 2)],
            description: `Sample text data ${recordId} - ${['良好', '普通', '要改善'][Math.floor(Math.random() * 3)]}`
          }

          // 欠損値を適用して最終データを作成
          const finalRecord = {
            id: baseRecord.id,
            timestamp: baseRecord.timestamp,
            temperature: generateMissingValue(baseRecord.temperature, 'number'),
            humidity: generateMissingValue(baseRecord.humidity, 'number'),
            pressure: generateMissingValue(baseRecord.pressure, 'number'),
            sales: generateMissingValue(baseRecord.sales, 'number'),
            score: generateMissingValue(baseRecord.score, 'number'),
            category: generateMissingValue(baseRecord.category, 'text'),
            status: generateMissingValue(baseRecord.status, 'text'),
            description: generateMissingValue(baseRecord.description, 'text')
          }

          // null/undefinedを適切な文字列に変換
          return {
            id: finalRecord.id,
            timestamp: finalRecord.timestamp,
            temperature: finalRecord.temperature === null || finalRecord.temperature === undefined ? null : finalRecord.temperature.toString(),
            humidity: finalRecord.humidity === null || finalRecord.humidity === undefined ? null : finalRecord.humidity.toString(),
            pressure: finalRecord.pressure === null || finalRecord.pressure === undefined ? null : finalRecord.pressure.toString(),
            sales: finalRecord.sales === null || finalRecord.sales === undefined ? null : finalRecord.sales.toString(),
            score: finalRecord.score === null || finalRecord.score === undefined ? null : finalRecord.score.toString(),
            category: finalRecord.category === undefined ? null : finalRecord.category,
            status: finalRecord.status === undefined ? null : finalRecord.status,
            description: finalRecord.description === undefined ? null : finalRecord.description
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
    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-medium text-gray-900 dark:text-white">データシミュレーター</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={createSampleTable}
            className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
          >
            <Database className="h-4 w-4 inline mr-1" />
            サンプル作成
          </button>
          <button
            onClick={handleToggleSimulation}
            className={`px-4 py-2 rounded-md flex items-center space-x-2 transition-colors ${
              isSimulating
                ? 'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600'
                : 'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-600'
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600 transition-colors"
          />
        </div>
      </div>

      {/* 欠損データ設定 */}
      <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-600 rounded-lg transition-colors">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">欠損データ生成設定</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
              欠損率 (%)
            </label>
            <input
              type="number"
              min="0"
              max="50"
              value={simulationSettings.missingDataRate}
              onChange={(e) => setSimulationSettings({
                ...simulationSettings,
                missingDataRate: parseInt(e.target.value) || 0
              })}
              disabled={isSimulating}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors">欠損タイプ</div>
            <div className="space-y-1">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={simulationSettings.includeNulls}
                  onChange={(e) => setSimulationSettings({
                    ...simulationSettings,
                    includeNulls: e.target.checked
                  })}
                  disabled={isSimulating}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">NULL値</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={simulationSettings.includeEmptyStrings}
                  onChange={(e) => setSimulationSettings({
                    ...simulationSettings,
                    includeEmptyStrings: e.target.checked
                  })}
                  disabled={isSimulating}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">空文字</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={simulationSettings.includeZeros}
                  onChange={(e) => setSimulationSettings({
                    ...simulationSettings,
                    includeZeros: e.target.checked
                  })}
                  disabled={isSimulating}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">0値</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={simulationSettings.includeUndefined}
                  onChange={(e) => setSimulationSettings({
                    ...simulationSettings,
                    includeUndefined: e.target.checked
                  })}
                  disabled={isSimulating}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">undefined</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {isSimulating && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600 rounded transition-colors">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-700 dark:text-green-300 transition-colors">
              データシミュレーション実行中 - {simulationSettings.interval / 1000}秒ごとに{simulationSettings.recordsPerBatch}件のデータを挿入
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-600 dark:text-gray-400 transition-colors">
        <p>このシミュレーターは、リアルタイム更新機能のテスト用にダミーデータを定期的に挿入します。</p>
        <p>欠損データ設定により、NULL値、空文字、0値、undefinedを指定した確率で生成できます。</p>
        <p>まず「サンプル作成」でテーブルを作成し、「開始」でデータの挿入を開始してください。</p>
      </div>
    </div>
  )
}