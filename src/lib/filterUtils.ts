import { DataFilter } from '@/store/dataStore'

export function buildFilterClause(filters: DataFilter[]): string {
  const activeFilters = filters.filter(f => f.isActive)
  
  console.log('🔍 Building filter clause:', { 
    totalFilters: filters.length, 
    activeFilters: activeFilters.length,
    filters: activeFilters
  })
  
  if (activeFilters.length === 0) {
    return ''
  }

  const conditions = activeFilters.map(filter => {
    const columnName = filter.columnName
    const operator = filter.operator
    const value = filter.value
    const values = filter.values

    console.log('🔍 Processing filter:', { columnName, operator, value, columnType: filter.columnType })

    switch (operator) {
      case 'equals':
        if (value === null || value === undefined) {
          return `${columnName} IS NULL`
        }
        if (value === '') {
          return `${columnName} = ''`
        }
        return `${columnName} = ${formatValue(value, filter.columnType)}`
      
      case 'not_equals':
        if (value === null || value === undefined) {
          return `${columnName} IS NOT NULL`
        }
        if (value === '') {
          return `${columnName} != ''`
        }
        return `${columnName} != ${formatValue(value, filter.columnType)}`
      
      case 'greater_than':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} > ${formatValue(value, filter.columnType)}`
      
      case 'less_than':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} < ${formatValue(value, filter.columnType)}`
      
      case 'greater_equal':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} >= ${formatValue(value, filter.columnType)}`
      
      case 'less_equal':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} <= ${formatValue(value, filter.columnType)}`
      
      case 'contains':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} LIKE '%${escapeString(String(value))}%'`
      
      case 'not_contains':
        if (value === null || value === undefined || value === '') {
          return '1=1' // 常に true
        }
        return `${columnName} NOT LIKE '%${escapeString(String(value))}%'`
      
      case 'starts_with':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} LIKE '${escapeString(String(value))}%'`
      
      case 'ends_with':
        if (value === null || value === undefined || value === '') {
          return '1=0' // 常に false
        }
        return `${columnName} LIKE '%${escapeString(String(value))}'`
      
      case 'is_null':
        return `${columnName} IS NULL`
      
      case 'is_not_null':
        return `${columnName} IS NOT NULL`
      
      case 'in':
        if (!values || values.length === 0) {
          return '1=0' // 常に false
        }
        const inValues = values.map(v => formatValue(v, filter.columnType)).join(', ')
        return `${columnName} IN (${inValues})`
      
      case 'not_in':
        if (!values || values.length === 0) {
          return '1=1' // 常に true
        }
        const notInValues = values.map(v => formatValue(v, filter.columnType)).join(', ')
        return `${columnName} NOT IN (${notInValues})`
      
      default:
        return '1=1' // 常に true
    }
  })

  const result = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  console.log('🔍 Generated filter clause:', result)
  return result
}

function formatValue(value: string | number | boolean | null, columnType: string): string {
  // console.log('🔍 Formatting value:', { value, columnType, valueType: typeof value })
  
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (columnType === 'INTEGER' || columnType === 'FLOAT' || columnType === 'NUMERIC') {
    return String(value)
  }

  if (columnType === 'BOOLEAN') {
    return value ? 'TRUE' : 'FALSE'
  }

  // TEXT, VARCHAR などの文字列型
  const result = `'${escapeString(String(value))}'`
  console.log('🔍 Formatted value:', result)
  return result
}

function escapeString(str: string): string {
  return str.replace(/'/g, "''")
}

export function buildMemoryFilterFunction(filters: DataFilter[]): (row: any) => boolean {
  const activeFilters = filters.filter(f => f.isActive)
  
  if (activeFilters.length === 0) {
    return () => true
  }

  return (row: any) => {
    return activeFilters.every(filter => {
      const columnValue = row[filter.columnName]
      const operator = filter.operator
      const value = filter.value
      const values = filter.values

      switch (operator) {
        case 'equals':
          if (value === null || value === undefined || value === '') {
            return columnValue === null || columnValue === undefined || columnValue === ''
          }
          return columnValue === value
        
        case 'not_equals':
          if (value === null || value === undefined || value === '') {
            return columnValue !== null && columnValue !== undefined && columnValue !== ''
          }
          return columnValue !== value
        
        case 'greater_than':
          return Number(columnValue) > Number(value)
        
        case 'less_than':
          return Number(columnValue) < Number(value)
        
        case 'greater_equal':
          return Number(columnValue) >= Number(value)
        
        case 'less_equal':
          return Number(columnValue) <= Number(value)
        
        case 'contains':
          return String(columnValue).includes(String(value))
        
        case 'not_contains':
          return !String(columnValue).includes(String(value))
        
        case 'starts_with':
          return String(columnValue).startsWith(String(value))
        
        case 'ends_with':
          return String(columnValue).endsWith(String(value))
        
        case 'is_null':
          return columnValue === null || columnValue === undefined
        
        case 'is_not_null':
          return columnValue !== null && columnValue !== undefined
        
        case 'in':
          if (!values || values.length === 0) {
            return false
          }
          return values.includes(columnValue)
        
        case 'not_in':
          if (!values || values.length === 0) {
            return true
          }
          return !values.includes(columnValue)
        
        default:
          return true
      }
    })
  }
}