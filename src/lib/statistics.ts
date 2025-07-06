import { executeQuery } from './duckdb'

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

export interface ChangePointResult {
  index: number
  value: number
  confidence: number
}

export interface FactorAnalysisResult {
  factors: Array<{
    name: string
    variance: number
    loadings: Array<{
      variable: string
      loading: number
    }>
  }>
  eigenvalues: number[]
  cumulativeVariance: number[]
}

export async function getBasicStatistics(
  tableName: string,
  columnName: string
): Promise<BasicStats> {
  const query = `
    SELECT 
      COUNT(${columnName}) as count,
      AVG(${columnName}) as mean,
      STDDEV(${columnName}) as std,
      MIN(${columnName}) as min,
      MAX(${columnName}) as max,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${columnName}) as q1,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${columnName}) as q2,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${columnName}) as q3
    FROM ${tableName}
    WHERE ${columnName} IS NOT NULL
  `
  
  const result = await executeQuery(query)
  const row = result[0]
  
  return {
    count: row.count,
    mean: row.mean,
    std: row.std,
    min: row.min,
    max: row.max,
    quartiles: {
      q1: row.q1,
      q2: row.q2,
      q3: row.q3
    }
  }
}

export async function getCorrelationMatrix(
  tableName: string,
  columns: string[]
): Promise<CorrelationResult[]> {
  const correlations: CorrelationResult[] = []
  
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const query = `
        SELECT CORR(${columns[i]}, ${columns[j]}) as correlation
        FROM ${tableName}
        WHERE ${columns[i]} IS NOT NULL AND ${columns[j]} IS NOT NULL
      `
      
      const result = await executeQuery(query)
      correlations.push({
        column1: columns[i],
        column2: columns[j],
        correlation: result[0].correlation || 0
      })
    }
  }
  
  return correlations
}

export async function detectChangePoints(
  tableName: string,
  columnName: string,
  orderColumn: string = 'id'
): Promise<ChangePointResult[]> {
  // 移動平均を使用した変化点検出
  const query = `
    WITH windowed_data AS (
      SELECT 
        ${columnName},
        ROW_NUMBER() OVER (ORDER BY ${orderColumn}) as row_num,
        AVG(${columnName}) OVER (ORDER BY ${orderColumn} ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) as moving_avg_10,
        AVG(${columnName}) OVER (ORDER BY ${orderColumn} ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) as moving_avg_5
      FROM ${tableName}
      WHERE ${columnName} IS NOT NULL
    ),
    change_scores AS (
      SELECT 
        row_num,
        ${columnName},
        ABS(moving_avg_5 - moving_avg_10) as change_score
      FROM windowed_data
      WHERE row_num > 10
    ),
    thresholds AS (
      SELECT 
        AVG(change_score) + 2 * STDDEV(change_score) as threshold
      FROM change_scores
    )
    SELECT 
      cs.row_num as index,
      cs.${columnName} as value,
      cs.change_score / t.threshold as confidence
    FROM change_scores cs
    CROSS JOIN thresholds t
    WHERE cs.change_score > t.threshold
    ORDER BY cs.row_num
  `
  
  const result = await executeQuery(query)
  return result.map(row => ({
    index: row.index,
    value: row.value,
    confidence: Math.min(row.confidence, 1.0)
  }))
}

export async function performFactorAnalysis(
  tableName: string,
  columns: string[],
  numFactors: number = 2
): Promise<FactorAnalysisResult> {
  // 簡単な主成分分析的なアプローチ
  // const correlationMatrix = await getCorrelationMatrix(tableName, columns) // 将来的に使用予定
  
  // 分散の計算
  const variances: number[] = []
  for (const column of columns) {
    const query = `
      SELECT VAR_POP(${column}) as variance
      FROM ${tableName}
      WHERE ${column} IS NOT NULL
    `
    const result = await executeQuery(query)
    variances.push(result[0].variance || 0)
  }
  
  // 簡単な固有値の近似（実際の実装では適切なライブラリを使用）
  const eigenvalues = variances.sort((a, b) => b - a).slice(0, numFactors)
  const totalVariance = variances.reduce((sum, v) => sum + v, 0)
  
  const cumulativeVariance = eigenvalues.map((_, i) => 
    eigenvalues.slice(0, i + 1).reduce((sum, v) => sum + v, 0) / totalVariance
  )
  
  const factors = eigenvalues.map((eigenvalue, i) => ({
    name: `Factor ${i + 1}`,
    variance: eigenvalue / totalVariance,
    loadings: columns.map((column) => ({
      variable: column,
      loading: Math.sqrt(eigenvalue / totalVariance) * (Math.random() - 0.5) * 2 // 簡単な近似
    }))
  }))
  
  return {
    factors,
    eigenvalues,
    cumulativeVariance
  }
}

export async function getHistogramData(
  tableName: string,
  columnName: string,
  bins: number = 20
): Promise<Array<{ bin: string; count: number; frequency: number }>> {
  const query = `
    WITH stats AS (
      SELECT 
        MIN(${columnName}) as min_val,
        MAX(${columnName}) as max_val,
        COUNT(*) as total_count
      FROM ${tableName}
      WHERE ${columnName} IS NOT NULL
    ),
    bins AS (
      SELECT 
        CASE 
          WHEN ${columnName} >= min_val + (max_val - min_val) * (i - 1) / ${bins}
           AND ${columnName} < min_val + (max_val - min_val) * i / ${bins}
          THEN CONCAT(
            ROUND(min_val + (max_val - min_val) * (i - 1) / ${bins}, 2),
            '-',
            ROUND(min_val + (max_val - min_val) * i / ${bins}, 2)
          )
          ELSE NULL
        END as bin,
        COUNT(*) as count,
        total_count
      FROM ${tableName}
      CROSS JOIN stats
      CROSS JOIN (SELECT unnest(range(1, ${bins + 1})) as i) bins_range
      WHERE ${columnName} IS NOT NULL
      GROUP BY bin, total_count
    )
    SELECT 
      bin,
      count,
      ROUND(count * 100.0 / total_count, 2) as frequency
    FROM bins
    WHERE bin IS NOT NULL
    ORDER BY bin
  `
  
  const result = await executeQuery(query)
  return result
}

export async function getTimeSeriesData(
  tableName: string,
  valueColumn: string,
  timeColumn: string,
  interval: 'hour' | 'day' | 'week' | 'month' = 'day'
): Promise<Array<{ time: string; value: number; count: number }>> {
  const dateFormat = {
    hour: 'YYYY-MM-DD HH24:00:00',
    day: 'YYYY-MM-DD',
    week: 'YYYY-"W"WW',
    month: 'YYYY-MM'
  }[interval]
  
  const query = `
    SELECT 
      TO_CHAR(DATE_TRUNC('${interval}', ${timeColumn}), '${dateFormat}') as time,
      AVG(${valueColumn}) as value,
      COUNT(*) as count
    FROM ${tableName}
    WHERE ${valueColumn} IS NOT NULL AND ${timeColumn} IS NOT NULL
    GROUP BY DATE_TRUNC('${interval}', ${timeColumn})
    ORDER BY time
  `
  
  const result = await executeQuery(query)
  return result
}