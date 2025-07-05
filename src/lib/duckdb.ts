import * as duckdb from '@duckdb/duckdb-wasm'
import { memoryDataStore, type Column } from './memoryDataStore'

export interface DuckDBInstance {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
}

let duckdbInstance: DuckDBInstance | null = null
let useFallback = false

// フォールバック状況を外部から参照可能にする
export function isUsingFallback(): boolean {
  return useFallback
}

// 使用中のストレージタイプを取得
export function getStorageType(): 'duckdb' | 'memory' {
  return useFallback ? 'memory' : 'duckdb'
}

// 環境の安全性を判定する関数
function isEnvironmentSecure(): boolean {
  try {
    // Web Workerのサポートをチェック
    if (typeof Worker === 'undefined') {
      console.log('💡 Web Workers非サポート環境: メモリ内データストアを使用')
      return false
    }
    
    // ローカルファイルアクセスの場合（file://）
    if (window.location.protocol === 'file:') {
      console.log('💡 ローカルファイル環境: メモリ内データストアを使用')
      return false
    }
    
    // HTTPSでない場合（開発環境以外）
    if (window.location.protocol === 'http:' && 
        !window.location.hostname.includes('localhost') && 
        !window.location.hostname.includes('127.0.0.1') &&
        !window.location.hostname.includes('192.168.') &&
        !window.location.hostname.includes('10.0.') &&
        !window.location.hostname.includes('172.')) {
      console.log('💡 HTTP本番環境: メモリ内データストアを使用')
      return false
    }
    
    // 簡単なWorker作成テスト
    try {
      const testWorker = new Worker('data:application/javascript,self.close();')
      testWorker.terminate()
    } catch (testError) {
      console.log('💡 Worker作成テスト失敗: メモリ内データストアを使用')
      return false
    }
    
    return true
  } catch (error) {
    console.log('💡 環境判定エラー: メモリ内データストアを使用')
    return false
  }
}

export async function initDuckDB(): Promise<DuckDBInstance | null> {
  // 環境の安全性を事前チェック
  if (!isEnvironmentSecure()) {
    useFallback = true
    console.log('✅ 互換性モード: メモリ内データストアで動作中（機能に制限はありません）')
    return null
  }

  if (useFallback) {
    console.log('メモリ内データストアを使用中')
    return null
  }

  if (duckdbInstance) {
    return duckdbInstance
  }

  try {
    // DuckDBの初期化を試行（SecurityErrorを適切に処理）
    const logger = new duckdb.VoidLogger()
    
    try {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
      
      // 標準的なWorker作成を試行
      const worker = new Worker(bundle.mainWorker!)
      const db = new duckdb.AsyncDuckDB(logger, worker)
      
      // DuckDBインスタンスを初期化
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
      
      const conn = await db.connect()
      duckdbInstance = { db, conn }
      console.log('DuckDB初期化成功')
      return duckdbInstance
    } catch (workerError) {
      // SecurityErrorの場合は即座にフォールバック
      if (workerError instanceof Error && 
          (workerError.name === 'SecurityError' || 
           workerError.message.includes('insecure') ||
           workerError.message.includes('SecurityError'))) {
        console.warn('セキュリティエラーによりDuckDB初期化失敗、メモリ内データストアにフォールバック:', workerError.message)
        throw workerError
      }
      
      // その他のエラーの場合はpthreadWorker無しで再試行
      console.warn('pthread使用での初期化に失敗、代替方法を試行:', workerError)
      
      try {
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
        
        const worker = new Worker(bundle.mainWorker!)
        const db = new duckdb.AsyncDuckDB(logger, worker)
        
        // pthreadWorker無しで初期化
        await db.instantiate(bundle.mainModule)
        
        const conn = await db.connect()
        duckdbInstance = { db, conn }
        console.log('DuckDB初期化成功（pthread無し）')
        return duckdbInstance
      } catch (fallbackError) {
        console.warn('代替初期化も失敗:', fallbackError)
        throw fallbackError
      }
    }
  } catch (error) {
    console.log('DuckDBを使用できません。メモリ内データストアで動作します。')
    if (error instanceof Error && error.message.includes('SecurityError')) {
      console.log('📝 これは通常の動作です。セキュリティ制限によりDuckDBが無効化されました。')
    }
    useFallback = true
    return null
  }
}

export async function executeQuery(sql: string, params?: any[]): Promise<any[]> {
  const instance = await initDuckDB()
  
  if (useFallback || !instance) {
    // メモリ内データストアを使用
    return memoryDataStore.query(sql)
  }
  
  const result = await instance.conn.query(sql, params)
  return result.toArray()
}

export async function createTableFromFile(
  file: File,
  tableName: string = 'data'
): Promise<void> {
  await initDuckDB() // フォールバック判定のため
  
  try {
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    
    switch (fileExtension) {
      case 'csv':
        return await createTableFromCSV(file, tableName)
      case 'tsv':
        return await createTableFromCSV(file, tableName, '\t')
      case 'json':
        return await createTableFromJSON(file, tableName)
      case 'sqlite':
      case 'sqlite3':
      case 'db':
        throw new Error('SQLiteファイルの読み込みはサポートされていません。CSVまたはParquet形式でエクスポートしてください。')
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`)
    }
    
  } catch (error) {
    console.error('ファイル読み込みエラー:', error)
    throw new Error(`ファイル読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function createTableFromCSV(file: File, tableName: string, delimiter: string = ','): Promise<void> {
  const instance = await initDuckDB()
  
  try {
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    if (lines.length === 0) {
      throw new Error('CSVファイルが空です')
    }
    
    // より堅牢なCSVパーシング
    function parseCSVLine(line: string, delimiter: string): string[] {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++ // Skip next quote
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }
    
    // ヘッダー行を解析
    const headers = parseCSVLine(lines[0], delimiter).map(h => h || `column_${Math.random().toString(36).substr(2, 9)}`)
    
    if (headers.length === 0) {
      throw new Error('CSVファイルのヘッダーを読み取れません')
    }
    
    // データ行を解析
    const dataRows: Record<string, string | null>[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter)
      const row: Record<string, string | null> = {}
      
      headers.forEach((header, index) => {
        row[header] = values[index] || null
      })
      
      dataRows.push(row)
    }
    
    if (dataRows.length === 0) {
      throw new Error('CSVファイルにデータがありません')
    }
    
    // テーブルを作成（カラム名をサニタイズ）
    const sanitizedHeaders = headers.map(h => h.replace(/[^a-zA-Z0-9_]/g, '_'))
    
    if (useFallback || !instance) {
      // メモリ内データストアを使用
      const columns: Column[] = sanitizedHeaders.map(name => ({
        name,
        type: 'TEXT',
        nullable: true
      }))
      
      memoryDataStore.createTable(tableName, columns)
      
      // データを挿入
      const processedRows = dataRows.map(row => {
        const processedRow: Record<string, any> = {}
        sanitizedHeaders.forEach((sanitizedHeader, index) => {
          processedRow[sanitizedHeader] = row[headers[index]]
        })
        return processedRow
      })
      
      memoryDataStore.insertRows(tableName, processedRows)
    } else {
      // DuckDBを使用
      const columnDefinitions = sanitizedHeaders.map(header => `"${header}" TEXT`).join(', ')
      await instance.conn.query(`CREATE TABLE ${tableName} (${columnDefinitions})`)
      
      // データを挿入（バッチ処理で高速化）
      const placeholders = sanitizedHeaders.map(() => '?').join(', ')
      const insertSQL = `INSERT INTO ${tableName} (${sanitizedHeaders.map(h => `"${h}"`).join(', ')}) VALUES (${placeholders})`
      
      // データを小さなバッチに分けて挿入
      const batchSize = 1000
      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize)
        
        for (const row of batch) {
          const values = sanitizedHeaders.map((_, index) => row[headers[index]])
          await instance.conn.query(insertSQL, values)
        }
      }
    }
    
    console.log(`CSVファイル読み込み完了: ${dataRows.length}行、${headers.length}列`)
    
  } catch (error) {
    console.error('CSV読み込みエラー:', error)
    throw new Error(`CSVファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function createTableFromJSON(file: File, tableName: string): Promise<void> {
  const instance = await initDuckDB()
  
  try {
    const text = await file.text()
    let jsonData: any[]
    
    try {
      const parsed = JSON.parse(text)
      jsonData = Array.isArray(parsed) ? parsed : [parsed]
    } catch (error) {
      throw new Error('JSONファイルの解析に失敗しました。有効なJSON形式ではありません。')
    }
    
    if (jsonData.length === 0) {
      throw new Error('JSONファイルにデータがありません')
    }
    
    // 全てのキーを収集してカラムを決定
    const allKeys = new Set<string>()
    jsonData.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach(key => allKeys.add(key))
      }
    })
    
    const columns = Array.from(allKeys)
    
    if (columns.length === 0) {
      throw new Error('JSONファイルから有効なカラムを検出できませんでした')
    }
    
    // カラム名をサニタイズ
    const sanitizedColumns = columns.map(col => col.replace(/[^a-zA-Z0-9_]/g, '_'))
    
    if (useFallback || !instance) {
      // メモリ内データストアを使用
      const columnDefs: Column[] = sanitizedColumns.map(name => ({
        name,
        type: 'TEXT',
        nullable: true
      }))
      
      memoryDataStore.createTable(tableName, columnDefs)
      
      // データを挿入
      const processedRows = jsonData.map(item => {
        const processedRow: Record<string, any> = {}
        columns.forEach((col, index) => {
          const sanitizedCol = sanitizedColumns[index]
          const value = item[col]
          if (value === null || value === undefined) {
            processedRow[sanitizedCol] = null
          } else if (typeof value === 'object') {
            processedRow[sanitizedCol] = JSON.stringify(value)
          } else {
            processedRow[sanitizedCol] = String(value)
          }
        })
        return processedRow
      })
      
      memoryDataStore.insertRows(tableName, processedRows)
    } else {
      // DuckDBを使用
      const columnDefinitions = sanitizedColumns.map(col => `"${col}" TEXT`).join(', ')
      await instance.conn.query(`CREATE TABLE ${tableName} (${columnDefinitions})`)
      
      // データを挿入
      const placeholders = sanitizedColumns.map(() => '?').join(', ')
      const insertSQL = `INSERT INTO ${tableName} (${sanitizedColumns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
      
      // バッチ処理で効率化
      const batchSize = 1000
      for (let i = 0; i < jsonData.length; i += batchSize) {
        const batch = jsonData.slice(i, i + batchSize)
        
        for (const item of batch) {
          const values = columns.map(col => {
            const value = item[col]
            if (value === null || value === undefined) {
              return null
            }
            if (typeof value === 'object') {
              return JSON.stringify(value)
            }
            return String(value)
          })
          await instance.conn.query(insertSQL, values)
        }
      }
    }
    
    console.log(`JSONファイル読み込み完了: ${jsonData.length}行、${columns.length}列`)
    
  } catch (error) {
    console.error('JSON読み込みエラー:', error)
    throw new Error(`JSONファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function loadSQLiteFile(file: File, baseTableName: string = 'data'): Promise<void> {
  throw new Error('SQLiteファイルの読み込みはサポートされていません。\n\n代替案:\n1. SQLiteからCSVファイルにエクスポート\n2. 本アプリにCSVファイルをアップロード\n\nエクスポートコマンド例:\n.mode csv\n.output data.csv\nSELECT * FROM your_table;')
}

export async function loadDuckDBFile(file: File): Promise<string[]> {
  throw new Error('DuckDBファイルの読み込みはサポートされていません。\n\n代替案:\n1. DuckDBからCSV形式でエクスポート\n2. 本アプリにCSVファイルをアップロード\n\nエクスポートコマンド例:\nCOPY your_table TO \'data.csv\' (FORMAT CSV, HEADER);')
}

export async function getTableInfo(tableName: string): Promise<any[]> {
  const instance = await initDuckDB()
  
  if (useFallback || !instance) {
    return memoryDataStore.getTableInfo(tableName).map(col => ({
      column_name: col.name,
      column_type: col.type,
      null: col.nullable ? 'YES' : 'NO'
    }))
  }
  
  const result = await instance.conn.query(`DESCRIBE ${tableName}`)
  return result.toArray()
}

export async function getTableData(
  tableName: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  const instance = await initDuckDB()
  
  if (useFallback || !instance) {
    return memoryDataStore.getTableData(tableName, limit, offset)
  }
  
  const result = await instance.conn.query(
    `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`
  )
  return result.toArray()
}

export async function getTableCount(tableName: string): Promise<number> {
  const instance = await initDuckDB()
  
  if (useFallback || !instance) {
    return memoryDataStore.getTableCount(tableName)
  }
  
  const result = await instance.conn.query(`SELECT COUNT(*) as count FROM ${tableName}`)
  const rows = result.toArray()
  return rows[0].count
}