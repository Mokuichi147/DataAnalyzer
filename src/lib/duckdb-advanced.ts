import * as duckdb from '@duckdb/duckdb-wasm'

// より高度なDuckDBファイル読み込み試行
export async function loadDuckDBFileAdvanced(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  
  try {
    // Method 1: DuckDB-wasmの最新APIを使用した読み込み
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles())
    const logger = new duckdb.VoidLogger()
    const worker = new Worker(bundle.mainWorker!)
    const db = new duckdb.AsyncDuckDB(logger, worker)
    
    // Instantiate with file data
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker || undefined)
    
    // Register file and try to access as database
    await db.registerFileBuffer(file.name, new Uint8Array(arrayBuffer))
    
    const conn = await db.connect()
    
    try {
      // Try Method 1: Direct database file reading
      await conn.query(`PRAGMA database_list`)
      
      // If successful, try to get tables
      const tables = await conn.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `)
      
      const tableNames = tables.toArray().map(row => row.name)
      
      if (tableNames.length > 0) {
        return tableNames
      }
      
    } catch (directError) {
      console.log('Direct method failed:', directError)
    }
    
    try {
      // Try Method 2: Use DuckDB's built-in database reading
      await conn.query(`ATTACH DATABASE '${file.name}' AS imported_db`)
      
      const tables = await conn.query(`
        SELECT table_name 
        FROM imported_db.information_schema.tables 
        WHERE table_schema = 'main'
      `)
      
      const tableNames = tables.toArray().map(row => row.table_name)
      
      // Copy tables to main database
      for (const tableName of tableNames) {
        await conn.query(`
          CREATE TABLE ${tableName} AS 
          SELECT * FROM imported_db.${tableName}
        `)
      }
      
      await conn.query(`DETACH DATABASE imported_db`)
      
      return tableNames
      
    } catch (attachError) {
      console.log('Attach method failed:', attachError)
    }
    
    await conn.close()
    await db.terminate()
    
  } catch (error) {
    console.log('Advanced method failed:', error)
  }
  
  throw new Error('All advanced methods failed')
}