/**
 * 大量データのパフォーマンス最適化のためのサンプリングユーティリティ
 */

export interface SamplingOptions {
  maxPoints?: number
  method?: 'uniform' | 'systematic' | 'stratified' | 'peak-preserving'
  preserveEdges?: boolean
}

export interface SampledData<T> {
  data: T[]
  originalSize: number
  sampledSize: number
  samplingRatio: number
  method: string
  isReduced: boolean
}

/**
 * 統一的なデータサンプリング関数
 */
export function sampleData<T>(
  data: T[], 
  options: SamplingOptions = {}
): SampledData<T> {
  const {
    maxPoints = 2000,
    method = 'uniform',
    preserveEdges = true
  } = options

  const originalSize = data.length
  
  // データが少ない場合はサンプリングしない
  if (originalSize <= maxPoints) {
    return {
      data,
      originalSize,
      sampledSize: originalSize,
      samplingRatio: 1.0,
      method: 'none',
      isReduced: false
    }
  }

  let sampledData: T[]
  let actualMethod = method

  switch (method) {
    case 'systematic':
      sampledData = systematicSampling(data, maxPoints, preserveEdges)
      break
    case 'stratified':
      sampledData = stratifiedSampling(data, maxPoints, preserveEdges)
      break
    case 'peak-preserving':
      sampledData = peakPreservingSampling(data, maxPoints, preserveEdges)
      break
    case 'uniform':
    default:
      sampledData = uniformSampling(data, maxPoints, preserveEdges)
      actualMethod = 'uniform'
      break
  }

  return {
    data: sampledData,
    originalSize,
    sampledSize: sampledData.length,
    samplingRatio: sampledData.length / originalSize,
    method: actualMethod,
    isReduced: true
  }
}

/**
 * 均等サンプリング（等間隔で抽出）
 */
function uniformSampling<T>(data: T[], maxPoints: number, preserveEdges: boolean): T[] {
  if (data.length <= maxPoints) return data

  const step = data.length / maxPoints
  const result: T[] = []
  
  if (preserveEdges) {
    result.push(data[0]) // 最初の点を保持
    
    for (let i = 1; i < maxPoints - 1; i++) {
      const index = Math.round(i * step)
      if (index < data.length) {
        result.push(data[index])
      }
    }
    
    result.push(data[data.length - 1]) // 最後の点を保持
  } else {
    for (let i = 0; i < maxPoints; i++) {
      const index = Math.round(i * step)
      if (index < data.length) {
        result.push(data[index])
      }
    }
  }

  return result
}

/**
 * 系統サンプリング（開始点をランダムに決定）
 */
function systematicSampling<T>(data: T[], maxPoints: number, preserveEdges: boolean): T[] {
  if (data.length <= maxPoints) return data

  const step = Math.floor(data.length / maxPoints)
  const start = Math.floor(Math.random() * step)
  const result: T[] = []

  if (preserveEdges) {
    result.push(data[0])
    
    for (let i = start + step; i < data.length - step; i += step) {
      result.push(data[i])
    }
    
    if (data.length > 1) {
      result.push(data[data.length - 1])
    }
  } else {
    for (let i = start; i < data.length; i += step) {
      result.push(data[i])
      if (result.length >= maxPoints) break
    }
  }

  return result
}

/**
 * 層化サンプリング（データを層に分けて各層から抽出）
 */
function stratifiedSampling<T>(data: T[], maxPoints: number, preserveEdges: boolean): T[] {
  if (data.length <= maxPoints) return data

  const stratumSize = Math.ceil(data.length / maxPoints)
  const result: T[] = []

  if (preserveEdges) {
    result.push(data[0])
    
    const availablePoints = maxPoints - 2
    const adjustedStratumSize = Math.ceil((data.length - 2) / availablePoints)
    
    for (let i = 1; i < data.length - 1; i += adjustedStratumSize) {
      const stratumEnd = Math.min(i + adjustedStratumSize, data.length - 1)
      const stratumMid = Math.floor((i + stratumEnd) / 2)
      result.push(data[stratumMid])
      
      if (result.length >= maxPoints - 1) break
    }
    
    result.push(data[data.length - 1])
  } else {
    for (let i = 0; i < data.length; i += stratumSize) {
      const stratumEnd = Math.min(i + stratumSize, data.length)
      const stratumMid = Math.floor((i + stratumEnd) / 2)
      result.push(data[stratumMid])
      
      if (result.length >= maxPoints) break
    }
  }

  return result
}

/**
 * ピーク保持サンプリング（変化点や極値を優先して保持）
 */
function peakPreservingSampling<T>(data: T[], maxPoints: number, preserveEdges: boolean): T[] {
  if (data.length <= maxPoints) return data

  // 数値データの場合のみピーク検出を行う
  if (typeof data[0] === 'object' && data[0] !== null) {
    // オブジェクトの場合は均等サンプリングにフォールバック
    return uniformSampling(data, maxPoints, preserveEdges)
  }

  const numericData = data as unknown as number[]
  const peaks: number[] = []
  const valleys: number[] = []

  // ピークと谷を検出
  for (let i = 1; i < numericData.length - 1; i++) {
    const prev = numericData[i - 1]
    const curr = numericData[i]
    const next = numericData[i + 1]

    if (curr > prev && curr > next) {
      peaks.push(i) // ピーク
    } else if (curr < prev && curr < next) {
      valleys.push(i) // 谷
    }
  }

  // 重要な点のインデックスを収集
  const importantIndices = new Set<number>()
  
  if (preserveEdges) {
    importantIndices.add(0)
    importantIndices.add(data.length - 1)
  }

  // ピークと谷を追加
  [...peaks, ...valleys].forEach(index => importantIndices.add(index))

  // 重要な点が足りない場合は均等サンプリングで補完
  const remaining = maxPoints - importantIndices.size
  if (remaining > 0) {
    const step = data.length / remaining
    for (let i = 0; i < remaining; i++) {
      const index = Math.round(i * step)
      if (index < data.length) {
        importantIndices.add(index)
      }
    }
  }

  // インデックスをソートして結果を構築
  const sortedIndices = Array.from(importantIndices).sort((a, b) => a - b)
  
  // maxPointsを超えた場合は重要度で絞り込み
  if (sortedIndices.length > maxPoints) {
    const selected = new Set<number>()
    
    if (preserveEdges) {
      selected.add(0)
      selected.add(data.length - 1)
    }
    
    // ピークを優先
    peaks.forEach(index => {
      if (selected.size < maxPoints) {
        selected.add(index)
      }
    })
    
    // 谷を追加
    valleys.forEach(index => {
      if (selected.size < maxPoints) {
        selected.add(index)
      }
    })
    
    return Array.from(selected).sort((a, b) => a - b).map(i => data[i])
  }

  return sortedIndices.map(i => data[i])
}

/**
 * チャート用のデータサンプリング（Chart.js最適化）
 */
export function sampleForChart(
  data: Array<{x: any, y: any}>, 
  maxPoints: number = 1000
): SampledData<{x: any, y: any}> {
  return sampleData(data, {
    maxPoints,
    method: 'peak-preserving',
    preserveEdges: true
  })
}

/**
 * 時系列データ用のサンプリング
 */
export function sampleTimeSeries<T extends {timestamp?: string, value?: number}>(
  data: T[], 
  maxPoints: number = 1500
): SampledData<T> {
  return sampleData(data, {
    maxPoints,
    method: 'uniform',
    preserveEdges: true
  })
}

/**
 * 変化点検出用のサンプリング（重要な変化点を保持）
 */
export function sampleForChangePoint<T extends {value?: number}>(
  data: T[], 
  maxPoints: number = 2000
): SampledData<T> {
  return sampleData(data, {
    maxPoints,
    method: 'peak-preserving',
    preserveEdges: true
  })
}

/**
 * データサイズに基づいて推奨サンプリング設定を取得
 */
export function getRecommendedSamplingConfig(dataSize: number): SamplingOptions {
  if (dataSize <= 1000) {
    return { maxPoints: dataSize, method: 'uniform' }
  } else if (dataSize <= 5000) {
    return { maxPoints: 1000, method: 'uniform' }
  } else if (dataSize <= 20000) {
    return { maxPoints: 1500, method: 'systematic' }
  } else {
    return { maxPoints: 2000, method: 'peak-preserving' }
  }
}