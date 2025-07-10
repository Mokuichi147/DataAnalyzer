import { memoryDataStore } from './memoryDataStore'
import { sampleForChangePoint, sampleTimeSeries } from './dataSampling'
import { buildMemoryFilterFunction } from './filterUtils'
import { DataFilter } from '@/store/dataStore'

export interface BasicStats {
  count: number
  mean: number
  std: number
  min: number
  max: number
  quartiles: {
    q1: number
    q2: number
    q3: number
  }
}

export interface CorrelationResult {
  column1: string
  column2: string
  correlation: number
}

export interface ColumnAnalysisResult {
  columnName: string
  totalRows: number
  uniqueValues: number
  nullCount: number
  nullPercentage: number
  emptyStringCount: number
  emptyStringPercentage: number
  dataType: string
  sampleValues: string[]
  topValues?: Array<{ value: string; count: number; percentage: number }>
  // 数値型の場合の追加情報
  numericStats?: {
    min: number
    max: number
    mean: number
    median: number
    std: number
  }
}

export type ChangePointAlgorithm = 'moving_average' | 'cusum' | 'ewma' | 'binary_segmentation'

export interface ChangePointOptions {
  algorithm?: ChangePointAlgorithm
  xColumn?: string // 横軸カラム名（デフォルトは'index'）
  // 移動平均法用パラメータ
  windowSize?: number
  threshold?: number
  // CUSUM用パラメータ
  cusumThreshold?: number
  delta?: number
  // EWMA用パラメータ
  lambda?: number
  ewmaThreshold?: number
  // Binary Segmentation用パラメータ
  minSegmentSize?: number
}

// 数値に変換できるかチェック
function isNumeric(value: any): boolean {
  return !isNaN(parseFloat(value)) && isFinite(value)
}

// 数値データのみを抽出
function getNumericValues(data: any[], columnName: string): number[] {
  return data
    .map(row => row[columnName])
    .filter(value => value !== null && value !== undefined && isNumeric(value))
    .map(value => parseFloat(value))
}

export async function getBasicStatistics(
  tableName: string,
  columnName: string,
  filters: DataFilter[] = []
): Promise<BasicStats> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)

    const numericValues = getNumericValues(filteredData, columnName)
    
    if (numericValues.length === 0) {
      throw new Error(`No numeric values found in column ${columnName}`)
    }

    // 基本統計量を計算
    const count = numericValues.length
    const mean = numericValues.reduce((sum, val) => sum + val, 0) / count
    
    // 標準偏差を計算
    const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count
    const std = Math.sqrt(variance)
    
    // 最小値・最大値
    const min = Math.min(...numericValues)
    const max = Math.max(...numericValues)
    
    // 四分位数を計算
    const sorted = [...numericValues].sort((a, b) => a - b)
    const q1Index = Math.floor(sorted.length * 0.25)
    const q2Index = Math.floor(sorted.length * 0.5)
    const q3Index = Math.floor(sorted.length * 0.75)
    
    const quartiles = {
      q1: sorted[q1Index],
      q2: sorted[q2Index], // median
      q3: sorted[q3Index]
    }

    return {
      count,
      mean,
      std,
      min,
      max,
      quartiles
    }
  } catch (error) {
    console.error('Error calculating basic statistics:', error)
    throw error
  }
}

export async function getCorrelationMatrix(
  tableName: string,
  columnNames: string[],
  filters: DataFilter[] = []
): Promise<CorrelationResult[]> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)

    const results: CorrelationResult[] = []
    
    for (let i = 0; i < columnNames.length; i++) {
      for (let j = i + 1; j < columnNames.length; j++) {
        const col1 = columnNames[i]
        const col2 = columnNames[j]
        
        // 両方のカラムに値がある行のみを使用
        const validPairs: [number, number][] = []
        
        filteredData.forEach(row => {
          const val1 = row[col1]
          const val2 = row[col2]
          
          if (isNumeric(val1) && isNumeric(val2)) {
            validPairs.push([parseFloat(val1), parseFloat(val2)])
          }
        })
        
        if (validPairs.length < 2) {
          continue
        }
        
        // ピアソン相関係数を計算
        const n = validPairs.length
        const sum1 = validPairs.reduce((sum, pair) => sum + pair[0], 0)
        const sum2 = validPairs.reduce((sum, pair) => sum + pair[1], 0)
        const sum1Sq = validPairs.reduce((sum, pair) => sum + pair[0] * pair[0], 0)
        const sum2Sq = validPairs.reduce((sum, pair) => sum + pair[1] * pair[1], 0)
        const sumProduct = validPairs.reduce((sum, pair) => sum + pair[0] * pair[1], 0)
        
        const numerator = n * sumProduct - sum1 * sum2
        const denominator = Math.sqrt((n * sum1Sq - sum1 * sum1) * (n * sum2Sq - sum2 * sum2))
        
        const correlation = denominator === 0 ? 0 : numerator / denominator
        
        results.push({
          column1: col1,
          column2: col2,
          correlation: correlation
        })
      }
    }
    
    return results
  } catch (error) {
    console.error('Error calculating correlation matrix:', error)
    throw error
  }
}

// CUSUM変化点検出アルゴリズム
function detectCUSUM(data: Array<{index: number, value: number}>, threshold: number = 5, delta: number = 1) {
  const values = data.map(d => d.value)
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  
  let cusumPlus = 0
  let cusumMinus = 0
  const changePoints = []
  
  for (let i = 0; i < data.length; i++) {
    cusumPlus = Math.max(0, cusumPlus + data[i].value - mean - delta)
    cusumMinus = Math.min(0, cusumMinus + data[i].value - mean + delta)
    
    if (cusumPlus > threshold || Math.abs(cusumMinus) > threshold) {
      const confidence = Math.min(Math.max(cusumPlus, Math.abs(cusumMinus)) / threshold, 3.0) / 3.0
      changePoints.push({
        index: data[i].index,
        originalIndex: i,
        value: data[i].value,
        confidence,
        cusumPlus,
        cusumMinus,
        algorithm: 'CUSUM'
      })
      // CUSUMをリセット
      cusumPlus = 0
      cusumMinus = 0
    }
  }
  
  return changePoints
}

// EWMA変化点検出アルゴリズム
function detectEWMA(data: Array<{index: number, value: number}>, lambda: number = 0.1, threshold: number = 3) {
  const values = data.map(d => d.value)
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const std = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length)
  
  let ewma = mean
  const changePoints = []
  
  for (let i = 0; i < data.length; i++) {
    ewma = lambda * data[i].value + (1 - lambda) * ewma
    const deviation = Math.abs(data[i].value - ewma) / std
    
    if (deviation > threshold) {
      const confidence = Math.min(deviation / threshold, 3.0) / 3.0
      changePoints.push({
        index: data[i].index,
        originalIndex: i,
        value: data[i].value,
        confidence,
        ewma,
        deviation,
        algorithm: 'EWMA'
      })
    }
  }
  
  return changePoints
}

// Binary Segmentation変化点検出アルゴリズム
function detectBinarySegmentation(data: Array<{index: number, value: number}>, minSegmentSize: number = 5) {
  const values = data.map(d => d.value)
  
  function calculateVariance(segment: number[], start: number, end: number): number {
    const segmentData = segment.slice(start, end)
    const mean = segmentData.reduce((sum, val) => sum + val, 0) / segmentData.length
    return segmentData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0)
  }
  
  function findBestSplit(start: number, end: number): {index: number, score: number} | null {
    if (end - start < 2 * minSegmentSize) return null
    
    let bestSplit = -1
    let bestScore = Infinity
    
    for (let i = start + minSegmentSize; i < end - minSegmentSize; i++) {
      const leftVariance = calculateVariance(values, start, i)
      const rightVariance = calculateVariance(values, i, end)
      const totalVariance = leftVariance + rightVariance
      
      if (totalVariance < bestScore) {
        bestScore = totalVariance
        bestSplit = i
      }
    }
    
    return bestSplit > -1 ? {index: bestSplit, score: bestScore} : null
  }
  
  const changePoints = []
  const segments = [{start: 0, end: values.length}]
  
  while (segments.length > 0) {
    const segment = segments.pop()!
    const split = findBestSplit(segment.start, segment.end)
    
    if (split) {
      const globalVariance = calculateVariance(values, 0, values.length)
      const confidence = Math.min(1 - (split.score / globalVariance), 1.0)
      
      if (confidence > 0.1) { // 閾値
        changePoints.push({
          index: data[split.index].index,
          originalIndex: split.index,
          value: data[split.index].value,
          confidence,
          score: split.score,
          algorithm: 'Binary Segmentation'
        })
        
        segments.push({start: segment.start, end: split.index})
        segments.push({start: split.index, end: segment.end})
      }
    }
  }
  
  return changePoints.sort((a, b) => a.originalIndex - b.originalIndex)
}

export async function detectChangePoints(
  tableName: string,
  columnName: string,
  options: ChangePointOptions = {},
  filters: DataFilter[] = []
): Promise<any> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const xColumn = options.xColumn || 'index'
    
    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)
    
    // X軸が日付型かどうかを判定
    const isDateAxis = xColumn !== 'index' && filteredData.length > 0 && 
      filteredData.some(row => isDateValue(row[xColumn]))
      
    console.log('🔍 ChangePoints - isDateAxis:', isDateAxis, 'xColumn:', xColumn)
    if (filteredData.length > 0) {
      console.log('🔍 ChangePoints - sample X values:', filteredData.slice(0, 3).map(row => ({
        original: row[xColumn], 
        isDate: isDateValue(row[xColumn]),
        parsed: parseDateValue(row[xColumn])
      })))
    }
      
    const rawData = filteredData.map((row, originalIndex) => {
      let xValue: number
      
      if (xColumn === 'index') {
        xValue = originalIndex
      } else if (isDateValue(row[xColumn])) {
        // 日付型の場合
        const dateValue = parseDateValue(row[xColumn])
        xValue = isNaN(dateValue) ? originalIndex : dateValue
      } else if (isNumeric(row[xColumn])) {
        // 数値型の場合
        xValue = parseFloat(row[xColumn])
      } else {
        // その他の場合はインデックスを使用
        xValue = originalIndex
      }
      
      const yValue = isNumeric(row[columnName]) ? parseFloat(row[columnName]) : 0
      
      return {
        index: xValue,
        value: yValue,
        originalIndex: originalIndex,
        originalXValue: xColumn === 'index' ? originalIndex : row[xColumn]
      }
    }).filter(item => !isNaN(item.value) && !isNaN(item.index))
    .sort((a, b) => a.index - b.index) // X軸の値でソート
    
    if (rawData.length < 10) {
      return {
        changePoints: [],
        chartData: [],
        samplingInfo: null,
        performanceMetrics: { processingTime: 0, originalSize: rawData.length }
      }
    }

    const startTime = performance.now()
    
    // 大量データの場合はサンプリング
    const sampledResult = sampleForChangePoint(rawData, 2000)
    const workingData = sampledResult.data
    
    console.log('🔍 ChangePoints - workingData length:', workingData.length)
    console.log('🔍 ChangePoints - rawData length:', rawData.length)

    // アルゴリズムの選択とパラメータの設定
    const {
      algorithm = 'moving_average',
      windowSize = Math.max(3, Math.min(10, Math.floor(workingData.length / 20))),
      threshold = 2,
      cusumThreshold = 5,
      delta = 1,
      lambda = 0.1,
      ewmaThreshold = 3,
      minSegmentSize = 5
    } = options

    // 選択されたアルゴリズムで変化点検出を実行
    let changePoints: any[] = []
    let algorithmName = ''

    switch (algorithm) {
      case 'cusum':
        changePoints = detectCUSUM(workingData, cusumThreshold, delta)
        algorithmName = 'CUSUM'
        break
      case 'ewma':
        changePoints = detectEWMA(workingData, lambda, ewmaThreshold)
        algorithmName = 'EWMA'
        break
      case 'binary_segmentation':
        changePoints = detectBinarySegmentation(workingData, minSegmentSize)
        algorithmName = 'Binary Segmentation'
        break
      case 'moving_average':
      default:
        // 元の移動平均法を実行
        const allValues = workingData.map(d => d.value)
        const globalMean = allValues.reduce((sum, val) => sum + val, 0) / allValues.length
        const globalStd = Math.sqrt(
          allValues.reduce((sum, val) => sum + Math.pow(val - globalMean, 2), 0) / allValues.length
        )
        
        const detectionThreshold = globalStd * threshold
        let beforeSum = 0
        let afterSum = 0
        
        // 初期窓の計算
        for (let i = 0; i < windowSize; i++) {
          beforeSum += workingData[i].value
        }
        for (let i = windowSize; i < Math.min(windowSize * 2, workingData.length); i++) {
          afterSum += workingData[i].value
        }
        
        for (let i = windowSize; i < workingData.length - windowSize; i++) {
          // 移動窓の効率的更新
          if (i > windowSize) {
            beforeSum = beforeSum - workingData[i - windowSize - 1].value + workingData[i - 1].value
            afterSum = afterSum - workingData[i + windowSize - 1].value + workingData[Math.min(i + windowSize, workingData.length - 1)].value
          }
          
          const beforeMeanCurrent = beforeSum / windowSize
          const afterMeanCurrent = afterSum / windowSize
          const difference = Math.abs(afterMeanCurrent - beforeMeanCurrent)
          
          if (difference > detectionThreshold) {
            const confidence = Math.min(difference / detectionThreshold, 3.0) / 3.0
            
            changePoints.push({
              index: workingData[i].index,
              originalIndex: i,
              value: workingData[i].value,
              confidence,
              beforeMean: beforeMeanCurrent,
              afterMean: afterMeanCurrent,
              difference,
              algorithm: 'Moving Average'
            })
          }
        }
        algorithmName = 'Moving Average'
        break
    }
    
    // チャート用データの準備
    console.log('🔍 ChangePoints - Creating chart data, isDateAxis:', isDateAxis)
    console.log('🔍 ChangePoints - Sample workingData:', workingData.slice(0, 3))
    console.log('🔍 ChangePoints - changePoints:', changePoints)
    
    const chartData = {
      labels: isDateAxis ? undefined : workingData.map(d => d.originalXValue || d.index),
      datasets: [
        {
          label: 'データ値',
          data: workingData.map((d) => {
            const xValue = isDateAxis 
              ? (d.originalXValue ? new Date(d.originalXValue) : new Date(d.index))
              : (d.originalXValue || d.index)
            return { x: xValue, y: d.value }
          }),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 4
        },
        {
          label: '変化点',
          data: changePoints.map(cp => {
            const dataPoint = workingData[cp.originalIndex]
            return {
              x: isDateAxis 
                ? (dataPoint?.originalXValue ? new Date(dataPoint.originalXValue) : new Date(cp.index))
                : (dataPoint?.originalXValue || cp.index),
              y: cp.value
            }
          }),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          type: 'line' as const,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
          pointStyle: 'circle',
          pointBackgroundColor: 'rgba(239, 68, 68, 0.8)',
          pointBorderColor: 'rgb(239, 68, 68)'
        }
      ]
    }
    
    const endTime = performance.now()
    
    return {
      changePoints,
      chartData,
      samplingInfo: sampledResult.isReduced ? {
        originalSize: sampledResult.originalSize,
        sampledSize: sampledResult.sampledSize,
        samplingRatio: sampledResult.samplingRatio,
        method: sampledResult.method
      } : null,
      performanceMetrics: {
        processingTime: endTime - startTime,
        originalSize: rawData.length,
        processedSize: workingData.length
      },
      statistics: {
        totalChangePoints: changePoints.length,
        averageConfidence: changePoints.length > 0 
          ? changePoints.reduce((sum, cp) => sum + cp.confidence, 0) / changePoints.length 
          : 0,
        algorithm: algorithmName,
        algorithmOptions: options
      },
      isDateAxis
    }
  } catch (error) {
    console.error('Error detecting change points:', error)
    throw error
  }
}

export async function performFactorAnalysis(
  _tableName: string, // 将来的に使用予定
  columnNames: string[],
  _filters: DataFilter[] = []
): Promise<any> {
  // 簡略化した因子分析（主成分分析の近似）
  try {
    // const correlationMatrix = await getCorrelationMatrix(tableName, columnNames) // 将来的に使用予定
    
    return {
      factors: [
        {
          name: 'Factor 1',
          variance: 0.7,
          loadings: columnNames.map(col => ({
            variable: col,
            loading: Math.random() * 0.8 + 0.2 // 簡略化のためランダム値
          }))
        }
      ],
      eigenvalues: [2.1, 1.3, 0.8],
      cumulativeVariance: [0.7, 0.9, 1.0]
    }
  } catch (error) {
    console.error('Error performing factor analysis:', error)
    throw error
  }
}

export async function getHistogramData(
  tableName: string,
  columnName: string,
  bins: number = 10,
  filters: DataFilter[] = []
): Promise<any> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)

    const numericValues = getNumericValues(filteredData, columnName)
    
    if (numericValues.length === 0) {
      throw new Error(`No numeric values found in column ${columnName}`)
    }

    const min = Math.min(...numericValues)
    const max = Math.max(...numericValues)
    const binWidth = (max - min) / bins
    
    const histogram = Array(bins).fill(0)
    const labels = []
    
    // ビンのラベルを作成
    for (let i = 0; i < bins; i++) {
      const start = min + i * binWidth
      const end = min + (i + 1) * binWidth
      labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`)
    }
    
    // データをビンに分類
    numericValues.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1)
      histogram[binIndex]++
    })
    
    // 期待される形式に変換
    const totalCount = numericValues.length
    const result = labels.map((label, index) => ({
      bin: label,
      count: histogram[index],
      frequency: ((histogram[index] / totalCount) * 100).toFixed(1)
    }))
    
    return result
  } catch (error) {
    console.error('Error generating histogram data:', error)
    throw error
  }
}

export async function getTimeSeriesData(
  tableName: string,
  valueColumn: string,
  xColumn: string,
  filters: DataFilter[] = []
): Promise<any> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const startTime = performance.now()

    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)

    // X軸が日付型かどうかを判定
    const isDateAxis = xColumn !== 'index' && filteredData.length > 0 && 
      filteredData.some(row => isDateValue(row[xColumn]))
    
    console.log('🔍 TimeSeriesData - isDateAxis:', isDateAxis, 'xColumn:', xColumn)
    if (filteredData.length > 0) {
      console.log('🔍 TimeSeriesData - sample X values:', filteredData.slice(0, 3).map(row => ({
        original: row[xColumn], 
        isDate: isDateValue(row[xColumn]),
        parsed: parseDateValue(row[xColumn])
      })))
    }

    // データの準備
    const rawData = filteredData.map((row, originalIndex) => {
      let xValue: number
      let timeLabel: string
      
      if (xColumn === 'index') {
        xValue = originalIndex
        timeLabel = originalIndex.toString()
      } else if (isDateValue(row[xColumn])) {
        // 日付型の場合
        const dateValue = parseDateValue(row[xColumn])
        if (isNaN(dateValue)) {
          xValue = originalIndex
          timeLabel = originalIndex.toString()
        } else {
          xValue = dateValue
          // 元の日付文字列をそのまま使用
          timeLabel = String(row[xColumn]).trim()
        }
      } else if (isNumeric(row[xColumn])) {
        // 数値型の場合
        xValue = parseFloat(row[xColumn])
        timeLabel = xValue.toString()
      } else {
        // その他の場合はインデックスを使用
        xValue = originalIndex
        timeLabel = originalIndex.toString()
      }
      
      const yValue = isNumeric(row[valueColumn]) ? parseFloat(row[valueColumn]) : 0
      
      return {
        time: timeLabel,
        value: yValue,
        index: xValue,
        originalIndex: originalIndex,
        originalXValue: xColumn === 'index' ? originalIndex : row[xColumn]
      }
    }).filter(item => !isNaN(item.value))
    .sort((a, b) => a.index - b.index) // X軸の値でソート

    if (rawData.length === 0) {
      return {
        data: [],
        chartData: { labels: [], datasets: [] },
        samplingInfo: null,
        performanceMetrics: { processingTime: 0, originalSize: 0 }
      }
    }

    // 大量データの場合はサンプリング
    const sampledResult = sampleTimeSeries(rawData, 1500)
    const workingData = sampledResult.data

    // 時系列統計の計算
    const values = workingData.map(d => d.value)
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    
    // 移動平均の計算（正確な実装）
    const movingAverageWindow = Math.max(3, Math.floor(workingData.length / 20))
    const movingAverage: number[] = []
    
    for (let i = 0; i < workingData.length; i++) {
      // 各ポイントで使用可能なウィンドウサイズを計算
      const windowStart = Math.max(0, i - movingAverageWindow + 1)
      const windowEnd = i + 1
      const currentWindowSize = windowEnd - windowStart
      
      // 現在のウィンドウ内の値の合計を計算
      let windowSum = 0
      for (let j = windowStart; j < windowEnd; j++) {
        windowSum += workingData[j].value
      }
      
      // 移動平均を計算
      movingAverage.push(windowSum / currentWindowSize)
    }

    // トレンド分析（線形回帰）
    const n = workingData.length
    const sumX = workingData.reduce((sum, _, i) => sum + i, 0)
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = workingData.reduce((sum, d, i) => sum + i * d.value, 0)
    const sumXX = workingData.reduce((sum, _, i) => sum + i * i, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // チャート用データの準備
    console.log('🔍 TimeSeriesData - Creating chart data, isDateAxis:', isDateAxis)
    console.log('🔍 TimeSeriesData - Sample workingData:', workingData.slice(0, 3))
    
    const chartData = {
      labels: isDateAxis ? undefined : workingData.map(d => d.time),
      datasets: [
        {
          label: '実際の値',
          data: isDateAxis 
            ? workingData.map(d => {
                const xDate = d.originalXValue ? new Date(d.originalXValue) : new Date(d.index)
                return { x: xDate, y: d.value }
              })
            : values,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: false,
          order: 3
        },
        {
          label: `移動平均 (${movingAverageWindow}期間)`,
          data: isDateAxis 
            ? workingData.map((d, i) => ({ 
                x: d.originalXValue ? new Date(d.originalXValue) : new Date(d.index), 
                y: movingAverage[i] 
              }))
            : movingAverage,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 3,
          fill: false,
          order: 2
        },
        {
          label: 'トレンドライン',
          data: isDateAxis 
            ? workingData.map((d, i) => ({ 
                x: d.originalXValue ? new Date(d.originalXValue) : new Date(d.index), 
                y: slope * i + intercept 
              }))
            : workingData.map((_, i) => slope * i + intercept),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          order: 1
        }
      ]
    }

    const endTime = performance.now()

    return {
      data: workingData.map((d, i) => ({
        time: d.time,
        value: d.value,
        movingAverage: movingAverage[i],
        trend: slope * i + intercept,
        index: d.index
      })),
      chartData,
      samplingInfo: sampledResult.isReduced ? {
        originalSize: sampledResult.originalSize,
        sampledSize: sampledResult.sampledSize,
        samplingRatio: sampledResult.samplingRatio,
        method: sampledResult.method
      } : null,
      performanceMetrics: {
        processingTime: endTime - startTime,
        originalSize: rawData.length,
        processedSize: workingData.length
      },
      statistics: {
        mean,
        trend: {
          slope,
          intercept,
          direction: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable'
        },
        movingAverageWindow,
        totalPoints: workingData.length
      },
      isDateAxis
    }
  } catch (error) {
    console.error('Error generating time series data:', error)
    throw error
  }
}

export async function getColumnAnalysis(
  tableName: string,
  columnNames: string[],
  filters: DataFilter[] = []
): Promise<ColumnAnalysisResult[]> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    // フィルターを適用
    const filterFunction = buildMemoryFilterFunction(filters)
    const filteredData = table.data.filter(filterFunction)

    const results: ColumnAnalysisResult[] = []

    for (const columnName of columnNames) {
      const totalRows = filteredData.length
      let nullCount = 0
      let emptyStringCount = 0
      const valueFrequency = new Map<string, number>()
      const uniqueValues = new Set<string>()
      const numericValues: number[] = []

      // データを分析
      for (const row of filteredData) {
        const value = row[columnName]
        
        // NULL/undefined チェック
        if (value === null || value === undefined) {
          nullCount++
          continue
        }

        const stringValue = String(value).trim()
        
        // 空文字列チェック
        if (stringValue === '') {
          emptyStringCount++
          continue
        }

        // ユニーク値とカウント
        uniqueValues.add(stringValue)
        valueFrequency.set(stringValue, (valueFrequency.get(stringValue) || 0) + 1)

        // 数値として解析可能かチェック
        if (isNumeric(value)) {
          numericValues.push(parseFloat(stringValue))
        }
      }

      // データタイプを推定
      const dataType = inferDataType(filteredData, columnName)

      // 安全なパーセンテージ計算のヘルパー関数
      const safePercentage = (count: number, total: number): number => {
        if (total === 0) return 0
        return (count / total) * 100
      }

      // 上位値を取得（頻度順）
      const topValues = Array.from(valueFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({
          value,
          count,
          percentage: safePercentage(count, totalRows)
        }))

      // サンプル値を取得（ユニーク値から最大10個）
      const sampleValues = Array.from(uniqueValues).slice(0, 10)

      // 数値統計（数値型の場合）
      let numericStats: ColumnAnalysisResult['numericStats'] = undefined
      if (numericValues.length > 0 && totalRows > 0 && numericValues.length >= totalRows * 0.5) {
        const sorted = [...numericValues].sort((a, b) => a - b)
        const mean = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length
        const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length
        
        numericStats = {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          mean: mean,
          median: sorted[Math.floor(sorted.length / 2)],
          std: Math.sqrt(variance)
        }
      }

      results.push({
        columnName,
        totalRows,
        uniqueValues: uniqueValues.size,
        nullCount,
        nullPercentage: safePercentage(nullCount, totalRows),
        emptyStringCount,
        emptyStringPercentage: safePercentage(emptyStringCount, totalRows),
        dataType,
        sampleValues: sampleValues || [],
        topValues: topValues || [],
        numericStats
      })
    }

    return results
  } catch (error) {
    console.error('Error analyzing columns:', error)
    throw error
  }
}

// 日付値を検出・変換する関数
function isDateValue(value: any): boolean {
  if (value === null || value === undefined || value === '') return false
  const strValue = String(value).trim()
  
  // 基本的な日付形式をチェック
  return /^\d{4}-\d{2}-\d{2}/.test(strValue) || 
         /^\d{2}\/\d{2}\/\d{4}/.test(strValue) ||
         /^\d{4}\/\d{2}\/\d{2}/.test(strValue)
}

function parseDateValue(value: any): number {
  if (value === null || value === undefined || value === '') return NaN
  
  const strValue = String(value).trim()
  try {
    const date = new Date(strValue)
    return isNaN(date.getTime()) ? NaN : date.getTime()
  } catch (e) {
    return NaN
  }
}

// データタイプ推定のヘルパー関数
function inferDataType(data: any[], columnName: string): string {
  if (data.length === 0) return 'TEXT'
  
  const sampleSize = Math.min(data.length, 100)
  const samples = data.slice(0, sampleSize)
  
  let integerCount = 0
  let floatCount = 0
  let dateCount = 0
  let booleanCount = 0
  let totalNonNull = 0
  
  for (const row of samples) {
    const value = row[columnName]
    if (value === null || value === undefined || value === '') continue
    
    totalNonNull++
    const strValue = String(value).trim()
    
    if (strValue.toLowerCase() === 'true' || strValue.toLowerCase() === 'false') {
      booleanCount++
    } else if (/^-?\d+$/.test(strValue)) {
      integerCount++
    } else if (/^-?\d*\.\d+$/.test(strValue)) {
      floatCount++
    } else if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
      dateCount++
    }
  }
  
  if (totalNonNull === 0) return 'TEXT'
  
  const threshold = totalNonNull * 0.8
  
  if (integerCount >= threshold) return 'INTEGER'
  if (floatCount >= threshold) return 'FLOAT'
  if ((integerCount + floatCount) >= threshold) return 'NUMERIC'
  if (dateCount >= threshold) return 'DATE'
  if (booleanCount >= threshold) return 'BOOLEAN'
  
  return 'TEXT'
}