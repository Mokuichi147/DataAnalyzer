// メモリ内データストア（DuckDBの代替）
export interface Column {
  name: string
  type: string
  nullable: boolean
}

export interface TableSchema {
  name: string
  columns: Column[]
  data: Record<string, any>[]
}

class MemoryDataStore {
  private tables: Map<string, TableSchema> = new Map()

  createTable(tableName: string, columns: Column[]): void {
    const table: TableSchema = {
      name: tableName,
      columns,
      data: []
    }
    this.tables.set(tableName, table)
  }

  insertRow(tableName: string, row: Record<string, any>): void {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    table.data.push({ ...row })
  }

  insertRows(tableName: string, rows: Record<string, any>[]): void {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    table.data.push(...rows.map(row => ({ ...row })))
  }

  query(sql: string): any[] {
    // 簡単なSQL解析（SELECT文のみサポート）
    const upperSQL = sql.toUpperCase().trim()
    
    if (upperSQL.startsWith('SELECT')) {
      return this.executeSelect(sql)
    } else if (upperSQL.startsWith('DESCRIBE')) {
      return this.executeDescribe(sql)
    } else if (upperSQL.includes('COUNT(*)')) {
      return this.executeCount(sql)
    }
    
    throw new Error(`Unsupported SQL: ${sql}`)
  }

  private executeSelect(sql: string): any[] {
    // FROM句からテーブル名を抽出
    const fromMatch = sql.match(/FROM\s+(\w+)/i)
    if (!fromMatch) {
      throw new Error('Invalid SELECT statement: no FROM clause')
    }
    
    const tableName = fromMatch[1]
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }

    // LIMIT句を解析
    const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i)
    let limit = table.data.length
    let offset = 0
    
    if (limitMatch) {
      limit = parseInt(limitMatch[1])
      offset = limitMatch[2] ? parseInt(limitMatch[2]) : 0
    }

    // データを返す
    return table.data.slice(offset, offset + limit)
  }

  private executeDescribe(sql: string): any[] {
    const match = sql.match(/DESCRIBE\s+(\w+)/i)
    if (!match) {
      throw new Error('Invalid DESCRIBE statement')
    }
    
    const tableName = match[1]
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }

    return table.columns.map(col => ({
      column_name: col.name,
      column_type: col.type,
      null: col.nullable ? 'YES' : 'NO'
    }))
  }

  private executeCount(sql: string): any[] {
    const fromMatch = sql.match(/FROM\s+(\w+)/i)
    if (!fromMatch) {
      throw new Error('Invalid COUNT statement: no FROM clause')
    }
    
    const tableName = fromMatch[1]
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }

    return [{ count: table.data.length }]
  }

  getTableInfo(tableName: string): Column[] {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    return table.columns
  }

  getTableData(tableName: string, limit: number = 100, offset: number = 0): any[] {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    return table.data.slice(offset, offset + limit)
  }

  getTableCount(tableName: string): number {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    return table.data.length
  }

  dropTable(tableName: string): void {
    this.tables.delete(tableName)
  }

  listTables(): string[] {
    return Array.from(this.tables.keys())
  }
}

// シングルトンインスタンス
const memoryDataStore = new MemoryDataStore()

export { memoryDataStore }