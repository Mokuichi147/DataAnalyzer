import { useState } from 'react'
import { Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useDataStore, DataFilter } from '@/store/dataStore'

interface FilterPanelProps {
  columns: Array<{
    name: string
    type: string
    nullable: boolean
  }>
  isOpen: boolean
  onToggle: () => void
}

export function FilterPanel({ columns, isOpen, onToggle }: FilterPanelProps) {
  const { filters, addFilter, removeFilter, updateFilter, toggleFilter, clearFilters } = useDataStore()
  const [newFilter, setNewFilter] = useState<Partial<DataFilter>>({
    columnName: '',
    operator: 'equals',
    value: null,
    isActive: true,
    columnType: 'TEXT'
  })

  const getOperatorOptions = (columnType: string) => {
    const baseOptions = [
      { value: 'equals', label: '等しい' },
      { value: 'not_equals', label: '等しくない' },
      { value: 'is_null', label: 'NULL' },
      { value: 'is_not_null', label: 'NULL以外' }
    ]

    if (columnType === 'INTEGER' || columnType === 'FLOAT' || columnType === 'NUMERIC') {
      return [
        ...baseOptions,
        { value: 'greater_than', label: '大于' },
        { value: 'less_than', label: '小于' },
        { value: 'greater_equal', label: '大于等于' },
        { value: 'less_equal', label: '小于等于' },
        { value: 'in', label: '包含于' },
        { value: 'not_in', label: '不包含于' }
      ]
    }

    if (columnType === 'TEXT' || columnType === 'VARCHAR') {
      return [
        ...baseOptions,
        { value: 'contains', label: '包含' },
        { value: 'not_contains', label: '不包含' },
        { value: 'starts_with', label: '开头是' },
        { value: 'ends_with', label: '结尾是' },
        { value: 'in', label: '包含于' },
        { value: 'not_in', label: '不包含于' }
      ]
    }

    return baseOptions
  }

  const handleColumnChange = (columnName: string) => {
    const column = columns.find(col => col.name === columnName)
    setNewFilter({
      ...newFilter,
      columnName,
      columnType: column?.type || 'TEXT',
      operator: 'equals',
      value: null,
      values: undefined
    })
  }

  const handleOperatorChange = (operator: string) => {
    setNewFilter({
      ...newFilter,
      operator: operator as DataFilter['operator'],
      value: operator === 'is_null' || operator === 'is_not_null' ? null : null,
      values: operator === 'in' || operator === 'not_in' ? [] : undefined
    })
  }

  const handleValueChange = (value: string) => {
    const column = columns.find(col => col.name === newFilter.columnName)
    const columnType = column?.type || 'TEXT'
    
    let processedValue: string | number | boolean | null = value

    if (columnType === 'INTEGER') {
      processedValue = value === '' ? null : parseInt(value, 10)
    } else if (columnType === 'FLOAT' || columnType === 'NUMERIC') {
      processedValue = value === '' ? null : parseFloat(value)
    } else if (columnType === 'BOOLEAN') {
      processedValue = value === 'true'
    } else {
      // TEXT型の場合、空文字列は空文字列として扱う
      processedValue = value
    }

    console.log('🔍 Value change:', { 
      originalValue: value,
      processedValue, 
      columnType,
      columnName: newFilter.columnName 
    })

    setNewFilter({
      ...newFilter,
      value: processedValue
    })
  }

  const handleValuesChange = (values: string) => {
    const column = columns.find(col => col.name === newFilter.columnName)
    const columnType = column?.type || 'TEXT'
    
    const valueArray = values.split(',').map(v => v.trim()).filter(v => v !== '')
    
    let processedValues: (string | number)[] = valueArray

    if (columnType === 'INTEGER') {
      processedValues = valueArray.map(v => parseInt(v, 10)).filter(v => !isNaN(v))
    } else if (columnType === 'FLOAT' || columnType === 'NUMERIC') {
      processedValues = valueArray.map(v => parseFloat(v)).filter(v => !isNaN(v))
    }

    setNewFilter({
      ...newFilter,
      values: processedValues
    })
  }

  const handleAddFilter = () => {
    if (newFilter.columnName && newFilter.operator) {
      console.log('🔍 Adding filter:', {
        columnName: newFilter.columnName,
        operator: newFilter.operator,
        value: newFilter.value,
        values: newFilter.values,
        columnType: newFilter.columnType
      })
      
      addFilter({
        columnName: newFilter.columnName!,
        operator: newFilter.operator!,
        value: newFilter.value!,
        values: newFilter.values,
        isActive: true,
        columnType: newFilter.columnType || 'TEXT'
      })
      setNewFilter({
        columnName: '',
        operator: 'equals',
        value: null,
        isActive: true,
        columnType: 'TEXT'
      })
    }
  }

  const renderValueInput = (filter: DataFilter, isNew: boolean = false) => {
    const filterData = isNew ? newFilter : filter
    const handleChange = isNew ? handleValueChange : (value: string) => {
      const column = columns.find(col => col.name === filter.columnName)
      const columnType = column?.type || 'TEXT'
      
      let processedValue: string | number | boolean | null = value

      if (columnType === 'INTEGER') {
        processedValue = value === '' ? null : parseInt(value, 10)
      } else if (columnType === 'FLOAT' || columnType === 'NUMERIC') {
        processedValue = value === '' ? null : parseFloat(value)
      } else if (columnType === 'BOOLEAN') {
        processedValue = value === 'true'
      } else {
        // TEXT型の場合、空文字列は空文字列として扱う
        processedValue = value
      }

      updateFilter(filter.id, { value: processedValue })
    }

    if (filterData.operator === 'is_null' || filterData.operator === 'is_not_null') {
      return null
    }

    if (filterData.operator === 'in' || filterData.operator === 'not_in') {
      return (
        <input
          type="text"
          placeholder="値1,値2,値3"
          value={filterData.values?.join(',') || ''}
          onChange={(e) => isNew ? handleValuesChange(e.target.value) : updateFilter(filter.id, {
            values: e.target.value.split(',').map(v => v.trim()).filter(v => v !== '')
          })}
          className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
        />
      )
    }

    const column = columns.find(col => col.name === filterData.columnName)
    const columnType = column?.type || 'TEXT'

    if (columnType === 'BOOLEAN') {
      return (
        <select
          value={filterData.value === true ? 'true' : filterData.value === false ? 'false' : ''}
          onChange={(e) => handleChange(e.target.value)}
          className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
        >
          <option value="">選択...</option>
          <option value="true">TRUE</option>
          <option value="false">FALSE</option>
        </select>
      )
    }

    return (
      <input
        type={columnType === 'INTEGER' || columnType === 'FLOAT' || columnType === 'NUMERIC' ? 'number' : 'text'}
        placeholder="値を入力"
        value={filterData.value === null || filterData.value === undefined ? '' : String(filterData.value)}
        onChange={(e) => handleChange(e.target.value)}
        className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
      />
    )
  }

  const activeFilters = filters.filter(f => f.isActive)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 transition-colors">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">フィルター</h3>
          {activeFilters.length > 0 && (
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs">
              {activeFilters.length}
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </div>

      {isOpen && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {/* 新しいフィルターの追加 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <select
              value={newFilter.columnName}
              onChange={(e) => handleColumnChange(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
            >
              <option value="">カラム選択...</option>
              {columns.map(col => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.type})
                </option>
              ))}
            </select>

            <select
              value={newFilter.operator}
              onChange={(e) => handleOperatorChange(e.target.value)}
              disabled={!newFilter.columnName}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors disabled:opacity-50"
            >
              {getOperatorOptions(newFilter.columnType || 'TEXT').map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            <div className="flex items-center space-x-2">
              {renderValueInput(newFilter as DataFilter, true)}
            </div>

            <button
              onClick={handleAddFilter}
              disabled={!newFilter.columnName || !newFilter.operator}
              className="flex items-center justify-center px-3 py-1 bg-blue-600 dark:bg-blue-700 text-white rounded text-sm hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1" />
              追加
            </button>
          </div>

          {/* 既存のフィルター */}
          <div className="space-y-2">
            {filters.map(filter => (
              <div key={filter.id} className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <input
                  type="checkbox"
                  checked={filter.isActive}
                  onChange={() => toggleFilter(filter.id)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {filter.columnName}
                </span>
                <select
                  value={filter.operator}
                  onChange={(e) => updateFilter(filter.id, { operator: e.target.value as DataFilter['operator'] })}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors"
                >
                  {getOperatorOptions(filter.columnType).map(op => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {renderValueInput(filter)}
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {filters.length > 0 && (
            <div className="flex justify-end pt-2">
              <button
                onClick={clearFilters}
                className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                すべてクリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}