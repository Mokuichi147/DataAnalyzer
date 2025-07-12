import { useState, useEffect } from 'react'
import { Upload, Settings, BarChart3 } from 'lucide-react'
import { FileUpload } from './components/FileUpload'
import { DataPreview } from './components/DataPreview'
import { AnalysisPanel } from './components/AnalysisPanel'
import { ThemeSettings } from './components/ThemeSettings'
import { DataSimulator } from './components/DataSimulator'
import { useDataStore, type DataTable } from './store/dataStore'
import { memoryDataStore } from './lib/memoryDataStore'
import { ThemeProvider } from './contexts/ThemeContext'

function App() {
  const [activeTab, setActiveTab] = useState('upload')
  const { currentTable, tables, setCurrentTable, removeTable, removeTableByNameAndConnection } = useDataStore()

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
                        {/* 重複テーブルを排除: 同じ名前とconnectionIdの組み合わせは1つだけ表示 */}
                        {tables
                          .filter((table, index, self) => 
                            index === self.findIndex(t => t.name === table.name && t.connectionId === table.connectionId)
                          )
                          .map((table) => {
                            const memoryTables = memoryDataStore.listTables()
                            const isTableInMemory = table.connectionId !== 'file' || memoryTables.includes(table.name)
                            
                            // 同じ名前とconnectionIdの組み合わせのテーブル数をカウント
                            const duplicateCount = tables.filter(t => t.name === table.name && t.connectionId === table.connectionId).length
                            
                            return (
                              <div
                                key={`${table.name}-${table.connectionId}`}
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
                                    {duplicateCount > 1 && (
                                      <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-1 py-0.5 rounded">
                                        重複({duplicateCount})
                                      </span>
                                    )}
                                    {!isTableInMemory && <span className="ml-2 text-xs">(データ消失)</span>}
                                  </h3>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {table.columns.length} 列
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const confirmMessage = duplicateCount > 1 
                                          ? `テーブル "${table.name}" の重複エントリ（${duplicateCount}個）をすべて削除しますか？\n\nこの操作は取り消すことができません。${isTableInMemory ? '\n\nメモリ内のデータも削除されます。' : ''}`
                                          : `テーブル "${table.name}" を削除しますか？\n\nこの操作は取り消すことができません。${isTableInMemory ? '\n\nメモリ内のデータも削除されます。' : ''}`
                                        
                                        if (window.confirm(confirmMessage)) {
                                          // メモリ内のデータを削除
                                          if (isTableInMemory && table.connectionId === 'file') {
                                            try {
                                              memoryDataStore.dropTable(table.name)
                                            } catch (error) {
                                              console.warn(`Failed to drop table ${table.name} from memory:`, error)
                                            }
                                          }
                                          
                                          // 同じ名前とconnectionIdのテーブルをすべて削除
                                          removeTableByNameAndConnection(table.name, table.connectionId)
                                          
                                          // 現在選択中のテーブルの場合、選択を解除
                                          if (currentTable && 
                                              (currentTable as DataTable).name === table.name && 
                                              (currentTable as DataTable).connectionId === table.connectionId) {
                                            setCurrentTable(null)
                                          }
                                        }
                                      }}
                                      className={`text-xs hover:underline ${
                                        isTableInMemory 
                                          ? 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400' 
                                          : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                                      }`}
                                      title={duplicateCount > 1 ? "重複するテーブルをすべて削除" : "テーブルを削除"}
                                    >
                                      削除{duplicateCount > 1 && `(${duplicateCount})`}
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
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">設定</h2>
                
                <ThemeSettings />
              </div>
              
              <ExperimentalFeatures />
            </div>
          )}
        </div>
      </main>
      </div>
    </ThemeProvider>
  )
}

function ExperimentalFeatures() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 transition-colors">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-600 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-800/30 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <span className="text-yellow-600 dark:text-yellow-400">⚠️</span>
          <div className="text-left">
            <h3 className="font-medium text-yellow-800 dark:text-yellow-200">実験的機能</h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              テスト用のデータシミュレーター機能です
            </p>
          </div>
        </div>
        <span className="text-yellow-600 dark:text-yellow-400">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="mt-4 p-4 border-t border-gray-200 dark:border-gray-600">
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-md">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
              データシミュレーターについて
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• 分析機能のテスト用にリアルなサンプルデータを生成します</li>
              <li>• 欠損データの処理テストに役立つ様々な欠損パターンを生成できます</li>
              <li>• 数値分析、グラフ作成、フィルター機能の動作確認に使用してください</li>
              <li>• 生成されたデータは一時的なものでブラウザを閉じると消えます</li>
            </ul>
          </div>
          
          <DataSimulator />
        </div>
      )}
    </div>
  )
}

export default App