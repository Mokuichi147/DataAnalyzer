import { memoryDataStore } from './memoryDataStore'

export interface MutualInformationResult {
  pairwiseResults: MutualInformationPair[]
  summary: {
    totalPairs: number
    averageMI: number
    maxMI: number
    minMI: number
    stronglyCorrelatedPairs: MutualInformationPair[]
  }
  performanceMetrics: {
    processingTime: number
    samplesAnalyzed: number
    columnsAnalyzed: number
  }
}

export interface MutualInformationPair {
  column1: string
  column2: string
  mutualInformation: number
  normalizedMI: number
  jointEntropy: number
  entropy1: number
  entropy2: number
  conditionalEntropy12: number
  conditionalEntropy21: number
  interpretation: 'Strong' | 'Moderate' | 'Weak' | 'Independent'
}

export interface MutualInformationOptions {
  binCount?: number
  normalization?: 'arithmetic' | 'geometric' | 'max'
  threshold?: number
}

export async function analyzeMutualInformation(
  columns: any[],
  _filters: any[] = [],
  options: MutualInformationOptions = {}
): Promise<MutualInformationResult> {
  const startTime = performance.now()
  
  try {
    const store = memoryDataStore as any
    const tableMap = store.tables
    if (!tableMap || tableMap.size === 0) {
      throw new Error('No tables available for analysis')
    }
    
    const tableName = Array.from(tableMap.keys())[0]
    const data = memoryDataStore.query(`SELECT * FROM "${tableName}"`)
    
    if (!data || data.length === 0) {
      throw new Error('No data available for analysis')
    }

    const {
      binCount = 10,
      normalization = 'arithmetic',
      threshold = 0.1
    } = options

    const columnNames = columns.map(col => col.name)
    const filteredData = data

    // 数値・カテゴリカルデータの前処理
    const processedData = preprocessDataForMI(filteredData, columnNames, binCount)
    
    // ペアワイズ相互情報量計算
    const pairwiseResults: MutualInformationPair[] = []
    
    for (let i = 0; i < columnNames.length; i++) {
      for (let j = i + 1; j < columnNames.length; j++) {
        const col1 = columnNames[i]
        const col2 = columnNames[j]
        
        const result = calculateMutualInformation(
          processedData,
          col1,
          col2,
          normalization
        )
        
        pairwiseResults.push(result)
      }
    }

    // 統計サマリー計算
    const miValues = pairwiseResults.map(r => r.mutualInformation)
    const summary = {
      totalPairs: pairwiseResults.length,
      averageMI: miValues.reduce((a, b) => a + b, 0) / miValues.length,
      maxMI: Math.max(...miValues),
      minMI: Math.min(...miValues),
      stronglyCorrelatedPairs: pairwiseResults.filter(r => r.mutualInformation > threshold)
    }

    const endTime = performance.now()

    return {
      pairwiseResults: pairwiseResults.sort((a, b) => b.mutualInformation - a.mutualInformation),
      summary,
      performanceMetrics: {
        processingTime: endTime - startTime,
        samplesAnalyzed: filteredData.length,
        columnsAnalyzed: columnNames.length
      }
    }
  } catch (error) {
    console.error('Mutual information analysis failed:', error)
    throw error
  }
}

function preprocessDataForMI(
  data: Record<string, any>[],
  columnNames: string[],
  binCount: number
): Record<string, string[]> {
  const processedData: Record<string, string[]> = {}
  
  for (const columnName of columnNames) {
    const values = data.map(row => row[columnName]).filter(v => v !== null && v !== undefined)
    
    if (values.length === 0) {
      processedData[columnName] = []
      continue
    }
    
    // 数値データかどうかを判定
    const isNumeric = values.every(v => typeof v === 'number' || !isNaN(Number(v)))
    
    if (isNumeric) {
      // 数値データの場合：等頻度ビニングまたは等幅ビニング
      const numericValues = values.map(v => Number(v))
      processedData[columnName] = binNumericData(numericValues, binCount)
    } else {
      // カテゴリカルデータの場合：そのまま文字列として扱う
      processedData[columnName] = values.map(v => String(v))
    }
  }
  
  return processedData
}

function binNumericData(values: number[], binCount: number): string[] {
  if (values.length === 0) return []
  
  const sortedValues = [...values].sort((a, b) => a - b)
  const min = sortedValues[0]
  const max = sortedValues[sortedValues.length - 1]
  
  // 値が全て同じ場合
  if (min === max) {
    return values.map(() => `bin_0`)
  }
  
  // 等幅ビニング
  const binWidth = (max - min) / binCount
  const bins: string[] = []
  
  for (const value of values) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1)
    bins.push(`bin_${binIndex}`)
  }
  
  return bins
}

function calculateMutualInformation(
  data: Record<string, string[]>,
  col1: string,
  col2: string,
  normalization: 'arithmetic' | 'geometric' | 'max'
): MutualInformationPair {
  const values1 = data[col1]
  const values2 = data[col2]
  
  if (!values1 || !values2 || values1.length !== values2.length) {
    throw new Error(`Invalid data for columns ${col1} and ${col2}`)
  }
  
  
  // 各変数の確率分布
  const dist1 = calculateDistribution(values1)
  const dist2 = calculateDistribution(values2)
  
  // 同時確率分布
  const jointDist = calculateJointDistribution(values1, values2)
  
  // エントロピー計算
  const entropy1 = calculateEntropy(dist1)
  const entropy2 = calculateEntropy(dist2)
  const jointEntropy = calculateJointEntropy(jointDist)
  
  // 条件付きエントロピー
  const conditionalEntropy12 = jointEntropy - entropy1 // H(Y|X)
  const conditionalEntropy21 = jointEntropy - entropy2 // H(X|Y)
  
  // 相互情報量: I(X;Y) = H(X) + H(Y) - H(X,Y)
  const mutualInformation = entropy1 + entropy2 - jointEntropy
  
  // 正規化相互情報量
  let normalizedMI: number
  switch (normalization) {
    case 'arithmetic':
      normalizedMI = (2 * mutualInformation) / (entropy1 + entropy2)
      break
    case 'geometric':
      normalizedMI = mutualInformation / Math.sqrt(entropy1 * entropy2)
      break
    case 'max':
      normalizedMI = mutualInformation / Math.max(entropy1, entropy2)
      break
    default:
      normalizedMI = mutualInformation
  }
  
  // 解釈
  let interpretation: 'Strong' | 'Moderate' | 'Weak' | 'Independent'
  if (normalizedMI > 0.7) {
    interpretation = 'Strong'
  } else if (normalizedMI > 0.3) {
    interpretation = 'Moderate'
  } else if (normalizedMI > 0.1) {
    interpretation = 'Weak'
  } else {
    interpretation = 'Independent'
  }
  
  return {
    column1: col1,
    column2: col2,
    mutualInformation,
    normalizedMI,
    jointEntropy,
    entropy1,
    entropy2,
    conditionalEntropy12,
    conditionalEntropy21,
    interpretation
  }
}

function calculateDistribution(values: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  const total = values.length
  
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  
  const distribution = new Map<string, number>()
  for (const [value, count] of counts.entries()) {
    distribution.set(value, count / total)
  }
  
  return distribution
}

function calculateJointDistribution(values1: string[], values2: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  const total = values1.length
  
  for (let i = 0; i < values1.length; i++) {
    const key = `${values1[i]},${values2[i]}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  
  const distribution = new Map<string, number>()
  for (const [key, count] of counts.entries()) {
    distribution.set(key, count / total)
  }
  
  return distribution
}

function calculateEntropy(distribution: Map<string, number>): number {
  let entropy = 0
  
  for (const probability of distribution.values()) {
    if (probability > 0) {
      entropy -= probability * Math.log2(probability)
    }
  }
  
  return entropy
}

function calculateJointEntropy(jointDistribution: Map<string, number>): number {
  let entropy = 0
  
  for (const probability of jointDistribution.values()) {
    if (probability > 0) {
      entropy -= probability * Math.log2(probability)
    }
  }
  
  return entropy
}