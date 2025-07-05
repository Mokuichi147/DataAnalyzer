import { useState } from 'react'
import { Database, Upload, Settings, BarChart3, Activity } from 'lucide-react'
import { DataSourceManager } from './components/DataSourceManager'
import { FileUpload } from './components/FileUpload'
import { DataPreview } from './components/DataPreview'
import { AnalysisPanel } from './components/AnalysisPanel'
import { RealtimeManager } from './components/RealtimeManager'
import { DuckDBConverter } from './components/DuckDBConverter'
import { useDataStore } from './store/dataStore'

function App() {
  const [activeTab, setActiveTab] = useState('data')
  const { currentTable } = useDataStore()

  return (
    <div className="min-h-screen bg-gray-50">
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
          <div className="flex space-x-8">
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
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {activeTab === 'data' && (
            <div className="bg-white rounded-lg shadow p-6">
              <DataSourceManager />
            </div>
          )}
          {activeTab === 'upload' && (
            <div className="bg-white rounded-lg shadow p-6">
              <FileUpload onNavigateToSettings={() => setActiveTab('settings')} />
            </div>
          )}
          {activeTab === 'analysis' && (
            <div className="bg-white rounded-lg shadow p-6">
              {currentTable ? (
                <div className="space-y-6">
                  <DataPreview tableName={currentTable.name} />
                  <AnalysisPanel 
                    tableName={currentTable.name} 
                    columns={currentTable.columns} 
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>分析を開始するためにテーブルを選択してください</p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'realtime' && (
            <div className="bg-white rounded-lg shadow p-6">
              <RealtimeManager />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-lg shadow p-6">
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