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

    // データに基づいて型を推定
    return table.columns.map(col => {
      const inferredType = this.inferColumnType(table.data, col.name)
      return {
        column_name: col.name,
        column_type: inferredType,
        null: col.nullable ? 'YES' : 'NO'
      }
    })
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
    
    // データに基づいて型を推定
    const inferredColumns = table.columns.map(col => {
      const inferredType = this.inferColumnType(table.data, col.name)
      return {
        ...col,
        type: inferredType
      }
    })
    
    return inferredColumns
  }

  private inferColumnType(data: Record<string, any>[], columnName: string): string {
    if (data.length === 0) return 'TEXT'
    
    // サンプル数を制限（最大100行）
    const sampleSize = Math.min(data.length, 100)
    const samples = data.slice(0, sampleSize)
    
    let integerCount = 0
    let floatCount = 0
    let dateCount = 0
    let booleanCount = 0
    let totalNonNull = 0
    
    for (const row of samples) {
      const value = row[columnName]
      if (value === null || value === undefined || value === '') continue
      
      totalNonNull++
      const strValue = String(value).trim()
      
      // ブール値チェック
      if (strValue.toLowerCase() === 'true' || strValue.toLowerCase() === 'false' ||
          strValue === '1' || strValue === '0') {
        booleanCount++
        continue
      }
      
      // 整数チェック
      if (/^-?\d+$/.test(strValue)) {
        integerCount++
        continue
      }
      
      // 小数チェック
      if (/^-?\d*\.\d+$/.test(strValue)) {
        floatCount++
        continue
      }
      
      // 日付チェック（いくつかの一般的な形式）
      if (/^\d{4}-\d{2}-\d{2}/.test(strValue) || 
          /^\d{2}\/\d{2}\/\d{4}/.test(strValue) ||
          /^\d{4}\/\d{2}\/\d{2}/.test(strValue)) {
        try {
          const date = new Date(strValue)
          if (!isNaN(date.getTime())) {
            dateCount++
            continue
          }
        } catch (e) {
          // 日付として解析できない場合は続行
        }
      }
    }
    
    if (totalNonNull === 0) return 'TEXT'
    
    const threshold = totalNonNull * 0.8 // 80%以上が同じ型の場合
    
    // 優先順位: INTEGER > FLOAT > DATE > BOOLEAN > TEXT
    if (integerCount >= threshold) return 'INTEGER'
    if (floatCount >= threshold) return 'FLOAT'
    if ((integerCount + floatCount) >= threshold) return 'NUMERIC'
    if (dateCount >= threshold) return 'DATE'
    if (booleanCount >= threshold) return 'BOOLEAN'
    
    return 'TEXT'
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

  getTableSchema(tableName: string): TableSchema | undefined {
    return this.tables.get(tableName)
  }
}

// シングルトンインスタンス
const memoryDataStore = new MemoryDataStore()

export { memoryDataStore }