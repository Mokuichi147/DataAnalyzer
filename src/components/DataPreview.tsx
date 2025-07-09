import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Eye, Download, RefreshCw } from 'lucide-react'
import { useRealtimeStore } from '@/store/realtimeStore'
import { getTableInfo, getTableCount, executeQuery } from '@/lib/duckdb'

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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
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
      
      // データを取得
      const query = `SELECT * FROM ${tableName} LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}`
      console.log('Executing query:', query)
      
      const result = await executeQuery(query)
      console.log('Query result:', result)
      setData(result)
      
    } catch (error) {
      console.error('Error loading data:', error)
      // Remove setError call since we no longer import useDataStore
      console.error('データの読み込みに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [tableName, currentPage, pageSize])

  // リアルタイム更新のリスナー
  useEffect(() => {
    const handleDataChange = (event: CustomEvent) => {
      console.log('🔄 DataPreview: dataChanged event received:', event.detail)
      const { tableName: changedTable } = event.detail
      if (changedTable === tableName) {
        console.log('✅ DataPreview: Reloading data for table:', changedTable)
        loadData()
        setLastRefresh(new Date())
      } else {
        console.log('❌ DataPreview: Table mismatch:', { current: tableName, changed: changedTable })
      }
    }

    console.log('🎧 DataPreview: Setting up dataChanged listener for table:', tableName)
    window.addEventListener('dataChanged', handleDataChange as EventListener)
    return () => {
      console.log('🔇 DataPreview: Removing dataChanged listener for table:', tableName)
      window.removeEventListener('dataChanged', handleDataChange as EventListener)
    }
  }, [tableName])

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
      const query = `SELECT * FROM ${tableName}`
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
      console.error('エクスポートに失敗しました:', error)
    }
  }

  if (!tableName) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-colors">
        <Eye className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        <p>テーブルを選択してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 transition-colors">
      {/* ヘッダー部分：モバイル対応 */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white break-words transition-colors">
              データプレビュー: {tableName}
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400 transition-colors">
              {totalRows.toLocaleString()} 件のデータ
            </span>
            {realtimeSettings.autoRefresh && (
              <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400 transition-colors">
                <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></div>
                <span>リアルタイム更新</span>
              </div>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 transition-colors">
              最終更新: {lastRefresh.toLocaleTimeString()}
            </span>
          </div>
          
          {/* ボタン群：モバイルでは縦並び、デスクトップでは横並び */}
          <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2 sm:gap-0">
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="flex items-center justify-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </button>
            <button
              onClick={exportData}
              className="flex items-center justify-center px-3 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-md text-sm hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              <Download className="h-4 w-4 mr-1" />
              エクスポート
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-300 transition-colors">データを読み込んでいます...</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.column_name}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors"
                      >
                        <div>
                          <div className="font-medium">{col.column_name}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">{col.column_type}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      {columns.map((col) => (
                        <td
                          key={col.column_name}
                          className="px-4 py-3 text-sm text-gray-900 dark:text-white max-w-xs truncate transition-colors"
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
              <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-colors">表示件数:</label>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm min-w-0 transition-colors"
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
                className="flex items-center justify-center px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded disabled:opacity-50 min-w-0 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              
              <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap transition-colors">
                {currentPage} / {totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center justify-center px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded disabled:opacity-50 min-w-0 transition-colors"
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

