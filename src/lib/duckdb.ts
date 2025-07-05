import * as duckdb from '@duckdb/duckdb-wasm'
import { memoryDataStore, type Column } from './memoryDataStore'
import { getMemoryInfo, logMemoryUsage, checkMemoryWarning, forceGarbageCollection } from './memoryMonitor'

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
  console.log(`🚀 ファイル処理開始: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`)
  
  await initDuckDB() // フォールバック判定のため
  
  // メモリ使用量をチェック
  logMemoryUsage('ファイル処理開始前')
  const memoryWarning = checkMemoryWarning()
  
  if (memoryWarning.shouldWarn) {
    console.warn(memoryWarning.message)
    
    // クリティカルレベルの場合はガベージコレクション実行
    const memInfo = getMemoryInfo()
    if (memInfo.isCritical) {
      forceGarbageCollection()
      await new Promise(resolve => setTimeout(resolve, 1000)) // GC完了を待つ
    }
  }
  
  // ファイルサイズチェック
  const fileSizeMB = file.size / (1024 * 1024)
  const memInfo = getMemoryInfo()
  const availableMemoryMB = memInfo.jsHeapSizeLimit > 0 ? 
    (memInfo.jsHeapSizeLimit - memInfo.usedJSHeapSize) / (1024 * 1024) : 
    2048 // フォールバック: 2GB
  
  if (fileSizeMB > availableMemoryMB * 0.5) {
    console.warn(`⚠️ ファイルサイズ (${fileSizeMB.toFixed(1)}MB) が利用可能メモリ (${availableMemoryMB.toFixed(1)}MB) に対して大きすぎる可能性があります`)
  }
  
  // Safari特有の問題への対処
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  if (isSafari && fileSizeMB > 5) {
    console.warn('🍎 Safari環境で大容量ファイルを検出、特別処理を適用')
  }
  
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
        try {
          return await loadSQLiteFile(file, tableName)
        } catch (error) {
          // SQLiteファイルとして読み込めない場合、DuckDBとして試行
          if (error instanceof Error && error.message.includes('DuckDBファイル')) {
            console.log('SQLiteファイルとして失敗、DuckDBファイルとして再試行')
            await loadDuckDBFile(file)
            return
          }
          throw error
        }
      case 'db':
        // .dbファイルはSQLiteまたはDuckDBの可能性があるため、ヘッダーで判定
        return await loadDatabaseFile(file, tableName)
      case 'duckdb':
        return await loadDuckDBFile(file)
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`)
    }
    
  } catch (error) {
    console.error('ファイル読み込みエラー:', error)
    throw new Error(`ファイル読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Safari用チャンク読み込み関数
async function readFileInChunks(file: File, chunkSize: number = 1024 * 1024): Promise<string> {
  console.log(`📚 チャンク読み込み開始: ${Math.ceil(file.size / chunkSize)} チャンク`)
  
  let result = ''
  let offset = 0
  
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size))
    const chunkText = await chunk.text()
    result += chunkText
    offset += chunkSize
    
    // プログレス表示
    const progress = Math.round((offset / file.size) * 100)
    console.log(`📖 読み込み進捗: ${progress}%`)
    
    // Safari用: 少し休憩してメモリ圧迫を緩和
    if (offset % (chunkSize * 5) === 0) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  
  console.log('✅ チャンク読み込み完了')
  return result
}

async function createTableFromCSV(file: File, tableName: string, delimiter: string = ','): Promise<void> {
  const instance = await initDuckDB()
  
  try {
    console.log(`📄 CSV読み込み開始: ${file.name}`)
    
    // Safari用の最適化: ファイルを小さなチャンクに分けて読み込み
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const fileSizeMB = file.size / (1024 * 1024)
    
    let text: string
    if (isSafari && fileSizeMB > 5) {
      console.log('🍎 Safari大容量ファイル: チャンク読み込みを実行')
      text = await readFileInChunks(file)
    } else {
      text = await file.text()
    }
    
    console.log(`📊 ファイル読み込み完了: ${text.length} 文字`)
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
      
      // Safari用: データを小さなバッチに分けて挿入
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      const batchSize = isSafari ? 1000 : 5000
      
      console.log(`💾 メモリストア挿入開始: ${dataRows.length}行を${batchSize}行ずつ処理`)
      
      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize)
        const progress = Math.round(((i + batch.length) / dataRows.length) * 100)
        console.log(`📊 メモリ挿入進捗: ${progress}% (${i + batch.length}/${dataRows.length}行)`)
        
        const processedBatch = batch.map(row => {
          const processedRow: Record<string, any> = {}
          sanitizedHeaders.forEach((sanitizedHeader, index) => {
            processedRow[sanitizedHeader] = row[headers[index]]
          })
          return processedRow
        })
        
        memoryDataStore.insertRows(tableName, processedBatch)
        
        // Safari用: バッチ間で休憩
        if (isSafari && i % (batchSize * 2) === 0) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
    } else {
      // DuckDBを使用
      const columnDefinitions = sanitizedHeaders.map(header => `"${header}" TEXT`).join(', ')
      await instance.conn.query(`CREATE TABLE ${tableName} (${columnDefinitions})`)
      
      // データを挿入（バッチ処理で高速化）
      const placeholders = sanitizedHeaders.map(() => '?').join(', ')
      const insertSQL = `INSERT INTO ${tableName} (${sanitizedHeaders.map(h => `"${h}"`).join(', ')}) VALUES (${placeholders})`
      
      // Safari用: バッチサイズを調整
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      const batchSize = isSafari ? 500 : 1000 // Safariでは小さくする
      
      console.log(`💾 データ挿入開始: ${dataRows.length}行を${batchSize}行ずつ処理`)
      
      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize)
        const progress = Math.round(((i + batch.length) / dataRows.length) * 100)
        console.log(`📊 挿入進捗: ${progress}% (${i + batch.length}/${dataRows.length}行)`)
        
        for (const row of batch) {
          const values = sanitizedHeaders.map((_, index) => row[headers[index]])
          await instance.conn.query(insertSQL, values)
        }
        
        // Safari用: バッチ間で休憩
        if (isSafari && i % (batchSize * 4) === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
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

// ファイルヘッダーを検査してSQLiteまたはDuckDBかを判定
async function loadDatabaseFile(file: File, tableName: string = 'data'): Promise<void> {
  try {
    console.log('データベースファイルの形式を判定中:', file.name)
    
    // ファイルの最初の部分を読み込んでヘッダーを確認
    const slice = file.slice(0, 100)
    const arrayBuffer = await slice.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    if (uint8Array.length < 16) {
      throw new Error('ファイルサイズが小さすぎます')
    }
    
    const header = String.fromCharCode(...uint8Array.slice(0, 20))
    console.log('ファイルヘッダー検査:', header.substring(0, 15))
    
    // SQLiteファイルの判定
    if (header.startsWith('SQLite format 3')) {
      console.log('SQLiteファイルとして検出')
      await loadSQLiteFile(file, tableName)
      return
    }
    
    // DuckDBファイルの判定（DUCKという文字列を含む）
    if (header.includes('DUCK') || uint8Array.slice(4, 8).every((byte, i) => byte === 'DUCK'.charCodeAt(i))) {
      console.log('DuckDBファイルとして検出')
      await loadDuckDBFile(file)
      return
    }
    
    // バイナリヘッダーによる判定（印刷不可能文字が多い場合はDuckDB）
    const printableChars = header.split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126).length
    if (printableChars < header.length * 0.5) {
      console.log('バイナリヘッダー検出、DuckDBファイルとして処理')
      await loadDuckDBFile(file)
      return
    }
    
    // SQLiteファイルとして試行、失敗した場合はDuckDBとして処理
    try {
      console.log('SQLiteファイルとして試行')
      await loadSQLiteFile(file, tableName)
      return
    } catch (sqliteError) {
      console.warn('SQLiteとして失敗、DuckDBファイルとして試行:', sqliteError)
      await loadDuckDBFile(file)
      return
    }
    
  } catch (error) {
    console.error('データベースファイル判定エラー:', error)
    throw new Error(`データベースファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function loadSQLiteFile(file: File, baseTableName: string = 'data'): Promise<string[]> {
  try {
    console.log('🗄️ SQLiteファイルの読み込みを開始:', file.name)
    
    // ファイルをArrayBufferとして読み込み
    console.log('📖 ファイル読み込み中...')
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    console.log(`📊 ファイルサイズ: ${uint8Array.length} bytes (${(uint8Array.length / (1024 * 1024)).toFixed(2)} MB)`)
    
    // SQLiteファイルかどうかを確認（マジックバイト）
    if (uint8Array.length < 16) {
      throw new Error('ファイルサイズが小さすぎます。有効なSQLiteファイルではありません。')
    }
    
    const header = String.fromCharCode(...uint8Array.slice(0, 15))
    console.log('🔍 ファイルヘッダー検査:', JSON.stringify(header))
    
    // ヘッダーのバイト値も確認
    const headerBytes = Array.from(uint8Array.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    console.log('🔍 ヘッダーバイト値:', headerBytes)
    
    if (header !== 'SQLite format 3') {
      // DuckDBファイルの可能性をチェック
      if (header.includes('DUCK')) {
        console.log('🔄 SQLiteとして処理しようとしましたが、DuckDBファイルとして自動切り替えします')
        return await loadDuckDBFile(file)
      }
      throw new Error(`有効なSQLiteファイルではありません。ヘッダー: "${header}"`)
    }
    
    console.log('✅ SQLiteファイル形式確認完了')
    
    // sql.jsを動的にロード
    console.log('📦 sql.jsライブラリの読み込み開始')
    const initSqlJs = await loadSqlJs()
    console.log('✅ sql.jsライブラリ読み込み完了')
    
    console.log('🗄️ SQLiteデータベースの初期化中...')
    let db: any
    try {
      db = new initSqlJs.Database(uint8Array)
      console.log('✅ SQLiteデータベース初期化完了')
    } catch (dbError) {
      console.error('❌ SQLiteデータベース初期化エラー:', dbError)
      throw new Error(`SQLiteデータベースの初期化に失敗しました: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`)
    }
    
    try {
      // データベースの基本情報を取得
      console.log('📊 データベース情報を取得中...')
      try {
        const pragmaResult = db.exec("PRAGMA schema_version;")
        console.log('SQLiteスキーマバージョン:', pragmaResult)
      } catch (pragmaError) {
        console.warn('スキーマバージョン取得失敗:', pragmaError)
      }
      
      // テーブル一覧を取得
      console.log('📋 テーブル一覧取得中...')
      const tableQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      console.log('実行するクエリ:', tableQuery)
      
      const tables = db.exec(tableQuery)
      console.log('テーブルクエリ結果:', tables)
      
      if (!tables.length || !tables[0].values.length) {
        // 別のクエリを試行
        console.log('🔄 代替クエリを試行中...')
        const alternativeQuery = "SELECT name FROM sqlite_master WHERE type='table'"
        const allTables = db.exec(alternativeQuery)
        console.log('全テーブル:', allTables)
        
        if (!allTables.length || !allTables[0].values.length) {
          throw new Error('SQLiteファイルにテーブルが見つかりません')
        }
        
        // sqlite_で始まるテーブルを除外
        const filteredTables = allTables[0].values.filter(row => 
          !String(row[0]).startsWith('sqlite_')
        )
        
        if (filteredTables.length === 0) {
          throw new Error('ユーザーテーブルが見つかりません（システムテーブルのみ存在）')
        }
        
        console.log('フィルタ後のテーブル:', filteredTables)
        tables[0] = { ...allTables[0], values: filteredTables }
      }
      
      const tableNames = tables[0].values.map(row => row[0] as string)
      console.log('🎯 検出されたテーブル:', tableNames)
      
      // 各テーブルをメモリ内データストアに読み込み
      for (const tableName of tableNames) {
        console.log(`📥 テーブル ${tableName} を読み込み中...`)
        await loadSQLiteTable(db, tableName)
      }
      
      console.log(`✅ SQLiteファイルの読み込み完了: ${tableNames.length}個のテーブル`)
      
      // 最終確認: メモリ内データストアのテーブル一覧を表示
      console.log(`🔍 メモリ内データストアの最終確認:`)
      const memoryTables = memoryDataStore.listTables()
      console.log(`📋 メモリストア内のテーブル一覧:`, memoryTables)
      
      // 各テーブルの詳細情報も表示
      for (const tableName of memoryTables) {
        try {
          const count = memoryDataStore.getTableCount(tableName)
          const schema = memoryDataStore.getTableInfo(tableName)
          console.log(`📊 テーブル ${tableName}: ${count}行, ${schema.length}列`)
        } catch (e) {
          console.warn(`⚠️ テーブル ${tableName} の情報取得に失敗:`, e)
        }
      }
      
      // 読み込まれたテーブル名を返す
      return tableNames
      
    } finally {
      if (db) {
        console.log('🔒 SQLiteデータベースを閉じています...')
        db.close()
        console.log('✅ SQLiteデータベースクローズ完了')
      }
    }
    
  } catch (error) {
    console.error('❌ SQLiteファイル読み込みエラー:', error)
    throw new Error(`SQLiteファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// sql.jsライブラリのキャッシュ
let sqlJsLibrary: any = null

// sql.jsを動的にロードする関数
async function loadSqlJs() {
  // すでに読み込まれている場合はキャッシュから返す
  if (sqlJsLibrary) {
    console.log('🚀 sql.js キャッシュから返却')
    return sqlJsLibrary
  }
  
  try {
    console.log('📦 sql.jsをCDNから読み込み中...')
    
    // 既に読み込まれているかチェック
    if ((window as any).initSqlJs) {
      console.log('🔍 sql.js 既に読み込み済み、初期化を実行')
      try {
        const SQL = await (window as any).initSqlJs({
          locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        })
        sqlJsLibrary = SQL
        console.log('✅ sql.js 初期化完了（既存）')
        return SQL
      } catch (initError) {
        console.error('❌ sql.js 初期化エラー（既存）:', initError)
        // 既存の初期化に失敗した場合は新規読み込みを試行
        (window as any).initSqlJs = undefined
      }
    }
    
    // 複数のCDNを試行
    const cdnUrls = [
      'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js',
      'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.js',
      'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js'
    ]
    
    let scriptLoaded = false
    let lastError: Error | null = null
    
    for (const cdnUrl of cdnUrls) {
      try {
        console.log(`🌐 CDN試行: ${cdnUrl}`)
        
        await new Promise<void>((resolve, reject) => {
          // 既存のスクリプトタグを確認
          const existingScript = document.querySelector(`script[src*="sql-wasm.js"]`)
          if (existingScript) {
            console.log('📋 既存のsql.jsスクリプトを発見、削除して再読み込み')
            existingScript.remove()
          }
          
          const script = document.createElement('script')
          script.src = cdnUrl
          script.crossOrigin = 'anonymous'
          script.type = 'text/javascript'
          
          const timeout = setTimeout(() => {
            script.remove()
            reject(new Error(`タイムアウト: ${cdnUrl}`))
          }, 15000) // 15秒タイムアウト
          
          script.onload = () => {
            clearTimeout(timeout)
            console.log(`✅ sql.js スクリプト読み込み完了: ${cdnUrl}`)
            resolve()
          }
          
          script.onerror = (error) => {
            clearTimeout(timeout)
            script.remove()
            reject(new Error(`読み込みエラー: ${cdnUrl} - ${error}`))
          }
          
          document.head.appendChild(script)
        })
        
        scriptLoaded = true
        console.log(`🎉 CDN読み込み成功: ${cdnUrl}`)
        break
        
      } catch (error) {
        lastError = error as Error
        console.warn(`❌ CDN ${cdnUrl} 失敗:`, error)
        continue
      }
    }
    
    if (!scriptLoaded) {
      const errorMsg = lastError ? ` 最後のエラー: ${lastError.message}` : ''
      throw new Error(`全てのCDNからの読み込みに失敗しました${errorMsg}`)
    }
    
    // 初期化を待つ（最大5秒）
    console.log('⏳ sql.js初期化関数の検出を待機中...')
    let attempts = 0
    const maxAttempts = 50
    
    while (attempts < maxAttempts) {
      if ((window as any).initSqlJs && typeof (window as any).initSqlJs === 'function') {
        console.log(`🎯 sql.js初期化関数を検出 (${attempts + 1}回目)`)
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    
    if (!(window as any).initSqlJs) {
      throw new Error(`sql.jsライブラリが正しく読み込まれませんでした (${attempts}回試行)`)
    }
    
    // 初期化を実行
    console.log('🚀 sql.js初期化を実行中...')
    try {
      const SQL = await (window as any).initSqlJs({
        locateFile: (file: string) => {
          console.log(`📁 WASMファイル要求: ${file}`)
          // 複数のCDNを試行
          const wasmCdns = [
            `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
            `https://unpkg.com/sql.js@1.8.0/dist/${file}`,
            `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
          ]
          const selectedUrl = wasmCdns[0] // 最初のCDNを使用
          console.log(`📁 WASMファイル選択: ${selectedUrl}`)
          return selectedUrl
        }
      })
      
      if (!SQL || !SQL.Database) {
        throw new Error('sql.js初期化は成功したが、Databaseクラスが見つかりません')
      }
      
      sqlJsLibrary = SQL
      console.log('✅ sql.js 初期化完了（新規）')
      return SQL
      
    } catch (initError) {
      console.error('❌ sql.js初期化エラー:', initError)
      throw new Error(`sql.js初期化に失敗しました: ${initError instanceof Error ? initError.message : 'Unknown error'}`)
    }
    
  } catch (error) {
    console.error('sql.js読み込みエラー:', error)
    throw new Error(`SQLite解析ライブラリの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}

考えられる原因:
1. インターネット接続の問題
2. ブラウザのJavaScript制限
3. CORS設定の問題

代替案:
1. SQLiteファイルをCSV形式でエクスポート
2. 別のブラウザで試行
3. インターネット接続を確認`)
  }
}

// SQLiteテーブルをメモリ内データストアに読み込む
async function loadSQLiteTable(db: any, tableName: string): Promise<void> {
  try {
    console.log(`📥 テーブル ${tableName} の読み込み開始`)
    
    // テーブル存在確認
    const tableCheckQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    console.log(`🔍 テーブル存在確認クエリ: ${tableCheckQuery}`)
    const tableCheckResult = db.exec(tableCheckQuery)
    console.log(`🔍 テーブル存在確認結果:`, tableCheckResult)
    
    if (!tableCheckResult.length || !tableCheckResult[0].values.length) {
      console.warn(`⚠️ テーブル ${tableName} が存在しません`)
      return
    }
    
    // テーブルスキーマを取得
    const schemaQuery = `PRAGMA table_info("${tableName}")`
    console.log(`📋 スキーマ取得クエリ: ${schemaQuery}`)
    const schemaResult = db.exec(schemaQuery)
    console.log(`📋 スキーマ取得結果:`, schemaResult)
    
    if (!schemaResult.length || !schemaResult[0].values.length) {
      console.warn(`⚠️ テーブル ${tableName} のスキーマ取得に失敗`)
      return
    }
    
    // カラム情報を構築
    const columns = schemaResult[0].values.map((row: any[]) => ({
      name: row[1], // column name
      type: row[2] || 'TEXT', // data type
      nullable: row[3] === 0 // not null
    }))
    
    console.log(`📊 テーブル ${tableName} のカラム:`, columns.map(c => `${c.name}(${c.type})`))
    
    // データ行数を確認
    const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`
    console.log(`🔢 行数確認クエリ: ${countQuery}`)
    const countResult = db.exec(countQuery)
    const rowCount = countResult.length > 0 && countResult[0].values.length > 0 ? 
      countResult[0].values[0][0] : 0
    console.log(`🔢 テーブル ${tableName} の行数: ${rowCount}`)
    
    // データを取得（安全にクエリを実行）
    const dataQuery = `SELECT * FROM "${tableName}"`
    console.log(`📊 データ取得クエリ: ${dataQuery}`)
    const dataResult = db.exec(dataQuery)
    console.log(`📊 データ取得結果構造:`, {
      length: dataResult.length,
      hasValues: dataResult.length > 0 && dataResult[0].values,
      valueCount: dataResult.length > 0 && dataResult[0].values ? dataResult[0].values.length : 0
    })
    
    const data: Record<string, any>[] = []
    
    if (dataResult.length && dataResult[0].values && dataResult[0].values.length) {
      // データを変換
      for (const row of dataResult[0].values) {
        const rowData: Record<string, any> = {}
        columns.forEach((col: any, index: number) => {
          rowData[col.name] = row[index]
        })
        data.push(rowData)
      }
    }
    
    // メモリ内データストアにテーブルを作成
    console.log(`💾 メモリストアにテーブル ${tableName} を作成中...`)
    
    // 既存のテーブルがあれば削除
    try {
      memoryDataStore.dropTable(tableName)
      console.log(`🗑️ 既存テーブル ${tableName} を削除`)
    } catch (e) {
      console.log(`ℹ️ テーブル ${tableName} は存在しませんでした`)
    }
    
    memoryDataStore.createTable(tableName, columns)
    console.log(`✅ テーブル ${tableName} の構造を作成完了`)
    
    if (data.length > 0) {
      memoryDataStore.insertRows(tableName, data)
      console.log(`📥 テーブル ${tableName} にデータを挿入完了: ${data.length}行`)
    } else {
      console.log(`ℹ️ テーブル ${tableName} はデータが空です`)
    }
    
    // 作成確認
    try {
      const verifyCount = memoryDataStore.getTableCount(tableName)
      console.log(`✅ メモリストアでのテーブル ${tableName} 確認: ${verifyCount}行`)
    } catch (verifyError) {
      console.error(`❌ テーブル ${tableName} の作成確認に失敗:`, verifyError)
    }
    
    console.log(`🎉 テーブル ${tableName} の読み込み完了: ${data.length}行、${columns.length}列`)
    
  } catch (error) {
    console.error(`❌ テーブル ${tableName} の読み込みエラー:`, error)
    throw error
  }
}

export async function loadDuckDBFile(file: File): Promise<string[]> {
  try {
    console.log('DuckDBファイルの読み込みを開始:', file.name)
    
    // DuckDB WasmでSQLiteファイルまたはDuckDBファイルを読み込み
    const instance = await initDuckDB()
    
    if (useFallback || !instance) {
      // フォールバック: SQLiteファイルとしてsql.jsで読み込み
      console.log('メモリ内データストアを使用してSQLiteファイルを読み込み')
      await loadSQLiteFile(file)
      return ['sqlite_fallback_successful']
    }
    
    try {
      // DuckDB WasmでSQLiteまたはDuckDBファイルを読み込み
      console.log('DuckDB WasmでDBファイルを読み込み中...')
      
      // ファイルをDuckDB Wasmに登録
      await instance.db.registerFileHandle(file.name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)
      console.log('✅ ファイル登録完了')
      
      // ファイルの種類を判定
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      let attachQuery: string
      
      if (fileExtension === 'duckdb') {
        // DuckDBファイルとしてアタッチ
        attachQuery = `ATTACH '${file.name}' AS uploaded_db;`
        console.log('DuckDBファイルとして処理')
      } else {
        // SQLiteファイルとしてアタッチ（SQLite拡張機能を先にインストール）
        console.log('SQLiteファイルとして処理、拡張機能をインストール中...')
        
        try {
          await instance.conn.query('INSTALL sqlite;')
          await instance.conn.query('LOAD sqlite;')
          console.log('✅ SQLite拡張機能読み込み完了')
        } catch (extError) {
          console.warn('SQLite拡張機能のインストール失敗:', extError)
          // 既にインストール済みの場合は無視して続行
        }
        
        attachQuery = `ATTACH '${file.name}' AS uploaded_db (TYPE sqlite);`
      }
      
      // データベースをアタッチ
      await instance.conn.query(attachQuery)
      console.log('✅ ファイルアタッチ完了')
      
      // テーブル一覧を取得
      let tablesResult
      try {
        tablesResult = await instance.conn.query('SHOW TABLES FROM uploaded_db')
      } catch (showTablesError) {
        // フォールバック: 一般的なクエリを試行
        console.warn('SHOW TABLES失敗、代替方法を試行:', showTablesError)
        if (fileExtension === 'duckdb') {
          tablesResult = await instance.conn.query('SELECT name FROM uploaded_db.sqlite_master WHERE type="table"')
        } else {
          tablesResult = await instance.conn.query('SELECT name FROM uploaded_db.sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%"')
        }
      }
      
      const tables = tablesResult.toArray()
      
      if (tables.length === 0) {
        throw new Error('ファイルにテーブルが見つかりません')
      }
      
      const tableNames = tables.map(row => row.name || row.table_name || row.Name)
      console.log('検出されたテーブル:', tableNames)
      
      // 各テーブルのデータをメモリ内データストアにコピー
      for (const tableName of tableNames) {
        await copyDuckDBTableToMemoryStore(instance, `uploaded_db.${tableName}`, tableName)
      }
      
      console.log(`✅ DuckDBファイル読み込み完了: ${tableNames.length}個のテーブル`)
      return tableNames
      
    } catch (duckdbError) {
      console.warn('DuckDB Wasmでの読み込みに失敗:', duckdbError)
      
      // フォールバック: SQLiteファイルとしてsql.jsで読み込み
      console.log('SQLiteファイルとしてフォールバック処理を実行')
      await loadSQLiteFile(file)
      return ['sqlite_fallback_successful']
    }
    
  } catch (error) {
    console.error('❌ DBファイル読み込みエラー:', error)
    throw error instanceof Error ? error : new Error('DBファイルの読み込みに失敗しました')
  }
}

// DuckDBテーブルをメモリ内データストアにコピーするヘルパー関数（メモリ最適化版）
async function copyDuckDBTableToMemoryStore(instance: DuckDBInstance, sourceTableName: string, targetTableName: string): Promise<void> {
  try {
    console.log(`テーブル ${sourceTableName} をメモリ内データストアにコピー中...`)
    
    // テーブルスキーマを取得
    const schemaResult = await instance.conn.query(`DESCRIBE ${sourceTableName}`)
    const schemaRows = schemaResult.toArray()
    
    const columns: Column[] = schemaRows.map(row => ({
      name: row.column_name,
      type: row.column_type,
      nullable: row.null === 'YES'
    }))
    
    // テーブルサイズを確認
    const countResult = await instance.conn.query(`SELECT COUNT(*) as count FROM ${sourceTableName}`)
    const totalRows = countResult.toArray()[0].count
    console.log(`テーブル行数: ${totalRows}`)
    
    // 大容量テーブルの場合はバッチ処理
    const BATCH_SIZE = 10000 // 1万行ずつ処理
    const MAX_ROWS = 1000000 // 最大100万行まで
    
    if (totalRows > MAX_ROWS) {
      console.warn(`テーブルが大きすぎます（${totalRows}行）。最初の${MAX_ROWS}行のみを読み込みます。`)
    }
    
    // メモリ内データストアにテーブルを作成
    try {
      memoryDataStore.dropTable(targetTableName)
    } catch (e) {
      // テーブルが存在しない場合は無視
    }
    
    memoryDataStore.createTable(targetTableName, columns)
    
    // バッチ処理でデータを取得・挿入
    const effectiveRows = Math.min(totalRows, MAX_ROWS)
    let processedRows = 0
    
    for (let offset = 0; offset < effectiveRows; offset += BATCH_SIZE) {
      const limit = Math.min(BATCH_SIZE, effectiveRows - offset)
      
      console.log(`バッチ処理: ${offset + 1}-${offset + limit}行目 (${Math.round((offset / effectiveRows) * 100)}%)`)
      
      // バッチでデータを取得
      const batchResult = await instance.conn.query(`SELECT * FROM ${sourceTableName} LIMIT ${limit} OFFSET ${offset}`)
      const batchRows = batchResult.toArray()
      
      if (batchRows.length > 0) {
        memoryDataStore.insertRows(targetTableName, batchRows)
        processedRows += batchRows.length
      }
      
      // メモリ圧迫を避けるため、ガベージコレクションを促す
      if (offset % (BATCH_SIZE * 5) === 0) {
        // 50万行ごとに一時停止
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    console.log(`✅ テーブル ${targetTableName} のコピー完了: ${processedRows}行、${columns.length}列`)
    
    if (totalRows > MAX_ROWS) {
      console.warn(`⚠️ メモリ制限により、${totalRows - MAX_ROWS}行がスキップされました`)
    }
    
  } catch (error) {
    console.error(`❌ テーブル ${sourceTableName} のコピーエラー:`, error)
    throw error
  }
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