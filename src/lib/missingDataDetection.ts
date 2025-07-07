import { memoryDataStore } from './memoryDataStore'

export interface MissingDataOptions {
  includeZero?: boolean // 0を欠損として扱うか
  includeEmpty?: boolean // 空文字を欠損として扱うか
}

export interface MissingDataEvent {
  rowIndex: number
  columnName: string
  eventType: 'missing_start' | 'missing_end' // 欠損開始 | 欠損終了
  value: any
  previousValue?: any
  missingLength?: number // 欠損が続いた長さ（復旧時のみ）
  confidence: number // 0-1の信頼度
}

export interface MissingDataResult {
  events: MissingDataEvent[]
  summary: {
    totalEvents: number
    missingStartEvents: number
    missingEndEvents: number
    longestMissingStreak: number
    affectedColumns: string[]
  }
  columnStats: Record<string, {
    totalMissingEvents: number
    averageMissingLength: number
    maxMissingLength: number
    missingPercentage: number
  }>
}

// 値が欠損かどうかを判定
function isMissing(value: any, options: MissingDataOptions): boolean {
  // NULL, undefined は常に欠損
  if (value === null || value === undefined) {
    return true
  }
  
  // 空文字チェック
  if (options.includeEmpty && (value === '' || (typeof value === 'string' && value.trim() === ''))) {
    return true
  }
  
  // 0チェック
  if (options.includeZero && (value === 0 || value === '0')) {
    return true
  }
  
  return false
}

// 値が有効かどうかを判定
function isValid(value: any, options: MissingDataOptions): boolean {
  return !isMissing(value, options)
}

export async function detectMissingData(
  tableName: string,
  columnNames: string[],
  options: MissingDataOptions = {}
): Promise<MissingDataResult> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const {
      includeZero = true,
      includeEmpty = true
    } = options

    const events: MissingDataEvent[] = []
    const columnStats: Record<string, any> = {}

    // 各カラムについて分析
    for (const columnName of columnNames) {
      const columnEvents: MissingDataEvent[] = []
      let currentMissingStreak = 0
      let missingStartIndex = -1
      let maxMissingLength = 0
      let totalMissingEvents = 0
      let totalMissingLength = 0
      
      // カラムのデータを順番に処理
      for (let i = 0; i < table.data.length; i++) {
        const currentValue = table.data[i][columnName]
        const isMissingNow = isMissing(currentValue, { includeZero, includeEmpty })
        
        if (isMissingNow) {
          // 欠損状態
          if (currentMissingStreak === 0) {
            // 欠損開始
            missingStartIndex = i
            
            // 前の値を取得（信頼度計算用）
            let previousValue = null
            for (let j = i - 1; j >= 0; j--) {
              const prevVal = table.data[j][columnName]
              if (isValid(prevVal, { includeZero, includeEmpty })) {
                previousValue = prevVal
                break
              }
            }
            
            // 固定の信頼度を設定
            const confidence = 1.0
            
            const event: MissingDataEvent = {
              rowIndex: i,
              columnName,
              eventType: 'missing_start',
              value: currentValue,
              previousValue,
              confidence
            }
            
            columnEvents.push(event)
            totalMissingEvents++
          }
          currentMissingStreak++
        } else {
          // 有効状態
          if (currentMissingStreak > 0) {
            // 欠損終了（復旧）
            const confidence = 1.0
            
            const event: MissingDataEvent = {
              rowIndex: i,
              columnName,
              eventType: 'missing_end',
              value: currentValue,
              missingLength: currentMissingStreak,
              confidence
            }
            
            columnEvents.push(event)
            totalMissingLength += currentMissingStreak
            maxMissingLength = Math.max(maxMissingLength, currentMissingStreak)
            currentMissingStreak = 0
          }
        }
      }
      
      // カラムの最後で欠損が続いている場合の処理
      if (currentMissingStreak > 0) {
        totalMissingLength += currentMissingStreak
        maxMissingLength = Math.max(maxMissingLength, currentMissingStreak)
      }
      
      // カラム統計を計算
      const totalMissingRows = table.data.filter(row => isMissing(row[columnName], { includeZero, includeEmpty })).length
      
      columnStats[columnName] = {
        totalMissingEvents,
        averageMissingLength: totalMissingEvents > 0 ? totalMissingLength / (totalMissingEvents / 2) : 0,
        maxMissingLength,
        missingPercentage: (totalMissingRows / table.data.length) * 100
      }
      
      events.push(...columnEvents)
    }
    
    // イベントを時系列順にソート
    events.sort((a, b) => a.rowIndex - b.rowIndex)
    
    // サマリー統計を計算
    const missingStartEvents = events.filter(e => e.eventType === 'missing_start').length
    const missingEndEvents = events.filter(e => e.eventType === 'missing_end').length
    const longestMissingStreak = Math.max(...Object.values(columnStats).map((stats: any) => stats.maxMissingLength), 0)
    const affectedColumns = Object.keys(columnStats).filter(col => columnStats[col].totalMissingEvents > 0)
    
    return {
      events,
      summary: {
        totalEvents: events.length,
        missingStartEvents,
        missingEndEvents,
        longestMissingStreak,
        affectedColumns
      },
      columnStats
    }
    
  } catch (error) {
    console.error('Error detecting missing data:', error)
    throw error
  }
}


// チャート用データの準備
export function prepareMissingDataChart(result: MissingDataResult, tableName: string): any {
  const table = memoryDataStore.getTableSchema(tableName)
  if (!table) return null
  
  const datasets = []
  const colors = [
    'rgb(239, 68, 68)', // red
    'rgb(59, 130, 246)', // blue  
    'rgb(34, 197, 94)', // green
    'rgb(249, 115, 22)', // orange
    'rgb(168, 85, 247)', // purple
  ]
  
  // 各カラムごとに欠損イベントをプロット
  Object.keys(result.columnStats).forEach((columnName, index) => {
    const columnEvents = result.events.filter(e => e.columnName === columnName)
    
    datasets.push({
      label: `${columnName} - 欠損開始`,
      data: columnEvents
        .filter(e => e.eventType === 'missing_start')
        .map(e => ({ x: e.rowIndex, y: index + 1 })),
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length],
      type: 'scatter' as const,
      pointRadius: 6,
      pointHoverRadius: 8,
      showLine: false
    })
    
    datasets.push({
      label: `${columnName} - 欠損終了`,
      data: columnEvents
        .filter(e => e.eventType === 'missing_end')
        .map(e => ({ x: e.rowIndex, y: index + 1 })),
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length],
      type: 'scatter' as const,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointStyle: 'triangle',
      showLine: false
    })
  })
  
  return {
    labels: Array.from({ length: table.data.length }, (_, i) => i),
    datasets
  }
}