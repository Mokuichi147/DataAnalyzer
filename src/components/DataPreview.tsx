import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Eye, Filter, Download, RefreshCw } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useRealtimeStore } from '@/store/realtimeStore'
import { getTableData, getTableInfo, getTableCount, executeQuery } from '@/lib/duckdb'

interface DataPreviewProps {
  tableName: string
}

export function DataPreview({ tableName }: DataPreviewProps) {
  const [data, setData] = useState<any[]>([])
  const [columns, setColumns] = useState<any[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [isLoading, setIsLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const { filters, setLoading, setError } = useDataStore()
  const { settings: realtimeSettings } = useRealtimeStore()

  const loadData = async () => {
    if (!tableName) return
    
    setIsLoading(true)
    try {
      console.log('Loading data for table:', tableName)
      
      // テーブル情報を取得
      const tableInfo = await getTableInfo(tableName)
      console.log('Table info:', tableInfo)
      setColumns(tableInfo)
      
      // 総行数を取得
      const count = await getTableCount(tableName)
      console.log('Row count:', count)
      setTotalRows(count)
      
      // データを取得（フィルタ適用）
      let query = `SELECT * FROM ${tableName}`
      const activeFilters = filters.filter(f => f.isActive)
      
      if (activeFilters.length > 0) {
        const whereClause = activeFilters.map(filter => {
          switch (filter.operator) {
            case 'equals':
              return `${filter.column} = '${filter.value}'`
            case 'contains':
              return `${filter.column} LIKE '%${filter.value}%'`
            case 'greater':
              return `${filter.column} > ${filter.value}`
            case 'less':
              return `${filter.column} < ${filter.value}`
            case 'between':
              return `${filter.column} BETWEEN ${filter.value.min} AND ${filter.value.max}`
            case 'in':
              return `${filter.column} IN (${filter.value.map((v: any) => `'${v}'`).join(', ')})`
            default:
              return ''
          }
        }).filter(Boolean).join(' AND ')
        
        query += ` WHERE ${whereClause}`
      }
      
      query += ` LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}`
      console.log('Executing query:', query)
      
      const result = await executeQuery(query)
      console.log('Query result:', result)
      setData(result)
      
    } catch (error) {
      console.error('Error loading data:', error)
      setError(error instanceof Error ? error.message : 'データの読み込みに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [tableName, currentPage, pageSize, filters])

  // リアルタイム更新のリスナー
  useEffect(() => {
    if (!realtimeSettings.autoRefresh) return

    const handleDataChange = (event: CustomEvent) => {
      const { tableName: changedTable } = event.detail
      if (changedTable === tableName) {
        loadData()
        setLastRefresh(new Date())
      }
    }

    window.addEventListener('dataChanged', handleDataChange as EventListener)
    return () => {
      window.removeEventListener('dataChanged', handleDataChange as EventListener)
    }
  }, [tableName, realtimeSettings.autoRefresh])

  const totalPages = Math.ceil(totalRows / pageSize)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const handleManualRefresh = () => {
    loadData()
    setLastRefresh(new Date())
  }

  const exportData = async () => {
    try {
      setLoading(true)
      let query = `SELECT * FROM ${tableName}`
      
      const activeFilters = filters.filter(f => f.isActive)
      if (activeFilters.length > 0) {
        const whereClause = activeFilters.map(filter => {
          switch (filter.operator) {
            case 'equals':
              return `${filter.column} = '${filter.value}'`
            case 'contains':
              return `${filter.column} LIKE '%${filter.value}%'`
            case 'greater':
              return `${filter.column} > ${filter.value}`
            case 'less':
              return `${filter.column} < ${filter.value}`
            default:
              return ''
          }
        }).filter(Boolean).join(' AND ')
        
        query += ` WHERE ${whereClause}`
      }
      
      const result = await executeQuery(query)
      
      // CSVとしてダウンロード
      const csvContent = [
        columns.map(col => col.column_name).join(','),
        ...result.map(row => 
          columns.map(col => row[col.column_name]).join(',')
        )
      ].join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tableName}_export.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'エクスポートに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (!tableName) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Eye className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p>テーブルを選択してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー部分：モバイル対応 */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
            <h3 className="text-lg font-medium text-gray-900 break-words">
              データプレビュー: {tableName}
            </h3>
            <span className="text-sm text-gray-500">
              {totalRows.toLocaleString()} 件のデータ
            </span>
            {realtimeSettings.autoRefresh && (
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                <span>リアルタイム更新</span>
              </div>
            )}
            <span className="text-xs text-gray-400">
              最終更新: {lastRefresh.toLocaleTimeString()}
            </span>
          </div>
          
          {/* ボタン群：モバイルでは縦並び、デスクトップでは横並び */}
          <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2 sm:gap-0">
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center px-3 py-2 rounded-md text-sm ${
                showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Filter className="h-4 w-4 mr-1" />
              フィルタ
            </button>
            <button
              onClick={exportData}
              className="flex items-center justify-center px-3 py-2 bg-green-100 text-green-700 rounded-md text-sm hover:bg-green-200"
            >
              <Download className="h-4 w-4 mr-1" />
              エクスポート
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <FilterPanel columns={columns} tableName={tableName} />
      )}

      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.column_name}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        <div>
                          <div className="font-medium">{col.column_name}</div>
                          <div className="text-xs text-gray-400">{col.column_type}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      {columns.map((col) => (
                        <td
                          key={col.column_name}
                          className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate"
                        >
                          {row[col.column_name] !== null && row[col.column_name] !== undefined
                            ? String(row[col.column_name])
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ページネーション：モバイル対応 */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-700 whitespace-nowrap">表示件数:</label>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm min-w-0"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center justify-center px-3 py-1 border border-gray-300 rounded disabled:opacity-50 min-w-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <span className="text-sm text-gray-700 whitespace-nowrap">
                {currentPage} / {totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center justify-center px-3 py-1 border border-gray-300 rounded disabled:opacity-50 min-w-0"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface FilterPanelProps {
  columns: any[]
  tableName: string
}

function FilterPanel({ columns, tableName }: FilterPanelProps) {
  const { filters, addFilter, removeFilter, toggleFilter, clearFilters } = useDataStore()
  const [newFilter, setNewFilter] = useState({
    column: '',
    operator: 'equals' as const,
    value: ''
  })

  const handleAddFilter = () => {
    if (newFilter.column && newFilter.value) {
      addFilter(newFilter)
      setNewFilter({ column: '', operator: 'equals', value: '' })
    }
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h4 className="font-medium text-gray-900 mb-3">フィルタ設定</h4>
      
      {/* フィルタ追加フォーム：モバイル対応 */}
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={newFilter.column}
            onChange={(e) => setNewFilter({ ...newFilter, column: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md w-full"
          >
            <option value="">カラムを選択</option>
            {columns.map((col) => (
              <option key={col.column_name} value={col.column_name}>
                {col.column_name}
              </option>
            ))}
          </select>
          
          <select
            value={newFilter.operator}
            onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 rounded-md w-full"
          >
            <option value="equals">等しい</option>
            <option value="contains">含む</option>
            <option value="greater">より大きい</option>
            <option value="less">より小さい</option>
          </select>
          
          <input
            type="text"
            value={newFilter.value}
            onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
            placeholder="値を入力"
            className="px-3 py-2 border border-gray-300 rounded-md w-full"
          />
          
          <button
            onClick={handleAddFilter}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 w-full sm:w-auto"
          >
            追加
          </button>
        </div>
      </div>
      
      {filters.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">適用中のフィルタ:</span>
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:text-red-800"
            >
              すべて削除
            </button>
          </div>
          
          {filters.map((filter, index) => (
            <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded border gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <input
                  type="checkbox"
                  checked={filter.isActive}
                  onChange={() => toggleFilter(index)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded flex-shrink-0"
                />
                <span className="text-sm break-words">
                  {filter.column} {filter.operator} {filter.value}
                </span>
              </div>
              <button
                onClick={() => removeFilter(index)}
                className="text-red-600 hover:text-red-800 text-sm self-start sm:self-auto flex-shrink-0"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}