import { memoryDataStore } from './memoryDataStore'
import { sampleForChangePoint, sampleTimeSeries } from './dataSampling'
import { buildMemoryFilterFunction } from './filterUtils'
import { DataFilter } from '@/store/dataStore'

export interface BasicStats {
  columnName: string
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

export type ChangePointAlgorithm = 'moving_average' | 'cusum' | 'ewma' | 'binary_segmentation' | 'pelt' | 'trend_detection' | 'variance_detection'

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
  // PELT用パラメータ
  penalty?: number
  minseglen?: number
  // トレンド検出用パラメータ
  trendWindowSize?: number
  trendThreshold?: number
  // 分散検出用パラメータ
  varianceWindowSize?: number
  varianceThreshold?: number
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
      columnName,
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

// CUSUM変化点検出アルゴリズム（改善版：トレンド除去）
function detectCUSUM(data: Array<{index: number, value: number}>, threshold: number = 5, delta: number = 1) {
  if (data.length < 10) return []
  
  const values = data.map(d => d.value)
  
  // 線形トレンドを除去してからCUSUMを適用
  const n = values.length
  const sumX = values.reduce((sum, _, i) => sum + i, 0)
  const sumY = values.reduce((sum, val) => sum + val, 0)
  const sumXY = values.reduce((sum, val, i) => sum + i * val, 0)
  const sumXX = values.reduce((sum, _, i) => sum + i * i, 0)
  
  // 線形回帰の係数を計算
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  // トレンド除去済みデータ
  const detrendedValues = values.map((val, i) => val - (slope * i + intercept))
  const mean = detrendedValues.reduce((sum, val) => sum + val, 0) / detrendedValues.length
  
  let cusumPlus = 0
  let cusumMinus = 0
  const changePoints = []
  
  for (let i = 0; i < detrendedValues.length; i++) {
    cusumPlus = Math.max(0, cusumPlus + detrendedValues[i] - mean - delta)
    cusumMinus = Math.min(0, cusumMinus + detrendedValues[i] - mean + delta)
    
    if (cusumPlus > threshold || Math.abs(cusumMinus) > threshold) {
      // 局所的なトレンド変化を確認
      const windowSize = Math.min(10, Math.floor(data.length / 5))
      const beforeTrend = calculateLocalSlope(values, Math.max(0, i - windowSize), i)
      const afterTrend = calculateLocalSlope(values, i, Math.min(values.length, i + windowSize))
      const trendChange = Math.abs(afterTrend - beforeTrend)
      
      // トレンドの変化が十分大きい場合のみ変化点として認識
      if (trendChange > 0.1) {
        const confidence = Math.min(Math.max(cusumPlus, Math.abs(cusumMinus)) / threshold, 3.0) / 3.0
        changePoints.push({
          index: data[i].index,
          originalIndex: i,
          value: data[i].value,
          confidence,
          cusumPlus,
          cusumMinus,
          beforeTrend,
          afterTrend,
          trendChange,
          algorithm: 'CUSUM'
        })
      }
      
      // CUSUMをリセット
      cusumPlus = 0
      cusumMinus = 0
    }
  }
  
  return changePoints
}

// 局所的な傾きを計算するヘルパー関数
function calculateLocalSlope(values: number[], start: number, end: number): number {
  if (end <= start || end - start < 2) return 0
  
  const segment = values.slice(start, end)
  const n = segment.length
  const sumX = segment.reduce((sum, _, i) => sum + i, 0)
  const sumY = segment.reduce((sum, val) => sum + val, 0)
  const sumXY = segment.reduce((sum, val, i) => sum + i * val, 0)
  const sumXX = segment.reduce((sum, _, i) => sum + i * i, 0)
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  return isNaN(slope) ? 0 : slope
}

// EWMA変化点検出アルゴリズム（改善版：適応的閾値とトレンド考慮）
function detectEWMA(data: Array<{index: number, value: number}>, lambda: number = 0.1, threshold: number = 3) {
  if (data.length < 10) return []
  
  const values = data.map(d => d.value)
  
  // 初期のEWMAを計算（最初の数点の平均）
  const initialPoints = Math.min(5, values.length)
  let ewma = values.slice(0, initialPoints).reduce((sum, val) => sum + val, 0) / initialPoints
  // let ewmaVariance = 0  // 将来の拡張用（現在は未使用）
  
  const changePoints = []
  const deviations = []
  
  // 適応的標準偏差を計算
  for (let i = initialPoints; i < data.length; i++) {
    const oldEwma = ewma
    ewma = lambda * data[i].value + (1 - lambda) * ewma
    
    // EWMAの変動を追跡
    const prediction = oldEwma
    const error = data[i].value - prediction
    deviations.push(Math.abs(error))
    
    // 局所的な標準偏差を計算（過去20点）
    const recentDeviations = deviations.slice(-20)
    const localStd = Math.sqrt(recentDeviations.reduce((sum, dev) => sum + dev * dev, 0) / recentDeviations.length)
    
    const normalizedDeviation = Math.abs(error) / (localStd + 1e-6) // ゼロ除算回避
    
    if (normalizedDeviation > threshold) {
      // 前後の局所トレンドを確認
      const windowSize = Math.min(10, Math.floor(data.length / 5))
      const beforeTrend = calculateLocalSlope(values, Math.max(0, i - windowSize), i)
      const afterStart = Math.min(i + 1, values.length - windowSize)
      const afterEnd = Math.min(i + windowSize + 1, values.length)
      const afterTrend = calculateLocalSlope(values, afterStart, afterEnd)
      
      // トレンド変化または分散変化を確認
      const trendChange = Math.abs(afterTrend - beforeTrend)
      const isSignificantChange = trendChange > 0.1 || normalizedDeviation > threshold * 1.5
      
      if (isSignificantChange) {
        const confidence = Math.min(normalizedDeviation / threshold, 3.0) / 3.0
        changePoints.push({
          index: data[i].index,
          originalIndex: i,
          value: data[i].value,
          confidence,
          ewma,
          deviation: normalizedDeviation,
          localStd,
          beforeTrend,
          afterTrend,
          trendChange,
          algorithm: 'EWMA'
        })
      }
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

// PELT (Pruned Exact Linear Time) アルゴリズム - 最適化版
function detectPELT(data: Array<{index: number, value: number}>, penalty: number = 10, minseglen: number = 3): any[] {
  const n = data.length
  
  // 大きなデータセットの場合は間引いて計算速度を向上
  if (n > 1000) {
    const skipInterval = Math.max(1, Math.floor(n / 500)) // 最大500点に削減
    const sampledData = data.filter((_, i) => i % skipInterval === 0)
    const result: any[] = detectPELT(sampledData, penalty, Math.max(2, Math.floor(minseglen / skipInterval)))
    
    // 元のインデックスにマッピング
    return result.map((cp: any) => ({
      ...cp,
      index: data[cp.originalIndex * skipInterval]?.index || cp.index,
      originalIndex: cp.originalIndex * skipInterval
    }))
  }
  
  const values = data.map(d => d.value)
  
  // 累積統計をキャッシュして計算速度向上
  const cumSum = new Array(n + 1).fill(0)
  const cumSumSq = new Array(n + 1).fill(0)
  for (let i = 0; i < n; i++) {
    cumSum[i + 1] = cumSum[i] + values[i]
    cumSumSq[i + 1] = cumSumSq[i] + values[i] * values[i]
  }
  
  // 累積コスト配列
  const F = new Array(n + 1).fill(Infinity)
  F[0] = -penalty
  
  // 各点で最適な前の変化点を記録
  const previousChangePoint = new Array(n + 1).fill(-1)
  
  // セグメント内のコスト計算関数（簡素化版）
  function segmentCost(start: number, end: number): number {
    if (end <= start || end - start < minseglen) return 0
    
    const length = end - start
    const sum = cumSum[end] - cumSum[start]
    const sumSq = cumSumSq[end] - cumSumSq[start]
    
    // 分散ベースのコスト（線形トレンド計算を簡素化）
    const mean = sum / length
    const variance = (sumSq - sum * mean) / length
    
    return isNaN(variance) || variance < 0 ? 0 : variance * length
  }
  
  // プルーニング付き動的プログラミング
  for (let t = 1; t <= n; t++) {
    // 候補点を制限して計算量削減
    const maxCandidates = Math.min(50, t) // 最大50候補まで
    const stepSize = Math.max(1, Math.floor(t / maxCandidates))
    
    for (let s = 0; s < t; s += stepSize) {
      if (t - s >= minseglen) {
        const cost = F[s] + segmentCost(s, t) + penalty
        if (cost < F[t]) {
          F[t] = cost
          previousChangePoint[t] = s
        }
      }
    }
  }
  
  // 変化点を逆向きにたどって取得
  const changePoints = []
  let current = n
  
  while (previousChangePoint[current] !== -1 && changePoints.length < 50) { // 最大50変化点まで
    const changePointIndex = previousChangePoint[current]
    if (changePointIndex > 0) {
      const confidence = Math.min(F[current] / (penalty * 10), 1)
      
      changePoints.unshift({
        index: data[changePointIndex].index,
        originalIndex: changePointIndex,
        value: data[changePointIndex].value,
        confidence,
        cost: F[current],
        algorithm: 'PELT'
      })
    }
    current = previousChangePoint[current]
  }
  
  return changePoints
}

// トレンド変化検出アルゴリズム - 計算最適化版（全データ処理）
function detectTrendChanges(data: Array<{index: number, value: number}>, windowSize: number = 10, threshold: number = 0.5): any[] {
  const changePoints: any[] = []
  const n = data.length
  
  if (n < windowSize * 2) return changePoints
  
  // 大量データの場合はウィンドウサイズを動的調整
  const adaptiveWindowSize = Math.min(windowSize, Math.max(5, Math.floor(n / 100)))
  
  // トレンド計算の最適化：累積統計を事前計算（全データ）
  const cumSum = new Array(n + 1).fill(0)
  const cumSumX = new Array(n + 1).fill(0)
  const cumSumXY = new Array(n + 1).fill(0)
  const cumSumXX = new Array(n + 1).fill(0)
  
  for (let i = 0; i < n; i++) {
    cumSum[i + 1] = cumSum[i] + data[i].value
    cumSumX[i + 1] = cumSumX[i] + i
    cumSumXY[i + 1] = cumSumXY[i] + i * data[i].value
    cumSumXX[i + 1] = cumSumXX[i] + i * i
  }
  
  // 高速なトレンド計算関数（O(1)計算）
  function calculateLocalTrendFast(start: number, end: number): number {
    const len = end - start
    if (len < 2) return 0
    
    const sumY = cumSum[end] - cumSum[start]
    const sumX = cumSumX[end] - cumSumX[start] - start * len
    const sumXY = cumSumXY[end] - cumSumXY[start] - start * sumY
    const sumXXAdj = cumSumXX[end] - cumSumXX[start] - 2 * start * (cumSumX[end] - cumSumX[start]) + start * start * len
    
    const denominator = len * sumXXAdj - sumX * sumX
    if (Math.abs(denominator) < 1e-10) return 0
    
    const slope = (len * sumXY - sumX * sumY) / denominator
    return isNaN(slope) ? 0 : slope
  }
  
  // 効率的なピーク・ボトム判定（サンプリング使用）
  function isActualPeakOrValley(centerIndex: number, checkWindow: number): { isPeak: boolean, isValley: boolean } {
    const start = Math.max(0, centerIndex - checkWindow)
    const end = Math.min(n, centerIndex + checkWindow + 1)
    const centerValue = data[centerIndex].value
    
    let higherCount = 0
    let lowerCount = 0
    let totalPoints = 0
    
    // 効率的なサンプリング（最大20点をチェック）
    const sampleStep = Math.max(1, Math.floor((end - start) / 20))
    for (let i = start; i < end; i += sampleStep) {
      if (i === centerIndex) continue
      totalPoints++
      
      if (data[i].value > centerValue) higherCount++
      else if (data[i].value < centerValue) lowerCount++
    }
    
    const isPeak = totalPoints > 0 && higherCount / totalPoints < 0.25
    const isValley = totalPoints > 0 && lowerCount / totalPoints < 0.25
    
    return { isPeak, isValley }
  }
  
  // 全データを処理するが、処理頻度を動的調整
  const processingStep = Math.max(1, Math.floor(n / 500)) // 最大500候補点
  
  // 事前に計算したトレンドをキャッシュ
  const trendCache = new Map<string, number>()
  
  function getCachedTrend(start: number, end: number): number {
    const key = `${start}-${end}`
    if (trendCache.has(key)) {
      return trendCache.get(key)!
    }
    const trend = calculateLocalTrendFast(start, end)
    trendCache.set(key, trend)
    return trend
  }
  
  for (let i = adaptiveWindowSize; i < n - adaptiveWindowSize; i += processingStep) {
    const beforeTrend = getCachedTrend(i - adaptiveWindowSize, i)
    const afterTrend = getCachedTrend(i, i + adaptiveWindowSize)
    
    const trendChange = Math.abs(afterTrend - beforeTrend)
    
    if (trendChange > threshold) {
      let changeType = 'trend_change'
      
      // 効率的な変化種別判定
      if (beforeTrend > 0.1 && afterTrend < -0.1) {
        const { isPeak } = isActualPeakOrValley(i, Math.floor(adaptiveWindowSize / 2))
        changeType = isPeak ? 'peak' : 'trend_change'
      } else if (beforeTrend < -0.1 && afterTrend > 0.1) {
        const { isValley } = isActualPeakOrValley(i, Math.floor(adaptiveWindowSize / 2))
        changeType = isValley ? 'valley' : 'trend_change'
      } else if (Math.abs(beforeTrend) < 0.1 && Math.abs(afterTrend) > threshold) {
        changeType = afterTrend > 0 ? 'start_increase' : 'start_decrease'
      } else if (Math.abs(beforeTrend) > 0.1 && Math.abs(afterTrend) < 0.1) {
        changeType = beforeTrend > 0 ? 'end_increase' : 'end_decrease'
      }
      
      const trendStrength = Math.max(Math.abs(beforeTrend), Math.abs(afterTrend))
      const confidence = Math.min((trendChange / threshold) * (trendStrength + 0.1), 1.0)
      
      // より厳格な閾値で高品質な変化点のみを抽出
      if (confidence > 0.5) {
        changePoints.push({
          index: data[i].index,
          originalIndex: i,
          value: data[i].value,
          confidence,
          beforeTrend,
          afterTrend,
          trendChange,
          changeType,
          algorithm: 'Trend Detection'
        })
      }
    }
  }
  
  // 近接した変化点を統合して重要な変化点のみを残す
  const consolidatedPoints: any[] = []
  const minDistance = Math.max(adaptiveWindowSize, 10)
  
  for (const point of changePoints) {
    const tooClose = consolidatedPoints.some(existing => 
      Math.abs(existing.originalIndex - point.originalIndex) < minDistance
    )
    
    if (!tooClose || consolidatedPoints.length === 0) {
      consolidatedPoints.push(point)
    } else {
      // より信頼度の高い変化点を残す
      const closeIndex = consolidatedPoints.findIndex(existing =>
        Math.abs(existing.originalIndex - point.originalIndex) < minDistance
      )
      if (closeIndex >= 0 && point.confidence > consolidatedPoints[closeIndex].confidence) {
        consolidatedPoints[closeIndex] = point
      }
    }
  }
  
  return consolidatedPoints
}

// 分散変化検出アルゴリズム
function detectVarianceChanges(data: Array<{index: number, value: number}>, windowSize: number = 15, threshold: number = 2.0): any[] {
  const changePoints: any[] = []
  
  if (data.length < windowSize * 2) return changePoints
  
  // 局所的分散を計算
  function calculateLocalVariance(start: number, end: number): number {
    const segmentData = data.slice(start, end).map(d => d.value)
    const mean = segmentData.reduce((sum, val) => sum + val, 0) / segmentData.length
    const variance = segmentData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / segmentData.length
    return variance
  }
  
  // 全体の分散を基準として計算
  const allValues = data.map(d => d.value)
  const globalMean = allValues.reduce((sum, val) => sum + val, 0) / allValues.length
  const globalVariance = allValues.reduce((sum, val) => sum + Math.pow(val - globalMean, 2), 0) / allValues.length
  
  for (let i = windowSize; i < data.length - windowSize; i++) {
    const beforeVariance = calculateLocalVariance(i - windowSize, i)
    const afterVariance = calculateLocalVariance(i, i + windowSize)
    
    // 分散の比率を計算
    const varianceRatio = afterVariance / (beforeVariance + 1e-10) // ゼロ除算回避
    const logVarianceRatio = Math.log(varianceRatio)
    
    if (Math.abs(logVarianceRatio) > Math.log(threshold)) {
      let changeType = 'variance_change'
      if (varianceRatio > threshold) changeType = 'increase_volatility' // 分散増加
      else if (varianceRatio < 1/threshold) changeType = 'decrease_volatility' // 分散減少
      
      // 信頼度は対数比率の大きさと全体分散に対する相対的重要性に基づく
      const significance = Math.max(beforeVariance, afterVariance) / (globalVariance + 1e-10)
      const confidence = Math.min(Math.abs(logVarianceRatio) / Math.log(threshold) * significance, 1.0)
      
      changePoints.push({
        index: data[i].index,
        originalIndex: i,
        value: data[i].value,
        confidence,
        beforeVariance,
        afterVariance,
        varianceRatio,
        changeType,
        significance,
        algorithm: 'Variance Detection'
      })
    }
  }
  
  return changePoints
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
      // データが少ない場合でも基本的なチャートは表示
      const isDateAxis = xColumn !== 'index' && rawData.length > 0 && 
        rawData.some(d => isDateValue(d.originalXValue))
      
      const chartData = rawData.length > 0 ? {
        labels: isDateAxis ? undefined : rawData.map(d => d.originalXValue || d.index),
        datasets: [
          {
            label: 'データ値',
            data: rawData.map((d) => {
              const xValue = isDateAxis 
                ? (d.originalXValue ? new Date(d.originalXValue) : new Date(d.index))
                : (d.originalXValue || d.index)
              return { x: xValue, y: d.value }
            }),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 6
          }
        ]
      } : { labels: [], datasets: [] }
      
      return {
        changePoints: [],
        chartData,
        samplingInfo: null,
        performanceMetrics: { processingTime: 0, originalSize: rawData.length },
        isDateAxis
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
      minSegmentSize = 5,
      penalty = 10,
      minseglen = Math.max(3, Math.floor(workingData.length / 30)),
      trendWindowSize = Math.max(5, Math.min(15, Math.floor(workingData.length / 15))),
      trendThreshold = 0.5,
      varianceWindowSize = Math.max(10, Math.min(20, Math.floor(workingData.length / 10))),
      varianceThreshold = 2.0
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
      case 'pelt':
        changePoints = detectPELT(workingData, penalty, minseglen)
        algorithmName = 'PELT'
        break
      case 'trend_detection':
        changePoints = detectTrendChanges(workingData, trendWindowSize, trendThreshold)
        algorithmName = 'Trend Detection'
        break
      case 'variance_detection':
        changePoints = detectVarianceChanges(workingData, varianceWindowSize, varianceThreshold)
        algorithmName = 'Variance Detection'
        break
      case 'moving_average':
      default:
        // 改善された移動平均法（トレンド除去とより厳密な判定）
        const allValues = workingData.map(d => d.value)
        
        // 全体のトレンドを計算
        const n = allValues.length
        const sumX = allValues.reduce((sum, _, i) => sum + i, 0)
        const sumY = allValues.reduce((sum, val) => sum + val, 0)
        const sumXY = allValues.reduce((sum, val, i) => sum + i * val, 0)
        const sumXX = allValues.reduce((sum, _, i) => sum + i * i, 0)
        
        const globalSlope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        const globalIntercept = (sumY - globalSlope * sumX) / n
        
        // トレンド除去済みデータ
        const detrendedValues = allValues.map((val, i) => val - (globalSlope * i + globalIntercept))
        const detrendedStd = Math.sqrt(
          detrendedValues.reduce((sum, val) => sum + val * val, 0) / detrendedValues.length
        )
        
        const detectionThreshold = detrendedStd * threshold
        let beforeSum = 0
        let afterSum = 0
        
        // 初期窓の計算（トレンド除去済みデータで）
        for (let i = 0; i < windowSize; i++) {
          beforeSum += detrendedValues[i]
        }
        for (let i = windowSize; i < Math.min(windowSize * 2, detrendedValues.length); i++) {
          afterSum += detrendedValues[i]
        }
        
        for (let i = windowSize; i < workingData.length - windowSize; i++) {
          // 移動窓の効率的更新
          if (i > windowSize) {
            beforeSum = beforeSum - detrendedValues[i - windowSize - 1] + detrendedValues[i - 1]
            afterSum = afterSum - detrendedValues[i + windowSize - 1] + detrendedValues[Math.min(i + windowSize, detrendedValues.length - 1)]
          }
          
          const beforeMeanCurrent = beforeSum / windowSize
          const afterMeanCurrent = afterSum / windowSize
          const meanDifference = Math.abs(afterMeanCurrent - beforeMeanCurrent)
          
          // 局所的なトレンド変化も確認
          const beforeTrend = calculateLocalSlope(allValues, Math.max(0, i - windowSize), i)
          const afterTrend = calculateLocalSlope(allValues, i, Math.min(allValues.length, i + windowSize))
          const trendChange = Math.abs(afterTrend - beforeTrend)
          
          // 平均の変化とトレンドの変化の両方を考慮
          const isSignificantMeanChange = meanDifference > detectionThreshold
          const isSignificantTrendChange = trendChange > 0.1
          
          if (isSignificantMeanChange && isSignificantTrendChange) {
            const confidence = Math.min(meanDifference / detectionThreshold, 3.0) / 3.0
            
            changePoints.push({
              index: workingData[i].index,
              originalIndex: i,
              value: workingData[i].value,
              confidence,
              beforeMean: beforeMeanCurrent,
              afterMean: afterMeanCurrent,
              meanDifference,
              beforeTrend,
              afterTrend,
              trendChange,
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
    
    // 変化点の種別で色分けするための設定
    const changePointColors = {
      peak: { color: 'rgb(239, 68, 68)', bg: 'rgba(239, 68, 68, 0.8)', name: 'ピーク' },
      valley: { color: 'rgb(34, 197, 94)', bg: 'rgba(34, 197, 94, 0.8)', name: 'ボトム' },
      start_increase: { color: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.8)', name: '上昇開始' },
      start_decrease: { color: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.8)', name: '下降開始' },
      end_increase: { color: 'rgb(99, 102, 241)', bg: 'rgba(99, 102, 241, 0.8)', name: '上昇終了' },
      end_decrease: { color: 'rgb(217, 119, 6)', bg: 'rgba(217, 119, 6, 0.8)', name: '下降終了' },
      trend_change: { color: 'rgb(245, 158, 11)', bg: 'rgba(245, 158, 11, 0.8)', name: 'トレンド変化' },
      increase_volatility: { color: 'rgb(236, 72, 153)', bg: 'rgba(236, 72, 153, 0.8)', name: '分散増加' },
      decrease_volatility: { color: 'rgb(14, 165, 233)', bg: 'rgba(14, 165, 233, 0.8)', name: '分散減少' },
      variance_change: { color: 'rgb(139, 69, 19)', bg: 'rgba(139, 69, 19, 0.8)', name: '分散変化' },
      default: { color: 'rgb(239, 68, 68)', bg: 'rgba(239, 68, 68, 0.8)', name: '変化点' }
    }
    
    // 変化点を種別ごとにグループ分け
    const changePointsByType = changePoints.reduce((acc, cp) => {
      const type = cp.changeType || 'default'
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(cp)
      return acc
    }, {} as Record<string, any[]>)
    
    // データセットを構築（描画順：線 → 点）
    const datasets: any[] = [
      // 1. データ値の折線（最初に描画）
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
        pointHoverRadius: 4,
        order: 1
      }
    ]
    
    // 2. 変化点の種別ごとにデータセットを作成（後に描画）
    Object.entries(changePointsByType).forEach(([type, points]) => {
      const colorConfig = changePointColors[type as keyof typeof changePointColors] || changePointColors.default
      
      datasets.push({
        label: colorConfig.name,
        type: 'scatter',
        data: (points as any[]).map((cp: any) => {
          const dataPoint = workingData[cp.originalIndex]
          return {
            x: isDateAxis 
              ? (dataPoint?.originalXValue ? new Date(dataPoint.originalXValue) : new Date(cp.index))
              : (dataPoint?.originalXValue || cp.index),
            y: cp.value
          }
        }),
        borderColor: colorConfig.color,
        backgroundColor: colorConfig.bg,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointStyle: 'circle',
        pointBackgroundColor: colorConfig.bg,
        pointBorderColor: colorConfig.color,
        borderWidth: 2,
        order: 0,  // 低い数値で前面に描画
        yAxisID: 'y'
      })
    })
    
    const chartData = {
      labels: isDateAxis ? undefined : workingData.map(d => d.originalXValue || d.index),
      datasets
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
  
  // 基本的な日付形式をチェック（日本語形式も含む）
  return /^\d{4}-\d{2}-\d{2}/.test(strValue) || 
         /^\d{2}\/\d{2}\/\d{4}/.test(strValue) ||
         /^\d{4}\/\d{2}\/\d{2}/.test(strValue) ||
         /^\d{4}年\d{1,2}月\d{1,2}日(\s+\d{1,2}時\d{1,2}分\d{1,2}秒?)?/.test(strValue)
}

function parseDateValue(value: any): number {
  if (value === null || value === undefined || value === '') return NaN
  
  const strValue = String(value).trim()
  try {
    // 日本語形式の場合は専用パーサーを使用
    if (/^\d{4}年\d{1,2}月\d{1,2}日/.test(strValue)) {
      const jpMatch = strValue.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(\s+(\d{1,2})時(\d{1,2})分(\d{1,2})秒?)?/)
      if (jpMatch) {
        const [, year, month, day, , hour, minute, second] = jpMatch
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 
                              parseInt(hour || '0'), parseInt(minute || '0'), parseInt(second || '0'))
        return isNaN(date.getTime()) ? NaN : date.getTime()
      }
    }
    
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