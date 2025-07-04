import * as duckdb from '@duckdb/duckdb-wasm'

export interface DuckDBInstance {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
}

let duckdbInstance: DuckDBInstance | null = null

export async function initDuckDB(): Promise<DuckDBInstance> {
  if (duckdbInstance) {
    return duckdbInstance
  }

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
  const logger = new duckdb.VoidLogger()
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  const conn = await db.connect()

  duckdbInstance = { db, conn }
  return duckdbInstance
}

export async function executeQuery(sql: string, params?: any[]): Promise<any[]> {
  const { conn } = await initDuckDB()
  const result = await conn.query(sql, params)
  return result.toArray()
}

export async function createTableFromFile(
  file: File,
  tableName: string = 'data'
): Promise<void> {
  const { db, conn } = await initDuckDB()
  
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  await db.registerFileBuffer(file.name, uint8Array)
  
  const fileExtension = file.name.split('.').pop()?.toLowerCase()
  
  let sql = ''
  switch (fileExtension) {
    case 'csv':
      sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`
      break
    case 'tsv':
      sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}', delimiter='\t')`
      break
    case 'parquet':
      sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${file.name}')`
      break
    case 'json':
      sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${file.name}')`
      break
    default:
      throw new Error(`Unsupported file type: ${fileExtension}`)
  }
  
  await conn.query(sql)
}

export async function loadDuckDBFile(file: File): Promise<string[]> {
  const { db } = await initDuckDB()
  
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // DuckDBファイルを登録
  await db.registerFileBuffer(file.name, uint8Array)
  
  // 新しい接続を作成してDuckDBファイルをアタッチ
  const conn = await db.connect()
  
  try {
    // DuckDBファイルをアタッチ
    await conn.query(`ATTACH '${file.name}' AS attached_db`)
    
    // アタッチされたデータベースのテーブル一覧を取得
    const result = await conn.query(`
      SELECT table_name 
      FROM attached_db.information_schema.tables 
      WHERE table_schema = 'main'
    `)
    
    const tables = result.toArray().map(row => row.table_name)
    
    // 各テーブルを現在のデータベースにコピー
    for (const tableName of tables) {
      await conn.query(`
        CREATE TABLE ${tableName} AS 
        SELECT * FROM attached_db.${tableName}
      `)
    }
    
    // アタッチを解除
    await conn.query(`DETACH attached_db`)
    
    return tables
    
  } catch (error) {
    await conn.close()
    throw error
  }
}

export async function getTableInfo(tableName: string): Promise<any[]> {
  const { conn } = await initDuckDB()
  const result = await conn.query(`DESCRIBE ${tableName}`)
  return result.toArray()
}

export async function getTableData(
  tableName: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  const { conn } = await initDuckDB()
  const result = await conn.query(
    `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`
  )
  return result.toArray()
}

export async function getTableCount(tableName: string): Promise<number> {
  const { conn } = await initDuckDB()
  const result = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`)
  const rows = result.toArray()
  return rows[0].count
}