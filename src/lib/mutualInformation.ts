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
  options: MutualInformationOptions = {},
  tableName?: string
): Promise<MutualInformationResult> {
  const startTime = performance.now()
  
  try {
    console.log('🔍 Starting mutual information analysis with columns:', columns)
    console.log('🗄️ Target table name:', tableName)
    
    if (!columns || columns.length < 2) {
      throw new Error('At least 2 columns are required for mutual information analysis')
    }
    
    const store = memoryDataStore as any
    const tableMap = store.tables
    if (!tableMap || tableMap.size === 0) {
      throw new Error('No tables available for analysis')
    }
    
    // テーブル名が指定されている場合はそれを使用、そうでなければ最初のテーブルを使用
    let selectedTableName: string
    if (tableName && tableMap.has(tableName)) {
      selectedTableName = tableName
    } else {
      const firstTableName = Array.from(tableMap.keys())[0]
      selectedTableName = firstTableName as string
      console.warn(`⚠️ Table "${tableName}" not found, using "${selectedTableName}" instead`)
    }
    
    console.log('🗄️ Querying data from table:', selectedTableName)
    console.log('🗄️ Available tables:', Array.from(tableMap.keys()))
    
    const data = memoryDataStore.query(`SELECT * FROM "${selectedTableName}"`)
    
    console.log('📊 Raw data from memoryDataStore:', {
      dataExists: !!data,
      dataLength: data?.length || 0,
      sampleRow: data?.[0] || null,
      tableKeys: Array.from(tableMap.keys())
    })
    
    if (!data || data.length === 0) {
      throw new Error('No data available for analysis')
    }
    
    // データに存在するカラム名をチェック
    const availableColumns = data.length > 0 ? Object.keys(data[0]) : []
    console.log('📊 Available columns in data:', availableColumns)
    
    const requestedColumns = columns.map(col => col.name)
    console.log('📊 Requested columns:', requestedColumns)
    
    const missingColumns = requestedColumns.filter(col => !availableColumns.includes(col))
    if (missingColumns.length > 0) {
      throw new Error(`Columns not found in data: ${missingColumns.join(', ')}. Available columns: ${availableColumns.join(', ')}`)
    }

    const {
      binCount = 10,
      normalization = 'arithmetic',
      threshold = 0.1
    } = options

    const columnNames = columns.map(col => col.name)
    const filteredData = data

    // 数値・カテゴリカルデータの前処理をスキップして、ペアワイズ処理のみ使用
    console.log('📊 Skipping global preprocessing, using pairwise approach for robustness')
    console.log('📊 Available columns:', columnNames)
    console.log('📊 Sample data:', filteredData.slice(0, 3))
    console.log('📊 Data structure check:', {
      isArray: Array.isArray(filteredData),
      length: filteredData.length,
      firstRowKeys: filteredData.length > 0 ? Object.keys(filteredData[0]) : [],
      firstRowValues: filteredData.length > 0 ? Object.values(filteredData[0]) : []
    })
    
    // ペアワイズ相互情報量計算（各ペアごとに有効データを使用）
    const pairwiseResults: MutualInformationPair[] = []
    
    console.log('🔍 Starting pairwise analysis:')
    console.log(`  - Total columns: ${columnNames.length}`)
    console.log(`  - Total data rows: ${data.length}`)
    console.log(`  - Available data sample:`, data.slice(0, 2))
    
    // 各列の有効データ数を事前にチェック
    console.log('📊 Column data quality check:')
    for (const col of columnNames) {
      const validCount = data.filter(row => {
        const val = row[col]
        return val !== null && val !== undefined && val !== ''
      }).length
      console.log(`  - ${col}: ${validCount}/${data.length} valid rows (${((validCount/data.length)*100).toFixed(1)}%)`)
      
      // サンプルデータを表示
      const sampleValues = data.slice(0, 5).map(row => row[col])
      console.log(`    Sample values:`, sampleValues)
    }
    
    let pairCount = 0
    for (let i = 0; i < columnNames.length; i++) {
      for (let j = i + 1; j < columnNames.length; j++) {
        const col1 = columnNames[i]
        const col2 = columnNames[j]
        pairCount++
        
        try {
          console.log(`📈 [${pairCount}] Calculating MI for ${col1} vs ${col2}`)
          
          // このペアに対してのみ有効なデータを抽出
          const pairValidRows = data.filter(row => {
            const val1 = row[col1]
            const val2 = row[col2]
            const isValid1 = val1 !== null && val1 !== undefined && val1 !== ''
            const isValid2 = val2 !== null && val2 !== undefined && val2 !== ''
            return isValid1 && isValid2
          })
          
          console.log(`  - Pair ${col1} vs ${col2}: ${pairValidRows.length} valid rows out of ${data.length} total`)
          
          // 最初の3ペアは詳細に分析
          if (pairCount <= 3) {
            console.log(`  - Detailed analysis for pair ${pairCount}:`)
            console.log(`    - ${col1} values in first 10 rows:`, data.slice(0, 10).map(row => row[col1]))
            console.log(`    - ${col2} values in first 10 rows:`, data.slice(0, 10).map(row => row[col2]))
            console.log(`    - ${col1} null/undefined/empty count:`, data.filter(row => row[col1] === null || row[col1] === undefined || row[col1] === '').length)
            console.log(`    - ${col2} null/undefined/empty count:`, data.filter(row => row[col2] === null || row[col2] === undefined || row[col2] === '').length)
          }
          
          console.log(`  - Sample valid data for this pair:`, pairValidRows.slice(0, 3).map(row => ({ [col1]: row[col1], [col2]: row[col2] })))
          
          if (pairValidRows.length < 3) {
            console.warn(`  - Skipping pair ${col1} vs ${col2}: insufficient data (${pairValidRows.length} rows, need at least 3)`)
            continue
          }
          
          if (pairValidRows.length < 10) {
            console.warn(`  - Warning: pair ${col1} vs ${col2} has only ${pairValidRows.length} rows (recommended: at least 10), but proceeding with analysis`)
          }
          
          // このペア用の処理済みデータを作成
          const pairProcessedData = preprocessPairData(pairValidRows, [col1, col2], binCount)
          
          const result = calculateMutualInformation(
            pairProcessedData,
            col1,
            col2,
            normalization
          )
          
          pairwiseResults.push(result)
        } catch (error) {
          console.error(`❌ Failed to calculate MI for ${col1} vs ${col2}:`, error)
          console.warn(`  - Skipping this pair due to error`)
          // ペアの計算に失敗しても続行
        }
      }
    }
    
    if (pairwiseResults.length === 0) {
      const totalPairs = (columnNames.length * (columnNames.length - 1)) / 2
      console.error(`❌ No valid column pairs found out of ${totalPairs} possible pairs`)
      console.error('📊 Debug info:', {
        totalColumns: columnNames.length,
        totalDataRows: data.length,
        columnNames: columnNames,
        sampleData: data.slice(0, 3)
      })
      
      throw new Error(`No valid column pairs found for mutual information analysis. Analyzed ${totalPairs} pairs but none had sufficient data (need at least 3 rows with complete data per pair). Check data quality and try selecting different columns.`)
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
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      columns: columns,
      options: options
    })
    throw error
  }
}

// preprocessDataForMI関数は削除 - ペアワイズ処理を使用

/**
 * ペア用のデータ前処理（より柔軟）
 */
function preprocessPairData(
  data: Record<string, any>[],
  columnNames: string[],
  binCount: number
): Record<string, string[]> {
  const processedData: Record<string, string[]> = {}
  
  for (const columnName of columnNames) {
    const values = data.map(row => row[columnName])
    
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
  console.log(`🚀 calculateMutualInformation called with:`)
  console.log(`  - col1: "${col1}"`)
  console.log(`  - col2: "${col2}"`)
  console.log(`  - data object keys:`, Object.keys(data))
  console.log(`  - data object structure:`, Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? `array[${v.length}]` : typeof v}`))
  
  const values1 = data[col1]
  const values2 = data[col2]
  
  console.log(`🔍 MI calculation for ${col1} vs ${col2}:`)
  console.log(`  - ${col1} exists: ${!!values1}`)
  console.log(`  - ${col2} exists: ${!!values2}`)
  console.log(`  - ${col1} length: ${values1?.length || 'undefined'}`)
  console.log(`  - ${col2} length: ${values2?.length || 'undefined'}`)
  console.log(`  - ${col1} sample:`, values1?.slice(0, 5))
  console.log(`  - ${col2} sample:`, values2?.slice(0, 5))
  console.log(`  - Available data keys:`, Object.keys(data))
  
  if (!values1) {
    throw new Error(`Missing data array for column ${col1}`)
  }
  
  if (!values2) {
    throw new Error(`Missing data array for column ${col2}`)
  }
  
  if (values1.length === 0) {
    throw new Error(`Empty data array for column ${col1}`)
  }
  
  if (values2.length === 0) {
    throw new Error(`Empty data array for column ${col2}`)
  }
  
  if (values1.length !== values2.length) {
    throw new Error(`Data length mismatch: ${col1}(${values1.length}) vs ${col2}(${values2.length})`)
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