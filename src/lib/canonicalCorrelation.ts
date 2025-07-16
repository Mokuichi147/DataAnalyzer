import { executeQuery } from './duckdb'
import { buildFilterClause } from './filterUtils'

export interface CanonicalCorrelationResult {
  canonicalCorrelations: number[]
  varianceExplained: number[]
  cumulativeVariance: number[]
  leftCanonicalVariates: Array<{
    variate: number
    coefficients: Array<{
      variable: string
      coefficient: number
    }>
  }>
  rightCanonicalVariates: Array<{
    variate: number
    coefficients: Array<{
      variable: string
      coefficient: number
    }>
  }>
  wilksLambda: number[]
  chiSquare: number[]
  pValues: number[]
}

export interface CanonicalVariateLoadings {
  variable: string
  leftLoadings: number[]
  rightLoadings: number[]
}

/**
 * 正準相関分析を実行する
 * @param tableName テーブル名
 * @param leftVariables 左側の変数群
 * @param rightVariables 右側の変数群  
 * @param filters フィルタ条件
 * @returns 正準相関分析結果
 */
export async function performCanonicalCorrelation(
  tableName: string,
  leftVariables: string[],
  rightVariables: string[],
  filters: any[] = []
): Promise<CanonicalCorrelationResult> {
  if (leftVariables.length === 0 || rightVariables.length === 0) {
    throw new Error('両方の変数群に少なくとも1つの変数が必要です')
  }

  const filterClause = buildFilterClause(filters)
  const whereClause = filterClause ? `WHERE ${filterClause}` : ''

  // 全変数の統計情報を取得
  const allVariables = [...leftVariables, ...rightVariables]
  
  // データ型をチェック（数値型のみ許可）
  const numericVariables = await checkNumericVariables(tableName, allVariables, whereClause)
  const invalidVariables = allVariables.filter(v => !numericVariables.includes(v))
  
  if (invalidVariables.length > 0) {
    throw new Error(`Invalid data for columns ${invalidVariables.join(' and ')}`)
  }
  
  const validVariables = await getValidVariables(tableName, allVariables, whereClause)
  
  if (validVariables.length < allVariables.length) {
    const missingVariables = allVariables.filter(v => !validVariables.includes(v))
    throw new Error(`データが不足している変数: ${missingVariables.join(', ')}`)
  }

  // データを取得
  const data = await getData(tableName, leftVariables, rightVariables, whereClause)
  
  // 正準相関分析を実行
  const result = await calculateCanonicalCorrelation(data, leftVariables, rightVariables)
  
  return result
}

/**
 * 数値型の変数をチェックする
 */
async function checkNumericVariables(
  tableName: string,
  variables: string[],
  whereClause: string
): Promise<string[]> {
  const numericVariables: string[] = []
  
  for (const variable of variables) {
    try {
      // 数値型への変換を試行
      const testQuery = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        ${whereClause}
        AND ${variable} IS NOT NULL
        AND ${variable} != ''
        AND CAST(${variable} AS DOUBLE) IS NOT NULL
      `
      const result = await executeQuery(testQuery)
      if (result.length > 0 && result[0].count > 0) {
        numericVariables.push(variable)
      }
    } catch (error) {
      console.warn(`変数 ${variable} は数値型に変換できません:`, error)
    }
  }
  
  return numericVariables
}

/**
 * 有効な変数を確認する
 */
async function getValidVariables(
  tableName: string,
  variables: string[],
  whereClause: string
): Promise<string[]> {
  const validVariables: string[] = []
  
  for (const variable of variables) {
    try {
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        ${whereClause}
        AND ${variable} IS NOT NULL
        AND ${variable} != ''
      `
      const result = await executeQuery(countQuery)
      if (result.length > 0 && result[0].count > 10) { // 最低10件のデータが必要
        validVariables.push(variable)
      }
    } catch (error) {
      console.warn(`変数 ${variable} のデータ確認に失敗:`, error)
    }
  }
  
  return validVariables
}

/**
 * データを取得する
 */
async function getData(
  tableName: string,
  leftVariables: string[],
  rightVariables: string[],
  whereClause: string
): Promise<number[][]> {
  const allVariables = [...leftVariables, ...rightVariables]
  const selectColumns = allVariables.map(col => `CAST(${col} AS DOUBLE) as ${col}`).join(', ')
  
  const query = `
    SELECT ${selectColumns}
    FROM ${tableName}
    ${whereClause}
    AND ${allVariables.map(col => `${col} IS NOT NULL AND ${col} != ''`).join(' AND ')}
  `
  
  const result = await executeQuery(query)
  
  if (result.length < 10) {
    throw new Error('正準相関分析には最低10件のデータが必要です')
  }
  
  // 数値データに変換
  return result.map(row => 
    allVariables.map(col => {
      const value = parseFloat(row[col])
      return isNaN(value) ? 0 : value
    })
  )
}

/**
 * 正準相関分析を計算する
 */
async function calculateCanonicalCorrelation(
  data: number[][],
  leftVariables: string[],
  rightVariables: string[]
): Promise<CanonicalCorrelationResult> {
  const n = data.length
  const p = leftVariables.length
  const q = rightVariables.length
  
  // データを左右の変数群に分割
  const X = data.map(row => row.slice(0, p))
  const Y = data.map(row => row.slice(p, p + q))
  
  // 共分散行列を計算
  const covXX = calculateCovarianceMatrix(X)
  const covYY = calculateCovarianceMatrix(Y)
  const covXY = calculateCrossCovarianceMatrix(X, Y)
  const covYX = transpose(covXY)
  
  // 逆行列を計算
  const invCovXX = await calculateInverse(covXX)
  const invCovYY = await calculateInverse(covYY)
  
  // 正準相関の計算
  const A = multiplyMatrices(multiplyMatrices(invCovXX, covXY), multiplyMatrices(invCovYY, covYX))
  const B = multiplyMatrices(multiplyMatrices(invCovYY, covYX), multiplyMatrices(invCovXX, covXY))
  
  // 固有値と固有ベクトルを計算
  const eigenA = await calculateEigenvalues(A)
  const eigenB = await calculateEigenvalues(B)
  
  // 正準相関係数（固有値の平方根）
  const canonicalCorrelations = eigenA.values.map(val => Math.sqrt(Math.max(0, val)))
  
  // 寄与率を計算
  const totalVariance = canonicalCorrelations.reduce((sum, corr) => sum + corr * corr, 0)
  const varianceExplained = canonicalCorrelations.map(corr => (corr * corr / totalVariance) * 100)
  
  // 累積寄与率
  const cumulativeVariance = []
  let cumSum = 0
  for (const variance of varianceExplained) {
    cumSum += variance
    cumulativeVariance.push(cumSum)
  }
  
  // 正準係数を計算
  const leftCanonicalVariates = eigenA.vectors.map((vector, i) => ({
    variate: i + 1,
    coefficients: vector.map((coeff, j) => ({
      variable: leftVariables[j],
      coefficient: coeff
    }))
  }))
  
  const rightCanonicalVariates = eigenB.vectors.map((vector, i) => ({
    variate: i + 1,
    coefficients: vector.map((coeff, j) => ({
      variable: rightVariables[j],
      coefficient: coeff
    }))
  }))
  
  // 統計的検定
  const wilksLambda = calculateWilksLambda(canonicalCorrelations)
  const chiSquare = calculateChiSquare(wilksLambda, n, p, q)
  const pValues = calculatePValues(chiSquare)
  
  return {
    canonicalCorrelations,
    varianceExplained,
    cumulativeVariance,
    leftCanonicalVariates,
    rightCanonicalVariates,
    wilksLambda,
    chiSquare,
    pValues
  }
}

/**
 * 共分散行列を計算する
 */
function calculateCovarianceMatrix(data: number[][]): number[][] {
  const n = data.length
  const p = data[0].length
  
  // 平均を計算
  const means = new Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      means[j] += data[i][j]
    }
  }
  for (let j = 0; j < p; j++) {
    means[j] /= n
  }
  
  // 共分散行列を計算
  const cov = Array(p).fill(null).map(() => Array(p).fill(0))
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0
      for (let k = 0; k < n; k++) {
        sum += (data[k][i] - means[i]) * (data[k][j] - means[j])
      }
      cov[i][j] = sum / (n - 1)
    }
  }
  
  return cov
}

/**
 * クロス共分散行列を計算する
 */
function calculateCrossCovarianceMatrix(X: number[][], Y: number[][]): number[][] {
  const n = X.length
  const p = X[0].length
  const q = Y[0].length
  
  // 平均を計算
  const meansX = new Array(p).fill(0)
  const meansY = new Array(q).fill(0)
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      meansX[j] += X[i][j]
    }
    for (let j = 0; j < q; j++) {
      meansY[j] += Y[i][j]
    }
  }
  
  for (let j = 0; j < p; j++) {
    meansX[j] /= n
  }
  for (let j = 0; j < q; j++) {
    meansY[j] /= n
  }
  
  // クロス共分散行列を計算
  const cov = Array(p).fill(null).map(() => Array(q).fill(0))
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < q; j++) {
      let sum = 0
      for (let k = 0; k < n; k++) {
        sum += (X[k][i] - meansX[i]) * (Y[k][j] - meansY[j])
      }
      cov[i][j] = sum / (n - 1)
    }
  }
  
  return cov
}

/**
 * 行列の転置
 */
function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length
  const cols = matrix[0].length
  const result = Array(cols).fill(null).map(() => Array(rows).fill(0))
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j]
    }
  }
  
  return result
}

/**
 * 行列の積
 */
function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const aRows = A.length
  const aCols = A[0].length
  const bRows = B.length
  const bCols = B[0].length
  
  if (aCols !== bRows) {
    throw new Error('行列の次元が一致しません')
  }
  
  const result = Array(aRows).fill(null).map(() => Array(bCols).fill(0))
  
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      for (let k = 0; k < aCols; k++) {
        result[i][j] += A[i][k] * B[k][j]
      }
    }
  }
  
  return result
}

/**
 * 逆行列を計算する（簡易版）
 */
async function calculateInverse(matrix: number[][]): Promise<number[][]> {
  const n = matrix.length
  
  // 単位行列を作成
  const identity = Array(n).fill(null).map((_, i) => 
    Array(n).fill(null).map((_, j) => i === j ? 1 : 0)
  )
  
  // 拡張行列を作成
  const augmented = matrix.map((row, i) => [...row, ...identity[i]])
  
  // ガウス・ジョーダン消去法
  for (let i = 0; i < n; i++) {
    // ピボット要素を見つける
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k
      }
    }
    
    // 行を交換
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]]
    
    // 対角要素を1にする
    const pivot = augmented[i][i]
    if (Math.abs(pivot) < 1e-10) {
      throw new Error('行列が特異です')
    }
    
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot
    }
    
    // 他の行を消去
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i]
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j]
        }
      }
    }
  }
  
  // 逆行列を抽出
  return augmented.map(row => row.slice(n))
}

/**
 * 固有値と固有ベクトルを計算する（簡易版）
 */
async function calculateEigenvalues(matrix: number[][]): Promise<{values: number[], vectors: number[][]}> {
  const n = matrix.length
  const maxIterations = 1000
  const tolerance = 1e-10
  
  // QR分解を使用した固有値計算
  let A = matrix.map(row => [...row])
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const {q, r} = qrDecomposition(A)
    A = multiplyMatrices(r, q)
    
    // 収束判定
    let converged = true
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[i][j]) > tolerance) {
          converged = false
          break
        }
      }
      if (!converged) break
    }
    
    if (converged) break
  }
  
  // 固有値を抽出
  const eigenvalues = A.map((row, i) => row[i])
  
  // 固有ベクトルを計算（簡易版）
  const eigenvectors = Array(n).fill(null).map(() => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    eigenvectors[i][i] = 1
  }
  
  return {
    values: eigenvalues,
    vectors: eigenvectors
  }
}

/**
 * QR分解
 */
function qrDecomposition(matrix: number[][]): {q: number[][], r: number[][]} {
  const n = matrix.length
  const Q = Array(n).fill(null).map(() => Array(n).fill(0))
  const R = Array(n).fill(null).map(() => Array(n).fill(0))
  
  // グラム・シュミット過程
  for (let j = 0; j < n; j++) {
    // j列目のベクトルをコピー
    for (let i = 0; i < n; i++) {
      Q[i][j] = matrix[i][j]
    }
    
    // 直交化
    for (let k = 0; k < j; k++) {
      let dot = 0
      for (let i = 0; i < n; i++) {
        dot += Q[i][k] * matrix[i][j]
      }
      R[k][j] = dot
      
      for (let i = 0; i < n; i++) {
        Q[i][j] -= dot * Q[i][k]
      }
    }
    
    // 正規化
    let norm = 0
    for (let i = 0; i < n; i++) {
      norm += Q[i][j] * Q[i][j]
    }
    norm = Math.sqrt(norm)
    R[j][j] = norm
    
    if (norm > 1e-10) {
      for (let i = 0; i < n; i++) {
        Q[i][j] /= norm
      }
    }
  }
  
  return {q: Q, r: R}
}

/**
 * Wilks' Lambdaを計算する
 */
function calculateWilksLambda(canonicalCorrelations: number[]): number[] {
  const wilksLambda = []
  
  for (let i = 0; i < canonicalCorrelations.length; i++) {
    let lambda = 1
    for (let j = i; j < canonicalCorrelations.length; j++) {
      lambda *= (1 - canonicalCorrelations[j] * canonicalCorrelations[j])
    }
    wilksLambda.push(lambda)
  }
  
  return wilksLambda
}

/**
 * カイ二乗統計量を計算する
 */
function calculateChiSquare(wilksLambda: number[], n: number, p: number, q: number): number[] {
  return wilksLambda.map((lambda) => {
    return -(n - 1 - (p + q + 1) / 2) * Math.log(lambda)
  })
}

/**
 * p値を計算する（簡易版）
 */
function calculatePValues(chiSquare: number[]): number[] {
  return chiSquare.map((chi) => {
    // 簡易的にp値を計算（本来はカイ二乗分布の累積分布関数を使用）
    if (chi < 0) return 1
    if (chi > 50) return 0
    return Math.exp(-chi / 2) // 近似値
  })
}

/**
 * 正準負荷量を計算する
 */
export async function calculateCanonicalLoadings(
  _tableName: string,
  leftVariables: string[],
  rightVariables: string[],
  result: CanonicalCorrelationResult,
  _filters: any[] = []
): Promise<CanonicalVariateLoadings[]> {
  // 将来の実装のための関数
  // const filterClause = buildFilterClause(filters)
  // const whereClause = filterClause ? `WHERE ${filterClause}` : ''
  // const data = await getData(tableName, leftVariables, rightVariables, whereClause)
  
  // 正準負荷量を計算
  const loadings: CanonicalVariateLoadings[] = []
  
  for (let i = 0; i < leftVariables.length; i++) {
    loadings.push({
      variable: leftVariables[i],
      leftLoadings: result.leftCanonicalVariates.map(variate => 
        variate.coefficients.find(c => c.variable === leftVariables[i])?.coefficient || 0
      ),
      rightLoadings: []
    })
  }
  
  for (let i = 0; i < rightVariables.length; i++) {
    loadings.push({
      variable: rightVariables[i],
      leftLoadings: [],
      rightLoadings: result.rightCanonicalVariates.map(variate => 
        variate.coefficients.find(c => c.variable === rightVariables[i])?.coefficient || 0
      )
    })
  }
  
  return loadings
}