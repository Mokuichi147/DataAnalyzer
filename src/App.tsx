import { useState, useEffect } from 'react'
import { Database, Upload, Settings, BarChart3, Activity } from 'lucide-react'
import { DataSourceManager } from './components/DataSourceManager'
import { FileUpload } from './components/FileUpload'
import { DataPreview } from './components/DataPreview'
import { AnalysisPanel } from './components/AnalysisPanel'
import { RealtimeManager } from './components/RealtimeManager'
import { DuckDBConverter } from './components/DuckDBConverter'
import { useDataStore } from './store/dataStore'
import { memoryDataStore } from './lib/memoryDataStore'

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
    <div className="min-h-screen bg-gray-50">
      <style dangerouslySetInnerHTML={{ __html: scrollbarHiddenStyle }} />
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900">Data Analyzer</h1>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* デスクトップ用のタブ */}
          <div className="hidden md:flex space-x-8">
            <button
              onClick={() => setActiveTab('data')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'data'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              データソース
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'upload'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Upload className="inline h-4 w-4 mr-1" />
              ファイルアップロード
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analysis'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              分析・可視化
            </button>
            <button
              onClick={() => setActiveTab('realtime')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'realtime'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="inline h-4 w-4 mr-1" />
              リアルタイム
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Database className="h-4 w-4 mx-auto mb-1" />
                <span className="block">データソース</span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'upload'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Upload className="h-4 w-4 mx-auto mb-1" />
                <span className="block">アップロード</span>
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'analysis'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <BarChart3 className="h-4 w-4 mx-auto mb-1" />
                <span className="block">分析・可視化</span>
              </button>
              <button
                onClick={() => setActiveTab('realtime')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'realtime'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Activity className="h-4 w-4 mx-auto mb-1" />
                <span className="block">リアルタイム</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-shrink-0 px-3 py-2 rounded-md text-xs font-medium ${
                  activeTab === 'settings'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <DataSourceManager />
            </div>
          )}
          {activeTab === 'upload' && (
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <FileUpload onNavigateToSettings={() => setActiveTab('settings')} />
            </div>
          )}
          {activeTab === 'analysis' && (
            <div className="md:bg-white md:rounded-lg md:shadow md:p-6">
              {currentTable ? (
                <div className="space-y-4 md:space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 md:p-0 bg-white md:bg-transparent rounded-lg md:rounded-none shadow md:shadow-none md:mb-4">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">分析・可視化</h2>
                      <p className="text-sm text-gray-600">
                        テーブル: <span className="font-medium">{currentTable.name}</span>
                        （{currentTable.columns.length}列
                        {currentTable.rowCount && `、${currentTable.rowCount}行`}、
                        {currentTable.connectionId === 'file' ? 'ファイル' : currentTable.connectionId}）
                      </p>
                    </div>
                    <button
                      onClick={() => setCurrentTable(null)}
                      className="text-sm text-blue-600 hover:text-blue-800 self-start sm:self-auto"
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
                <div className="space-y-4 md:space-y-6 p-4 md:p-0 bg-white md:bg-transparent rounded-lg md:rounded-none shadow md:shadow-none">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-medium text-gray-900">テーブル選択</h2>
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
                        className="text-sm text-red-600 hover:text-red-800 underline"
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
                                  ? 'border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                                  : 'border-red-200 bg-red-50'
                              }`}
                              onClick={() => isTableInMemory && setCurrentTable(table)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h3 className={`font-medium ${isTableInMemory ? 'text-gray-900' : 'text-red-700'}`}>
                                  {table.name}
                                  {!isTableInMemory && <span className="ml-2 text-xs">(データ消失)</span>}
                                </h3>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-gray-500">
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
                                        if (currentTable?.id === table.id) {
                                          setCurrentTable(null)
                                        }
                                      }
                                    }}
                                    className={`text-xs hover:underline ${
                                      isTableInMemory 
                                        ? 'text-gray-600 hover:text-red-600' 
                                        : 'text-red-600 hover:text-red-800'
                                    }`}
                                    title="テーブルを削除"
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                接続: {table.connectionId === 'file' ? 'ファイル' : table.connectionId}
                                {table.rowCount && ` • ${table.rowCount} 行`}
                              </p>
                              <div className="text-xs text-gray-500">
                                {table.columns.slice(0, 3).map(col => col.name).join(', ')}
                                {table.columns.length > 3 && '...'}
                              </div>
                              {!isTableInMemory && (
                                <div className="mt-2 text-xs text-red-600">
                                  メモリからデータが消失しています。再度ファイルをアップロードしてください。
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
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
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <RealtimeManager />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">設定</h2>
              
              <div className="mb-6">
                <h3 className="text-md font-medium text-gray-900 mb-4">DuckDBファイル変換ガイド</h3>
                <DuckDBConverter />
              </div>
              
              <div className="border-t pt-6">
                <h3 className="text-md font-medium text-gray-900 mb-2">その他の設定</h3>
                <p className="text-gray-600">今後、その他の設定項目がここに追加されます。</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App