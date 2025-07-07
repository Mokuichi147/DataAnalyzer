import { useState, useEffect } from 'react'
import { Database, Upload, Settings, BarChart3, Activity } from 'lucide-react'
import { DataSourceManager } from './components/DataSourceManager'
import { FileUpload } from './components/FileUpload'
import { DataPreview } from './components/DataPreview'
import { AnalysisPanel } from './components/AnalysisPanel'
import { RealtimeManager } from './components/RealtimeManager'
import { ThemeSettings } from './components/ThemeSettings'
import { useDataStore } from './store/dataStore'
import { memoryDataStore } from './lib/memoryDataStore'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
  const [activeTab, setActiveTab] = useState('data')
  const { currentTable, tables, setCurrentTable, removeTable } = useDataStore()

  // Webkitスクロールバーを隠すためのスタイル
  const scrollbarHiddenStyle = `
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
    .scrollbar-hide {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `

  // アプリ初期化時に現在のテーブル選択状態をチェック（自動削除は無効化）
  useEffect(() => {
    const checkCurrentTableStatus = () => {
      // 現在選択されているテーブルがメモリに存在しない場合のみ、選択を解除
      if (currentTable && currentTable.connectionId === 'file') {
        const memoryTables = memoryDataStore.listTables()
        if (!memoryTables.includes(currentTable.name)) {
          console.log(`Current table ${currentTable.name} not found in memory, clearing selection`)
          setCurrentTable(null)
        }
      }
    }

    checkCurrentTableStatus()
  }, [currentTable, setCurrentTable])

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <style dangerouslySetInnerHTML={{ __html: scrollbarHiddenStyle }} />
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">Data Analyzer</h1>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* デスクトップ用のタブ */}
          <div className="hidden md:flex space-x-8">
            <button
              onClick={() => setActiveTab('data')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'data'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              データソース
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'upload'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Upload className="inline h-4 w-4 mr-1" />
              ファイルアップロード
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analysis'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              分析・可視化
            </button>
            <button
              onClick={() => setActiveTab('realtime')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'realtime'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Activity className="inline h-4 w-4 mr-1" />
              リアルタイム
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Settings className="inline h-4 w-4 mr-1" />
              設定
            </button>
          </div>

          {/* モバイル用のスクロール可能なタブ */}
          <div className="md:hidden">
            <div className="flex overflow-x-auto scrollbar-hide space-x-1 py-2">
              <button
                onClick={() => setActiveTab('data')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'data'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Database className="h-4 w-4 mx-auto mb-1" />
                <span className="block">データソース</span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'upload'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Upload className="h-4 w-4 mx-auto mb-1" />
                <span className="block">アップロード</span>
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'analysis'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <BarChart3 className="h-4 w-4 mx-auto mb-1" />
                <span className="block">分析・可視化</span>
              </button>
              <button
                onClick={() => setActiveTab('realtime')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'realtime'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Activity className="h-4 w-4 mx-auto mb-1" />
                <span className="block">リアルタイム</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'settings'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Settings className="h-4 w-4 mx-auto mb-1" />
                <span className="block">設定</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-4 sm:py-6">
          {activeTab === 'data' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
              <DataSourceManager />
            </div>
          )}
          {activeTab === 'upload' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
              <FileUpload onNavigateToSettings={() => setActiveTab('settings')} />
            </div>
          )}
          {activeTab === 'analysis' && (
            <div className="md:bg-white md:dark:bg-gray-800 md:rounded-lg md:shadow md:p-6 md:transition-colors">
              {currentTable ? (
                <div className="space-y-4 md:space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 md:p-0 bg-white dark:bg-gray-800 md:bg-transparent md:dark:bg-transparent rounded-lg md:rounded-none shadow md:shadow-none md:mb-4 transition-colors">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 dark:text-white">分析・可視化</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        テーブル: <span className="font-medium">{currentTable.name}</span>
                        （{currentTable.columns.length}列
                        {currentTable.rowCount && `、${currentTable.rowCount}行`}、
                        {currentTable.connectionId === 'file' ? 'ファイル' : currentTable.connectionId}）
                      </p>
                    </div>
                    <button
                      onClick={() => setCurrentTable(null)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 self-start sm:self-auto"
                    >
                      テーブルを変更
                    </button>
                  </div>
                  
                  <DataPreview key={`preview-${currentTable.id}`} tableName={currentTable.name} />
                  <AnalysisPanel 
                    key={`analysis-${currentTable.id}`}
                    tableName={currentTable.name} 
                    columns={currentTable.columns} 
                  />
                </div>
              ) : (
                <div className="space-y-4 md:space-y-6 p-4 md:p-0 bg-white dark:bg-gray-800 md:bg-transparent md:dark:bg-transparent rounded-lg md:rounded-none shadow md:shadow-none transition-colors">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">テーブル選択</h2>
                    {tables.length > 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`すべてのテーブル（${tables.length}個）を削除しますか？\n\nこの操作は取り消すことができません。\nメモリ内のデータもすべて削除されます。`)) {
                            // 全テーブルのメモリ内データを削除
                            tables.forEach(table => {
                              if (table.connectionId === 'file') {
                                const memoryTables = memoryDataStore.listTables()
                                if (memoryTables.includes(table.name)) {
                                  try {
                                    memoryDataStore.dropTable(table.name)
                                  } catch (error) {
                                    console.warn(`Failed to drop table ${table.name} from memory:`, error)
                                  }
                                }
                              }
                              removeTable(table.id)
                            })
                            // 現在のテーブル選択を解除
                            setCurrentTable(null)
                          }
                        }}
                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                      >
                        すべてのテーブルを削除
                      </button>
                    )}
                  </div>
                  
                  {/* テーブル一覧表示 */}
                  <div className="space-y-4">
                    {tables.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {tables.map((table) => {
                          const memoryTables = memoryDataStore.listTables()
                          const isTableInMemory = table.connectionId !== 'file' || memoryTables.includes(table.name)
                          
                          return (
                            <div
                              key={table.id}
                              className={`border rounded-lg p-4 transition-colors ${
                                isTableInMemory 
                                  ? 'border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer bg-white dark:bg-gray-700'
                                  : 'border-red-200 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                              }`}
                              onClick={() => isTableInMemory && setCurrentTable(table)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h3 className={`font-medium ${isTableInMemory ? 'text-gray-900 dark:text-white' : 'text-red-700 dark:text-red-400'}`}>
                                  {table.name}
                                  {!isTableInMemory && <span className="ml-2 text-xs">(データ消失)</span>}
                                </h3>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {table.columns.length} 列
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (window.confirm(`テーブル "${table.name}" を削除しますか？\n\nこの操作は取り消すことができません。${isTableInMemory ? '\n\nメモリ内のデータも削除されます。' : ''}`)) {
                                        // メモリ内のデータも削除
                                        if (isTableInMemory && table.connectionId === 'file') {
                                          try {
                                            memoryDataStore.dropTable(table.name)
                                          } catch (error) {
                                            console.warn(`Failed to drop table ${table.name} from memory:`, error)
                                          }
                                        }
                                        // ストアからテーブル情報を削除
                                        removeTable(table.id)
                                        // 現在選択中のテーブルの場合、選択を解除
                                        if (currentTable && typeof currentTable === 'object' && 'id' in currentTable && (currentTable as any).id === table.id) {
                                          setCurrentTable(null)
                                        }
                                      }
                                    }}
                                    className={`text-xs hover:underline ${
                                      isTableInMemory 
                                        ? 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400' 
                                        : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                                    }`}
                                    title="テーブルを削除"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                                接続: {table.connectionId === 'file' ? 'ファイル' : table.connectionId}
                                {table.rowCount && ` • ${table.rowCount} 行`}
                              </p>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {table.columns.slice(0, 3).map(col => col.name).join(', ')}
                                {table.columns.length > 3 && '...'}
                              </div>
                              {!isTableInMemory && (
                                <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                                  メモリからデータが消失しています。再度ファイルをアップロードしてください。
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p className="mb-2">分析するテーブルがありません</p>
                        <p className="text-sm">「ファイルアップロード」タブからデータをアップロードしてください</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'realtime' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
              <RealtimeManager />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">設定</h2>
              
              <ThemeSettings />
            </div>
          )}
        </div>
      </main>
      </div>
    </ThemeProvider>
  )
}

export default App