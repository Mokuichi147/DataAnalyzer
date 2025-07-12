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

  createTable(tableName: string, columns: Column[], data: Record<string, any>[] = []): void {
    const table: TableSchema = {
      name: tableName,
      columns,
      data: data.map(row => ({ ...row }))
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
    }
    
    throw new Error(`Unsupported SQL: ${sql}`)
  }

  private executeSelect(sql: string): any[] {
    // FROM句からテーブル名を抽出（引用符対応、日本語文字対応）
    // 引用符で囲まれたテーブル名と通常のテーブル名の両方に対応
    let fromMatch = sql.match(/FROM\s+"([^"]+)"/i) // 引用符で囲まれたテーブル名
    if (!fromMatch) {
      // 引用符なしのテーブル名（ハイフン、ドット、日本語文字を含む）
      fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\.]+)/i)
    }
    if (!fromMatch) {
      throw new Error('Invalid SELECT statement: no FROM clause')
    }
    
    const tableName = fromMatch[1]
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }

    // データを取得
    let data = table.data

    // WHERE句を解析・適用
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i)
    if (whereMatch) {
      const whereClause = whereMatch[1].trim()
      console.log('🔍 MemoryDataStore: Processing WHERE clause:', whereClause)
      console.log('🔍 MemoryDataStore: Original data length:', data.length)
      
      // サンプル行でのデバッグ（最初の1行のみ）
      if (data.length > 0) {
        console.log('🔍 MemoryDataStore: Sample row keys:', Object.keys(data[0]))
        console.log('🔍 MemoryDataStore: Sample row first few values:', 
          Object.entries(data[0]).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')
        )
      }
      
      const filteredData = data.filter(row => this.evaluateWhereCondition(row, whereClause))
      
      data = filteredData
      console.log('🔍 MemoryDataStore: Filtered data length:', data.length)
    }

    // ORDER BY句を解析・適用
    const orderMatch = sql.match(/ORDER\s+BY\s+"?([^"\s]+)"?\s+(ASC|DESC)?/i)
    if (orderMatch) {
      const orderColumn = orderMatch[1]
      const orderDirection = (orderMatch[2] || 'ASC').toUpperCase()
      
      // カラムの型情報を取得
      const columnInfo = table.columns.find(col => col.name === orderColumn)
      const isNumericColumn = columnInfo && (
        columnInfo.type.includes('INT') ||
        columnInfo.type.includes('FLOAT') ||
        columnInfo.type.includes('DOUBLE') ||
        columnInfo.type.includes('DECIMAL') ||
        columnInfo.type.includes('NUMBER')
      )
      const isDateColumn = columnInfo && (
        columnInfo.type.includes('DATE') ||
        columnInfo.type.includes('TIME') ||
        columnInfo.type.includes('TIMESTAMP')
      )
      
      console.log('🔄 MemoryDataStore: Applying ORDER BY:', orderColumn, orderDirection)
      console.log('📊 Column info:', { name: orderColumn, type: columnInfo?.type, isNumeric: isNumericColumn, isDate: isDateColumn })
      console.log('📊 Available columns:', table.columns.map(c => ({name: c.name, type: c.type})))
      console.log('📋 Sample data before sort:', data.slice(0, 3).map(row => ({ [orderColumn]: row[orderColumn] })))
      
      data = data.sort((a, b) => {
        const aValue = a[orderColumn]
        const bValue = b[orderColumn]
        
        // 最初の数件だけ詳細ログを出力
        if (data.indexOf(a) < 5 || data.indexOf(b) < 5) {
          console.log('🔍 Sorting values:', { aValue, bValue, aType: typeof aValue, bType: typeof bValue })
        }
        
        // null/undefined チェック
        if (aValue == null && bValue == null) return 0
        if (aValue == null) return orderDirection === 'ASC' ? -1 : 1
        if (bValue == null) return orderDirection === 'ASC' ? 1 : -1
        
        // DATEカラムの場合は日付として処理
        if (isDateColumn) {
          // 各種日付フォーマットに対応
          const parseDate = (value: any): Date => {
            if (value instanceof Date) return value
            
            const strValue = String(value).trim()
            
            // 空の値の場合
            if (!strValue || strValue === 'null' || strValue === 'undefined') {
              return new Date(NaN)
            }
            
            // ISO形式、標準的な日付形式を試す
            let date = new Date(strValue)
            if (!isNaN(date.getTime())) return date
            
            // 日本式日付フォーマットを試す (YYYY/MM/DD, YYYY-MM-DD)
            const jpFormats = [
              /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
              /^(\d{4})-(\d{1,2})-(\d{1,2})$/
            ]
            
            for (const format of jpFormats) {
              const match = strValue.match(format)
              if (match) {
                const [, year, month, day] = match
                date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                if (!isNaN(date.getTime())) return date
              }
            }
            
            return new Date(NaN)
          }
          
          const aDate = parseDate(aValue)
          const bDate = parseDate(bValue)
          
          console.log('📅 Date sort:', { 
            aValue, bValue, 
            aDate: isNaN(aDate.getTime()) ? 'Invalid' : aDate.toISOString(), 
            bDate: isNaN(bDate.getTime()) ? 'Invalid' : bDate.toISOString(), 
            direction: orderDirection 
          })
          
          // Invalid Dateの場合の処理
          const aValid = !isNaN(aDate.getTime())
          const bValid = !isNaN(bDate.getTime())
          
          if (!aValid && !bValid) return 0
          if (!aValid) return orderDirection === 'ASC' ? 1 : -1  // Invalidは最後に
          if (!bValid) return orderDirection === 'ASC' ? -1 : 1
          
          const aTime = aDate.getTime()
          const bTime = bDate.getTime()
          
          return orderDirection === 'ASC' ? aTime - bTime : bTime - aTime
        }
        
        // 数値カラムの場合は強制的に数値として処理（DATEカラムは除く）
        if (isNumericColumn && !isDateColumn) {
          const aNum = typeof aValue === 'number' ? aValue : parseFloat(String(aValue))
          const bNum = typeof bValue === 'number' ? bValue : parseFloat(String(bValue))
          
          console.log('🔢 Forced numeric sort (column type):', { aNum, bNum, direction: orderDirection })
          
          // NaNの場合の処理
          if (isNaN(aNum) && isNaN(bNum)) return 0
          if (isNaN(aNum)) return orderDirection === 'ASC' ? -1 : 1
          if (isNaN(bNum)) return orderDirection === 'ASC' ? 1 : -1
          
          return orderDirection === 'ASC' ? aNum - bNum : bNum - aNum
        }
        
        // フォールバック: 日付の可能性を確認
        const looksLikeDate = (value: any): boolean => {
          const str = String(value).trim()
          return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(str) || 
                 /^\d{4}\/\d{2}\/\d{2}/.test(str) ||
                 /^\d{4}年\d{1,2}月\d{1,2}日(\s+\d{1,2}時\d{1,2}分\d{1,2}秒?)?/.test(str)  // 日本語形式（時分秒含む）
        }
        
        if (looksLikeDate(aValue) || looksLikeDate(bValue)) {
          // 日付として処理
          const parseJapaneseDate = (value: any): Date => {
            const str = String(value).trim()
            
            // 日本語形式の場合：2025年07月06日 09時00分00秒
            const jpMatch = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分(\d{1,2})秒?/)
            if (jpMatch) {
              const [, year, month, day, hour, minute, second] = jpMatch
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour || '0'), parseInt(minute || '0'), parseInt(second || '0'))
              console.log('🇯🇵 Japanese date parsed:', { input: str, output: date.toISOString(), year, month, day, hour, minute, second })
              return date
            }
            
            // 日本語形式（日付のみ）：2025年07月06日
            const jpDateMatch = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/)
            if (jpDateMatch) {
              const [, year, month, day] = jpDateMatch
              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
              console.log('🇯🇵 Japanese date only parsed:', { input: str, output: date.toISOString() })
              return date
            }
            
            // その他の形式は標準のDateコンストラクタで処理
            const standardDate = new Date(value)
            console.log('📅 Standard date parse:', { input: str, output: standardDate.toISOString() })
            return standardDate
          }
          
          const aDate = parseJapaneseDate(aValue)
          const bDate = parseJapaneseDate(bValue)
          
          console.log('📅 Fallback date sort:', { 
            aValue, bValue, 
            aDate: isNaN(aDate.getTime()) ? 'Invalid' : aDate.toISOString(), 
            bDate: isNaN(bDate.getTime()) ? 'Invalid' : bDate.toISOString(), 
            direction: orderDirection 
          })
          
          const aValid = !isNaN(aDate.getTime())
          const bValid = !isNaN(bDate.getTime())
          
          if (!aValid && !bValid) return 0
          if (!aValid) return orderDirection === 'ASC' ? 1 : -1
          if (!bValid) return orderDirection === 'ASC' ? -1 : 1
          
          const aTime = aDate.getTime()
          const bTime = bDate.getTime()
          
          return orderDirection === 'ASC' ? aTime - bTime : bTime - aTime
        }
        
        // 数値比較（カラム型が不明の場合のフォールバック）
        const aNum = typeof aValue === 'number' ? aValue : parseFloat(aValue)
        const bNum = typeof bValue === 'number' ? bValue : parseFloat(bValue)
        
        // 両方が有効な数値の場合
        if (!isNaN(aNum) && !isNaN(bNum)) {
          console.log('🔢 Auto-detected numeric sort:', { aNum, bNum, direction: orderDirection })
          return orderDirection === 'ASC' ? aNum - bNum : bNum - aNum
        }
        
        // 文字列比較
        const aStr = String(aValue)
        const bStr = String(bValue)
        console.log('🔤 String sort:', { aStr, bStr, direction: orderDirection })
        const comparison = aStr.localeCompare(bStr)
        return orderDirection === 'ASC' ? comparison : -comparison
      })
      
      console.log('✅ MemoryDataStore: Data sorted by', orderColumn, orderDirection)
      console.log('📋 Sample data after sort:', data.slice(0, 5).map(row => ({ [orderColumn]: row[orderColumn] })))
    }

    // LIMIT句を解析
    const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i)
    let limit = data.length
    let offset = 0
    
    if (limitMatch) {
      limit = parseInt(limitMatch[1])
      offset = limitMatch[2] ? parseInt(limitMatch[2]) : 0
    }

    // COUNT(*)クエリの場合はカウントを返す
    if (sql.toUpperCase().includes('COUNT(*)')) {
      return [{ count: data.length }]
    }
    
    // データを返す
    const result = data.slice(offset, offset + limit)
    
    // ソートが適用された場合の最終結果を確認
    if (orderMatch) {
      const orderColumn = orderMatch[1]
      console.log('🔍 Final result sample:', result.slice(0, 5).map((row, index) => ({
        index,
        [orderColumn]: row[orderColumn],
        type: typeof row[orderColumn]
      })))
    }
    
    return result
  }

  private executeDescribe(sql: string): any[] {
    // DESCRIBE文からテーブル名を抽出（引用符対応、日本語文字対応）
    // 引用符で囲まれたテーブル名と通常のテーブル名の両方に対応
    let match = sql.match(/DESCRIBE\s+"([^"]+)"/i) // 引用符で囲まれたテーブル名
    if (!match) {
      // 引用符なしのテーブル名（ハイフン、ドット、日本語文字を含む）
      match = sql.match(/DESCRIBE\s+([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\-\.]+)/i)
    }
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
      
      // ブール値チェック（真のブール値のみ）
      if (strValue.toLowerCase() === 'true' || strValue.toLowerCase() === 'false') {
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
      // ISO形式（YYYY-MM-DDTHH:MM:SS）、標準日付形式、日本語形式など
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(strValue) || 
          /^\d{2}\/\d{2}\/\d{4}/.test(strValue) ||
          /^\d{4}\/\d{2}\/\d{2}/.test(strValue) ||
          /^\d{4}-\d{1,2}-\d{1,2}/.test(strValue) ||
          /^\d{4}年\d{1,2}月\d{1,2}日(\s+\d{1,2}時\d{1,2}分\d{1,2}秒?)?/.test(strValue)) {
        try {
          let date: Date
          // 日本語形式の場合は専用パーサーを使用
          if (/^\d{4}年\d{1,2}月\d{1,2}日/.test(strValue)) {
            const jpMatch = strValue.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(\s+(\d{1,2})時(\d{1,2})分(\d{1,2})秒?)?/)
            if (jpMatch) {
              const [, year, month, day, , hour, minute, second] = jpMatch
              date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour || '0'), parseInt(minute || '0'), parseInt(second || '0'))
            } else {
              date = new Date(strValue)
            }
          } else {
            date = new Date(strValue)
          }
          
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

  // フィルター対応のカウント関数を追加
  getFilteredTableCount(tableName: string, whereClause: string): number {
    const table = this.tables.get(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} does not exist`)
    }
    
    if (!whereClause) {
      return table.data.length
    }
    
    return table.data.filter(row => this.evaluateWhereCondition(row, whereClause)).length
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

  private evaluateWhereCondition(row: any, whereClause: string): boolean {
    // 基本的な条件を解析
    // 現在は簡単な条件のみサポート（column = value, column != value, column IS NULL, etc.）
    
    // NULL条件の処理
    if (whereClause.includes('IS NULL')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+IS\s+NULL/i)
      if (match) {
        const columnName = match[1]
        return row[columnName] === null || row[columnName] === undefined
      }
    }
    
    if (whereClause.includes('IS NOT NULL')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+IS\s+NOT\s+NULL/i)
      if (match) {
        const columnName = match[1]
        return row[columnName] !== null && row[columnName] !== undefined
      }
    }
    
    // 等価条件の処理
    if (whereClause.includes('=')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*=\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        
        // console.log('🔍 MemoryDataStore: Evaluating condition:', { columnName, value, rowValue: row[columnName] })
        
        // Boolean値の処理
        if (value === 'TRUE' || value === 'true') {
          return row[columnName] === true
        }
        if (value === 'FALSE' || value === 'false') {
          return row[columnName] === false
        }
        
        // 数値の処理
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(row[columnName])
          return !isNaN(numericRowValue) && numericRowValue === numericValue
        }
        
        // 文字列の処理（クォートを除去）
        const stringValue = value.replace(/^'|'$/g, '')
        return row[columnName] === stringValue
      }
    }
    
    // 不等価条件の処理
    if (whereClause.includes('!=') || whereClause.includes('<>')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*(?:!=|<>)\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        
        // Boolean値の処理
        if (value === 'TRUE' || value === 'true') {
          return row[columnName] !== true
        }
        if (value === 'FALSE' || value === 'false') {
          return row[columnName] !== false
        }
        
        // 数値の処理
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(row[columnName])
          return !isNaN(numericRowValue) && numericRowValue !== numericValue
        }
        
        // 文字列の処理（クォートを除去）
        const stringValue = value.replace(/^'|'$/g, '')
        return row[columnName] !== stringValue
      }
    }
    
    // 大小比較条件の処理
    if (whereClause.includes('>=')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*>=\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        const rowValue = row[columnName]
        
        // console.log('🔍 MemoryDataStore: >= comparison:', { columnName, value, rowValue })
        
        // 数値比較
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(rowValue)
          return !isNaN(numericRowValue) && numericRowValue >= numericValue
        }
        
        // 文字列比較
        const stringValue = value.replace(/^'|'$/g, '')
        return String(rowValue) >= stringValue
      }
    }
    
    if (whereClause.includes('<=')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*<=\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        const rowValue = row[columnName]
        
        // console.log('🔍 MemoryDataStore: <= comparison:', { columnName, value, rowValue })
        
        // 数値比較
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(rowValue)
          return !isNaN(numericRowValue) && numericRowValue <= numericValue
        }
        
        // 文字列比較
        const stringValue = value.replace(/^'|'$/g, '')
        return String(rowValue) <= stringValue
      }
    }
    
    if (whereClause.includes('>') && !whereClause.includes('>=')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*>\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        const rowValue = row[columnName]
        
        // console.log('🔍 MemoryDataStore: > comparison:', { columnName, value, rowValue })
        
        // 数値比較
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(rowValue)
          return !isNaN(numericRowValue) && numericRowValue > numericValue
        }
        
        // 文字列比較
        const stringValue = value.replace(/^'|'$/g, '')
        return String(rowValue) > stringValue
      }
    }
    
    if (whereClause.includes('<') && !whereClause.includes('<=')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s*<\s*(.+)/)
      if (match) {
        const columnName = match[1]
        const value = match[2].trim()
        const rowValue = row[columnName]
        
        // console.log('🔍 MemoryDataStore: < comparison:', { columnName, value, rowValue })
        
        // 数値比較
        if (/^-?\d+(\.\d+)?$/.test(value)) {
          const numericValue = parseFloat(value)
          const numericRowValue = parseFloat(rowValue)
          return !isNaN(numericRowValue) && numericRowValue < numericValue
        }
        
        // 文字列比較
        const stringValue = value.replace(/^'|'$/g, '')
        return String(rowValue) < stringValue
      }
    }
    
    // LIKE条件の処理
    if (whereClause.includes('LIKE')) {
      // カラム名の抽出（日本語文字対応）
      const match = whereClause.match(/([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)\s+LIKE\s+'(.+)'/i)
      if (match) {
        const columnName = match[1]
        const pattern = match[2]
        const value = String(row[columnName] || '')
        
        // 簡単なパターンマッチング（%を.*に変換）
        const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.')
        const regex = new RegExp(regexPattern, 'i')
        return regex.test(value)
      }
    }
    
    // その他の条件（今後拡張）
    console.warn('🔍 MemoryDataStore: Unsupported WHERE condition:', whereClause)
    return true
  }
}

// シングルトンインスタンス
const memoryDataStore = new MemoryDataStore()

export { memoryDataStore }