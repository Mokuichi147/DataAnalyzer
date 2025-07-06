import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, LineChart, PieChart, TrendingUp, Activity, Zap, Database, Type } from 'lucide-react'
import { Line, Bar, Scatter, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { useDataStore } from '@/store/dataStore'
import {
  getBasicStatistics as getBasicStatisticsOriginal,
  getCorrelationMatrix as getCorrelationMatrixOriginal,
  detectChangePoints as detectChangePointsOriginal,
  performFactorAnalysis as performFactorAnalysisOriginal,
  getHistogramData as getHistogramDataOriginal,
  getTimeSeriesData as getTimeSeriesDataOriginal,
  BasicStats,
  CorrelationResult,
  ChangePointResult,
  FactorAnalysisResult
} from '@/lib/statistics'

import {
  getBasicStatistics as getBasicStatisticsMemory,
  getCorrelationMatrix as getCorrelationMatrixMemory,
  detectChangePoints as detectChangePointsMemory,
  performFactorAnalysis as performFactorAnalysisMemory,
  getHistogramData as getHistogramDataMemory,
  getTimeSeriesData as getTimeSeriesDataMemory,
  getColumnAnalysis,
  type ColumnAnalysisResult
} from '@/lib/memoryStatistics'

import {
  getTextStatistics,
  getWordFrequency,
  getCharacterFrequency,
  getTextPatternAnalysis,
  getLanguageDetectionAnalysis,
  getSentenceAnalysis,
  getReadabilityAnalysis,
  type TextStatistics,
  type WordFrequency,
  type CharacterFrequency,
  type TextPatternAnalysis,
  type LanguageDetection,
  type SentenceAnalysis,
  type ReadabilityAnalysis
} from '@/lib/textAnalysis'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

// 数値フォーマット用ヘルパー関数
function formatNumber(value: number | undefined | null): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A'
  }
  
  const absValue = Math.abs(value)
  
  // 非常に大きい数値の場合（10億以上）
  if (absValue >= 1e9) {
    return value.toExponential(2)
  }
  
  // 非常に小さい数値の場合（0.001未満）
  if (absValue > 0 && absValue < 0.001) {
    return value.toExponential(3)
  }
  
  // 整数の場合
  if (Number.isInteger(value)) {
    if (absValue >= 1000) {
      return value.toLocaleString('ja-JP') // 日本語ロケール（カンマ区切り）
    }
    return value.toString()
  }
  
  // 小数の場合
  if (absValue >= 1000) {
    return value.toLocaleString('ja-JP', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    })
  } else if (absValue >= 1) {
    return value.toFixed(4).replace(/\.?0+$/, '')
  } else if (absValue >= 0.01) {
    return value.toFixed(4).replace(/\.?0+$/, '')
  } else {
    return value.toFixed(6).replace(/\.?0+$/, '')
  }
}

type AnalysisType = 'basic' | 'correlation' | 'changepoint' | 'factor' | 'histogram' | 'timeseries' | 'column' | 'text'

interface AnalysisPanelProps {
  tableName: string
  columns: Array<{ name: string; type: string; nullable: boolean }>
}

export function AnalysisPanel({ tableName, columns }: AnalysisPanelProps) {
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType>('column')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { setError } = useDataStore()
  
  console.log('AnalysisPanel props:', { tableName, columns })
  console.log('AnalysisPanel state:', { activeAnalysis, selectedColumns, analysisResults, isLoading })
  
  // デフォルト選択ロジックを実行する関数
  const applyDefaultSelection = useCallback(() => {
    const currentAvailableColumns = getAvailableColumns()
    if (currentAvailableColumns.length > 0) {
      const currentType = analysisTypes.find(type => type.key === activeAnalysis)
      if (currentType) {
        let defaultColumns: string[] = []
        
        if (currentType.minColumns === 1 && currentType.maxColumns === 1) {
          // 単一選択の場合：最初のカラムを選択
          defaultColumns = [currentAvailableColumns[0].name]
        } else if (currentType.minColumns >= 2) {
          // 複数選択必須の場合：最小必要数まで選択（最大10カラム）
          const selectCount = Math.min(currentType.maxColumns, currentAvailableColumns.length)
          defaultColumns = currentAvailableColumns.slice(0, selectCount).map(col => col.name)
        } else {
          // その他の複数選択可能な場合：全カラムを選択（最大10カラム）
          const selectCount = Math.min(currentType.maxColumns, currentAvailableColumns.length)
          defaultColumns = currentAvailableColumns.slice(0, selectCount).map(col => col.name)
        }
        
        setSelectedColumns(defaultColumns)
      }
    }
  }, [activeAnalysis, columns])
  
  // 分析タイプが変更されたときに結果をクリアし、デフォルト選択を実行
  useEffect(() => {
    setAnalysisResults(null)
    setSelectedColumns([])
    applyDefaultSelection()
  }, [activeAnalysis, applyDefaultSelection])
  
  // テーブルが変更されたときに結果をクリアし、デフォルト選択を実行
  useEffect(() => {
    setAnalysisResults(null)
    setSelectedColumns([])
    applyDefaultSelection()
  }, [tableName, applyDefaultSelection])

  // 選択されたカラムが変更されたとき、条件を満たしていれば自動実行
  useEffect(() => {
    if (selectedColumns.length > 0 && isValidColumnSelection() && !isLoading) {
      runAnalysis()
    }
  }, [selectedColumns, tableName])

  // データ変更を監視して分析結果を自動更新
  useEffect(() => {
    const handleDataChange = (event: CustomEvent) => {
      console.log('🔄 dataChanged event received:', event.detail)
      const { tableName: changedTable } = event.detail
      
      console.log('📊 Analysis Panel state:', {
        currentTableName: tableName,
        changedTable,
        hasAnalysisResults: !!analysisResults,
        selectedColumnsCount: selectedColumns.length,
        isLoading
      })
      
      if (changedTable === tableName && selectedColumns.length > 0 && !isLoading) {
        console.log('✅ Conditions met, re-running analysis for table:', changedTable)
        runAnalysis()
      } else {
        console.log('❌ Conditions not met for auto-refresh:', {
          tableMatch: changedTable === tableName,
          hasSelectedColumns: selectedColumns.length > 0,
          notLoading: !isLoading
        })
      }
    }

    console.log('🎧 Setting up dataChanged listener for table:', tableName)
    window.addEventListener('dataChanged', handleDataChange as EventListener)
    return () => {
      console.log('🔇 Removing dataChanged listener for table:', tableName)
      window.removeEventListener('dataChanged', handleDataChange as EventListener)
    }
  }, [tableName, selectedColumns, isLoading])
  
  if (!tableName) {
    return <div className="text-center py-8 text-gray-500">テーブル名が設定されていません</div>
  }
  
  if (!columns || columns.length === 0) {
    return <div className="text-center py-8 text-gray-500">カラム情報が取得できません</div>
  }

  // 分析タイプに応じた適切なカラムフィルタリング
  const getAvailableColumns = () => {
    switch (activeAnalysis) {
      case 'basic':
      case 'correlation':
      case 'changepoint':
      case 'factor':
      case 'histogram':
      case 'timeseries':
        // 数値型のカラムのみ
        return columns.filter(col => 
          col.type.includes('INT') || 
          col.type.includes('FLOAT') || 
          col.type.includes('DOUBLE') ||
          col.type.includes('DECIMAL') ||
          col.type.includes('NUMBER')
        )
      case 'column':
        // カラム分析は全カラム
        return columns
      case 'text':
        // テキスト分析はTEXTカラムのみ
        return columns.filter(col => col.type === 'TEXT')
      default:
        return columns
    }
  }

  const availableColumns = getAvailableColumns()
  
  // 後方互換性のため numericColumns を維持
  const numericColumns = columns.filter(col => 
    col.type.includes('INT') || 
    col.type.includes('FLOAT') || 
    col.type.includes('DOUBLE') ||
    col.type.includes('DECIMAL') ||
    col.type.includes('NUMBER') ||
    col.type === 'TEXT'
  )

  const dateColumns = columns.filter(col => 
    col.type.includes('DATE') || 
    col.type.includes('TIMESTAMP')
  )

  const getCurrentAnalysisType = () => {
    return analysisTypes.find(type => type.key === activeAnalysis)
  }

  const isValidColumnSelection = () => {
    const currentType = getCurrentAnalysisType()
    if (!currentType) return false
    
    return selectedColumns.length >= currentType.minColumns && 
           selectedColumns.length <= currentType.maxColumns
  }

  const runAnalysis = async () => {
    if (!tableName || selectedColumns.length === 0) {
      console.log('Cannot run analysis: missing table or columns')
      return
    }
    
    if (!isValidColumnSelection()) {
      const currentType = getCurrentAnalysisType()
      setError(`${currentType?.label}には${currentType?.minColumns}〜${currentType?.maxColumns}個のカラムが必要です`)
      return
    }
    
    setIsLoading(true)
    setAnalysisResults(null)
    
    try {
      console.log('Running analysis:', { activeAnalysis, tableName, selectedColumns })
      let results: any = null
      
      // メモリ内データストアを使用（DuckDBのフォールバック判定）
      const useMemoryStore = true // 現在はメモリ内データストアを使用
      
      switch (activeAnalysis) {
        case 'basic':
          if (selectedColumns.length >= 1) {
            // 複数列の基本統計量を取得
            const allStats = []
            for (const column of selectedColumns) {
              const stats = useMemoryStore 
                ? await getBasicStatisticsMemory(tableName, column)
                : await getBasicStatisticsOriginal(tableName, column)
              allStats.push({ columnName: column, ...stats })
            }
            results = allStats
          }
          break
          
        case 'correlation':
          if (selectedColumns.length >= 2) {
            results = useMemoryStore
              ? await getCorrelationMatrixMemory(tableName, selectedColumns)
              : await getCorrelationMatrixOriginal(tableName, selectedColumns)
            console.log('Correlation results:', results)
          }
          break
          
        case 'changepoint':
          if (selectedColumns.length >= 1) {
            results = useMemoryStore
              ? await detectChangePointsMemory(tableName, selectedColumns[0])
              : await detectChangePointsOriginal(tableName, selectedColumns[0])
          }
          break
          
        case 'factor':
          if (selectedColumns.length >= 2) {
            results = useMemoryStore
              ? await performFactorAnalysisMemory(tableName, selectedColumns)
              : await performFactorAnalysisOriginal(tableName, selectedColumns)
          }
          break
          
        case 'histogram':
          if (selectedColumns.length === 1) {
            results = useMemoryStore
              ? await getHistogramDataMemory(tableName, selectedColumns[0])
              : await getHistogramDataOriginal(tableName, selectedColumns[0])
          }
          break
          
        case 'timeseries':
          if (selectedColumns.length === 1) {
            results = useMemoryStore
              ? await getTimeSeriesDataMemory(tableName, selectedColumns[0], 'index')
              : dateColumns.length > 0 
                ? await getTimeSeriesDataOriginal(tableName, selectedColumns[0], dateColumns[0].name)
                : null
          }
          break
          
        case 'column':
          if (selectedColumns.length >= 1) {
            results = await getColumnAnalysis(tableName, selectedColumns)
          }
          break
          
        case 'text':
          if (selectedColumns.length === 1) {
            const columnName = selectedColumns[0]
            const textStats = await getTextStatistics(tableName, columnName)
            const wordFreq = await getWordFrequency(tableName, columnName, 15)
            const charFreq = await getCharacterFrequency(tableName, columnName, 15)
            const patternAnalysis = await getTextPatternAnalysis(tableName, columnName)
            const languageAnalysis = await getLanguageDetectionAnalysis(tableName, columnName)
            const sentenceAnalysis = await getSentenceAnalysis(tableName, columnName)
            const readabilityAnalysis = await getReadabilityAnalysis(tableName, columnName)
            
            results = {
              statistics: textStats,
              wordFrequency: wordFreq,
              characterFrequency: charFreq,
              patterns: patternAnalysis,
              language: languageAnalysis,
              sentences: sentenceAnalysis,
              readability: readabilityAnalysis
            }
          }
          break
      }
      
      console.log('Analysis results:', results)
      
      setAnalysisResults(results)
    } catch (error) {
      setError(error instanceof Error ? error.message : '分析に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleColumnToggle = (columnName: string) => {
    const currentType = getCurrentAnalysisType()
    if (!currentType) return
    
    if (currentType.minColumns === 1 && currentType.maxColumns === 1) {
      // 単一選択の場合：ラジオボタン動作
      setSelectedColumns([columnName])
    } else {
      // 複数選択の場合：チェックボックス動作
      setSelectedColumns(prev => 
        prev.includes(columnName)
          ? prev.filter(c => c !== columnName)
          : [...prev, columnName]
      )
    }
  }

  const handleSelectAll = () => {
    const currentType = getCurrentAnalysisType()
    if (!currentType) return
    
    const maxSelectable = Math.min(currentType.maxColumns, availableColumns.length)
    const availableColumnNames = availableColumns.map(col => col.name)
    
    // 既に選択されている列は維持し、残りのスロットに未選択の列を追加
    const unselectedColumns = availableColumnNames.filter(col => !selectedColumns.includes(col))
    const remainingSlots = maxSelectable - selectedColumns.length
    const newSelections = unselectedColumns.slice(0, remainingSlots)
    
    setSelectedColumns([...selectedColumns, ...newSelections])
  }

  const handleDeselectAll = () => {
    setSelectedColumns([])
  }

  const analysisTypes = [
    { 
      key: 'column' as const, 
      label: 'データ型推定・品質分析', 
      icon: Database, 
      description: '【手法】正規表現パターンマッチング\n【内容】データ型の自動判定（整数・小数・日付・真偽値）、NULL値の分析、ユニーク値の検出、データ品質の総合評価',
      minColumns: 1,
      maxColumns: 10
    },
    { 
      key: 'basic' as const, 
      label: '記述統計量', 
      icon: BarChart, 
      description: '【手法】算術平均・母集団標準偏差・分位数計算\n【内容】平均値、標準偏差、四分位数（Q1, Q2, Q3）、最小値・最大値による数値データの分布特性を要約',
      minColumns: 1,
      maxColumns: 10
    },
    { 
      key: 'correlation' as const, 
      label: 'ピアソン相関分析', 
      icon: TrendingUp, 
      description: '【手法】ピアソンの積率相関係数\n【内容】変数間の線形関係の強さを-1〜+1で測定。+1に近いほど正の相関、-1に近いほど負の相関が強い',
      minColumns: 2,
      maxColumns: 10
    },
    { 
      key: 'changepoint' as const, 
      label: '変化点検出', 
      icon: Zap, 
      description: '【手法】移動平均差分法 + 2σルール\n【内容】短期移動平均（5期間）と長期移動平均（10期間）の差分から、データの急激な変化点を統計的に検出',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'factor' as const, 
      label: '主成分分析（PCA）', 
      icon: Activity, 
      description: '【手法】分散共分散行列の固有値分解\n【内容】多次元データを少数の主成分に集約し、寄与率・累積寄与率を計算してデータの構造を解析',
      minColumns: 2,
      maxColumns: 10
    },
    { 
      key: 'histogram' as const, 
      label: 'ヒストグラム分析', 
      icon: BarChart, 
      description: '【手法】等幅ビン分割法\n【内容】データの範囲を等間隔に分割し、各区間の頻度を計算することで、データの分布形状や偏りを可視化',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'timeseries' as const, 
      label: '時系列集約分析', 
      icon: LineChart, 
      description: '【手法】DATE_TRUNC集約関数\n【内容】時間軸での集約（時間・日・週・月単位）により、時系列データのトレンドや周期性を分析',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'text' as const, 
      label: 'テキスト・言語分析', 
      icon: Type, 
      description: '【手法】TinySegmenter形態素解析 + Flesch改良読みやすさ指標\n【内容】日本語の分かち書き、文字種分析、パターン検出（メール・URL・電話番号）、文章の読みやすさ評価',
      minColumns: 1,
      maxColumns: 1
    }
  ]

  const currentAnalysisType = analysisTypes.find(t => t.key === activeAnalysis)
  const canRunAnalysis = selectedColumns.length >= (currentAnalysisType?.minColumns || 1) &&
                        selectedColumns.length <= (currentAnalysisType?.maxColumns || 10) &&
                        availableColumns.length > 0

  if (!tableName) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p>分析を開始するためにテーブルを選択してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">分析・可視化</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setAnalysisResults(null)
              setSelectedColumns([])
              setActiveAnalysis('column')
            }}
            className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
          >
            リセット
          </button>
          <button
            onClick={runAnalysis}
            disabled={!canRunAnalysis || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '分析中...' : '手動実行'}
          </button>
        </div>
      </div>

      {/* 分析タイプ選択：コンパクトなカード形式 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">分析手法を選択</h3>
        <div className="max-h-64 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {analysisTypes.map((type) => (
              <div
                key={type.key}
                onClick={() => setActiveAnalysis(type.key)}
                className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 ${
                  activeAnalysis === type.key
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-sm bg-white'
                }`}
              >
                <div className="flex flex-col items-center text-center space-y-1.5">
                  <type.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${
                    activeAnalysis === type.key ? 'text-blue-600' : 'text-gray-600'
                  }`} />
                  <h3 className={`text-xs font-medium leading-tight min-h-[2.5rem] flex items-center justify-center ${
                    activeAnalysis === type.key ? 'text-blue-900' : 'text-gray-900'
                  }`}>
                    {type.label}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 選択された分析の詳細説明 */}
      {currentAnalysisType && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <currentAnalysisType.icon className="h-6 w-6 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 mb-2">{currentAnalysisType.label}</h3>
              <p className="text-sm text-blue-800 whitespace-pre-line">
                {currentAnalysisType.description}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">
            列選択 ({currentAnalysisType?.label})
          </h3>
          {isLoading && (
            <div className="flex items-center space-x-2 text-sm text-blue-600">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>分析実行中...</span>
            </div>
          )}
        </div>
        
        {/* 列選択の指示と警告 */}
        <div className="mb-4">
          {currentAnalysisType && (
            <p className="text-sm text-gray-700 mb-2">
              {currentAnalysisType.minColumns === 1 && currentAnalysisType.maxColumns === 1
                ? `1つの列を選択してください（自動実行）`
                : currentAnalysisType.minColumns === currentAnalysisType.maxColumns
                ? `${currentAnalysisType.minColumns}個の列を選択してください（自動実行）`
                : `${currentAnalysisType.minColumns}-${currentAnalysisType.maxColumns}個の列を選択してください（自動実行）`
              }
            </p>
          )}
          {availableColumns.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-center">
                <span className="text-amber-600 mr-2">⚠️</span>
                <span className="text-amber-800 text-sm font-medium">
                  この分析に適した列がありません
                </span>
              </div>
            </div>
          )}
        </div>
        
        {/* 複数選択可能な場合のみ全選択・選択解除ボタンを表示 */}
        {currentAnalysisType && currentAnalysisType.maxColumns > 1 && availableColumns.length > 0 && (
          <div className="flex items-center space-x-2 mb-3">
            <button
              onClick={handleSelectAll}
              disabled={selectedColumns.length >= Math.min(currentAnalysisType.maxColumns, availableColumns.length)}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              全て選択
              {currentAnalysisType.maxColumns < availableColumns.length && 
                ` (最大${currentAnalysisType.maxColumns}個)`
              }
            </button>
            <button
              onClick={handleDeselectAll}
              disabled={selectedColumns.length === 0}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              選択解除
            </button>
            <span className="text-xs text-gray-500">
              ({selectedColumns.length}/{currentAnalysisType.maxColumns})
            </span>
          </div>
        )}
        
        {availableColumns.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {availableColumns.map((col) => {
            const isSingleSelect = currentAnalysisType?.minColumns === 1 && currentAnalysisType?.maxColumns === 1
            const isSelected = selectedColumns.includes(col.name)
            const maxReached = !isSingleSelect && currentAnalysisType && selectedColumns.length >= currentAnalysisType.maxColumns
            const isDisabled = maxReached && !isSelected
            
            return (
              <label 
                key={col.name} 
                className={`flex items-center space-x-2 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type={isSingleSelect ? "radio" : "checkbox"}
                  name={isSingleSelect ? "single-column-selection" : undefined}
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => handleColumnToggle(col.name)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded disabled:opacity-50"
                />
                <span className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                  {col.name}
                </span>
              </label>
            )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">この分析タイプに適したカラムがありません</p>
            <p className="text-xs mt-2">
              {activeAnalysis === 'basic' && '数値型のカラムが必要です'}
              {activeAnalysis === 'text' && 'TEXT型のカラムが必要です'}
              {(activeAnalysis === 'correlation' || activeAnalysis === 'factor') && '数値型のカラムが2つ以上必要です'}
            </p>
          </div>
        )}
        
        {selectedColumns.length > 0 && (
          <div className="mt-3 p-2 bg-gray-50 rounded">
            <span className="text-sm text-gray-600">
              選択中: {selectedColumns.join(', ')}
            </span>
            {currentAnalysisType && selectedColumns.length >= currentAnalysisType.maxColumns && currentAnalysisType.maxColumns > 1 && (
              <span className="block text-xs text-amber-600 mt-1">
                最大選択数（{currentAnalysisType.maxColumns}個）に達しました
              </span>
            )}
          </div>
        )}
      </div>

      {analysisResults && (
        <div className="bg-white border rounded-lg p-4 md:p-6">
          <h3 className="font-medium text-gray-900 mb-4">分析結果</h3>
          <div className="overflow-hidden">
            <AnalysisResults type={activeAnalysis} results={analysisResults} />
          </div>
        </div>
      )}
      
      {/* 常に表示されるデバッグ情報（一時的） */}
      <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded text-xs">
        <p><strong>Debug Info:</strong></p>
        <p>activeAnalysis: {activeAnalysis}</p>
        <p>hasResults: {analysisResults ? 'true' : 'false'}</p>
        <p>isLoading: {isLoading ? 'true' : 'false'}</p>
        <p>selectedColumns: [{selectedColumns.join(', ')}]</p>
        <p>numericColumns: [{numericColumns.map(c => c.name).join(', ')}]</p>
        <p>canRunAnalysis: {canRunAnalysis ? 'true' : 'false'}</p>
        {analysisResults && <p>Results type: {typeof analysisResults}</p>}
      </div>
      
      {/* 強制的に結果表示テスト */}
      <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded">
        <p className="text-sm font-bold">Force Display Test:</p>
        {analysisResults ? (
          <div>
            <p>✅ Results exist</p>
            <p>Type: {activeAnalysis}</p>
            <AnalysisResults type={activeAnalysis} results={analysisResults} />
          </div>
        ) : (
          <p>❌ No results to display</p>
        )}
      </div>
    </div>
  )
}

interface AnalysisResultsProps {
  type: AnalysisType
  results: any
}

function AnalysisResults({ type, results }: AnalysisResultsProps) {
  console.log('AnalysisResults:', { type, results })
  
  if (!results) {
    console.log('AnalysisResults: No results to display')
    return null
  }

  switch (type) {
    case 'basic':
      return <BasicStatsResults stats={results} />
    case 'correlation':
      return <CorrelationResults correlations={results} />
    case 'changepoint':
      return <ChangePointResults changePoints={results} />
    case 'factor':
      return <FactorAnalysisResults factorAnalysis={results} />
    case 'histogram':
      return <HistogramResults data={results} />
    case 'timeseries':
      return <TimeSeriesResults data={results} />
    case 'column':
      return <ColumnAnalysisResults data={results} />
    case 'text':
      return <TextAnalysisResults data={results} />
    default:
      return null
  }
}

function BasicStatsResults({ stats }: { stats: any }) {
  console.log('BasicStatsResults received:', stats)
  
  // 複数列の統計量の場合（配列）
  if (Array.isArray(stats)) {
    if (stats.length === 0) {
      return (
        <div className="text-center py-4 text-gray-600">
          <p>基本統計の結果がありません。</p>
        </div>
      )
    }
    
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left p-3 font-medium text-gray-900">列名</th>
              <th className="text-right p-3 font-medium text-gray-900">件数</th>
              <th className="text-right p-3 font-medium text-gray-900">平均</th>
              <th className="text-right p-3 font-medium text-gray-900">標準偏差</th>
              <th className="text-right p-3 font-medium text-gray-900">最小値</th>
              <th className="text-right p-3 font-medium text-gray-900">最大値</th>
              <th className="text-right p-3 font-medium text-gray-900">第1四分位数</th>
              <th className="text-right p-3 font-medium text-gray-900">中央値</th>
              <th className="text-right p-3 font-medium text-gray-900">第3四分位数</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => (
              <tr key={index} className={`border-b ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="p-3 font-medium text-gray-900">{stat.columnName}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.count)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.mean)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.std)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.min)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.max)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.quartiles?.q1)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.quartiles?.q2)}</td>
                <td className="p-3 text-right font-mono">{formatNumber(stat.quartiles?.q3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  
  // 単一列の統計量の場合（後方互換性のため）
  if (!stats || typeof stats !== 'object') {
    return (
      <div className="text-center py-4 text-red-600">
        <p>基本統計の結果が無効です。</p>
        <p className="text-xs mt-2">Expected object or array, got: {typeof stats}</p>
      </div>
    )
  }
  
  const data = [
    { label: '件数', value: formatNumber(stats.count) },
    { label: '平均', value: formatNumber(stats.mean) },
    { label: '標準偏差', value: formatNumber(stats.std) },
    { label: '最小値', value: formatNumber(stats.min) },
    { label: '最大値', value: formatNumber(stats.max) },
    { label: '第1四分位数', value: formatNumber(stats.quartiles?.q1) },
    { label: '中央値', value: formatNumber(stats.quartiles?.q2) },
    { label: '第3四分位数', value: formatNumber(stats.quartiles?.q3) },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {data.map((item) => (
        <div key={item.label} className="text-center p-3 bg-gray-50 rounded">
          <div className="text-2xl font-bold text-gray-900">{item.value}</div>
          <div className="text-sm text-gray-600">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

function CorrelationResults({ correlations }: { correlations: CorrelationResult[] }) {
  console.log('CorrelationResults received:', correlations, 'Type:', typeof correlations, 'IsArray:', Array.isArray(correlations))
  
  if (!correlations || !Array.isArray(correlations)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>相関分析の結果が無効です。</p>
        <p className="text-xs mt-2">Expected array, got: {typeof correlations}</p>
      </div>
    )
  }
  
  if (correlations.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>相関分析の結果がありません。</p>
      </div>
    )
  }
  
  const chartData = {
    labels: correlations.map(c => `${c.column1}-${c.column2}`),
    datasets: [{
      label: '相関係数',
      data: correlations.map(c => c.correlation),
      backgroundColor: correlations.map(c => 
        c.correlation > 0.7 ? '#22c55e' : 
        c.correlation > 0.3 ? '#3b82f6' : 
        c.correlation < -0.7 ? '#ef4444' : 
        c.correlation < -0.3 ? '#f59e0b' : '#6b7280'
      ),
    }]
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '相関係数マトリックス',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        min: -1,
        max: 1,
      },
    },
  }

  return (
    <div>
      <Bar data={chartData} options={options} />
      <div className="mt-4 space-y-2">
        {correlations.map((corr, index) => (
          <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span className="font-medium">{corr.column1} × {corr.column2}</span>
            <span className={`font-bold ${
              Math.abs(corr.correlation) > 0.7 ? 'text-red-600' :
              Math.abs(corr.correlation) > 0.3 ? 'text-blue-600' : 'text-gray-600'
            }`}>
              {formatNumber(corr.correlation)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangePointResults({ changePoints }: { changePoints: ChangePointResult[] }) {
  console.log('ChangePointResults received:', changePoints)
  console.log('First change point structure:', changePoints?.[0])
  
  if (!changePoints || !Array.isArray(changePoints)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>変化点検出の結果が無効です。</p>
        <p className="text-xs mt-2">Expected array, got: {typeof changePoints}</p>
      </div>
    )
  }
  
  if (changePoints.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>変化点が検出されませんでした。</p>
      </div>
    )
  }
  
  const chartData = {
    labels: changePoints.map(cp => `Point ${cp.index || 'N/A'}`),
    datasets: [{
      label: '変化点',
      data: changePoints.map(cp => cp.value || 0),
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      pointBackgroundColor: changePoints.map(cp => 
        (cp.confidence || 0) > 0.8 ? '#dc2626' : 
        (cp.confidence || 0) > 0.6 ? '#f59e0b' : '#6b7280'
      ),
      pointBorderColor: changePoints.map(cp => 
        (cp.confidence || 0) > 0.8 ? '#dc2626' : 
        (cp.confidence || 0) > 0.6 ? '#f59e0b' : '#6b7280'
      ),
      pointBorderWidth: 0, // アウトラインを削除
      pointRadius: changePoints.map(cp => 1 + (cp.confidence || 0) * 2), // 1-3の範囲でより小さく
      pointHoverRadius: changePoints.map(cp => 2 + (cp.confidence || 0) * 3), // ホバー時は2-5の範囲
    }]
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '変化点検出結果',
      },
      tooltip: {
        callbacks: {
          afterLabel: function(context: any) {
            const dataIndex = context.dataIndex
            const confidence = changePoints[dataIndex]?.confidence
            return confidence !== undefined ? `信頼度: ${(confidence * 100).toFixed(1)}%` : ''
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: {
          color: '#f3f4f6',
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      x: {
        grid: {
          color: '#f3f4f6',
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    },
    elements: {
      line: {
        tension: 0.2, // 線をより滑らかに
        borderWidth: 2 // 線の太さを調整
      },
      point: {
        hitRadius: 8 // クリック/ホバーの反応範囲を広く
      }
    }
  }

  return (
    <div>
      <Line data={chartData} options={options} />
      <div className="mt-4 space-y-2">
        {changePoints.map((cp, index) => (
          <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span className="font-medium">Index {cp.index || 'N/A'}</span>
            <div className="text-right">
              <div className="font-bold">
                {formatNumber(cp.value)}
              </div>
              <div className="text-sm text-gray-600">
                信頼度: {cp.confidence !== undefined ? (cp.confidence * 100).toFixed(1) : 'N/A'}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FactorAnalysisResults({ factorAnalysis }: { factorAnalysis: FactorAnalysisResult }) {
  console.log('FactorAnalysisResults received:', factorAnalysis)
  
  if (!factorAnalysis || !factorAnalysis.factors || !Array.isArray(factorAnalysis.factors)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>因子分析の結果が無効です。</p>
        <p className="text-xs mt-2">Expected object with factors array, got: {typeof factorAnalysis}</p>
      </div>
    )
  }
  
  if (factorAnalysis.factors.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>因子分析の結果がありません。</p>
      </div>
    )
  }
  
  const chartData = {
    labels: factorAnalysis.factors.map(f => f.name),
    datasets: [{
      label: '寄与率',
      data: factorAnalysis.factors.map(f => f.variance * 100),
      backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'],
    }]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2, // 横:縦=2:1の比率
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          boxWidth: 15,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: '因子分析結果',
        font: {
          size: 14
        }
      },
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10
      }
    }
  }

  return (
    <div>
      <div className="w-full max-w-2xl mx-auto mb-6">
        <Doughnut data={chartData} options={options} />
      </div>
      <div className="mt-4 space-y-4">
        {factorAnalysis.factors.map((factor, index) => (
          <div key={index} className="p-3 bg-gray-50 rounded">
            <h4 className="font-medium mb-2">
              {factor.name} (寄与率: {(factor.variance * 100).toFixed(1)}%)
            </h4>
            <div className="space-y-1">
              {factor.loadings.map((loading, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{loading.variable}</span>
                  <span className="font-mono">{formatNumber(loading.loading)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistogramResults({ data }: { data: Array<{ bin: string; count: number; frequency: number }> }) {
  console.log('HistogramResults received:', data)
  
  if (!data || !Array.isArray(data)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>ヒストグラムの結果が無効です。</p>
        <p className="text-xs mt-2">Expected array, got: {typeof data}</p>
      </div>
    )
  }
  
  if (data.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>ヒストグラムの結果がありません。</p>
      </div>
    )
  }
  
  const chartData = {
    labels: data.map(d => d.bin),
    datasets: [{
      label: '度数',
      data: data.map(d => d.count),
      backgroundColor: '#3b82f6',
    }]
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'ヒストグラム',
      },
    },
  }

  return (
    <div>
      <Bar data={chartData} options={options} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">区間</th>
              <th className="text-right p-2">度数</th>
              <th className="text-right p-2">頻度 (%)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="border-b">
                <td className="p-2 font-mono">{row.bin}</td>
                <td className="p-2 text-right">{formatNumber(row.count)}</td>
                <td className="p-2 text-right">{row.frequency}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TimeSeriesResults({ data }: { data: Array<{ time: string; value: number; count: number }> }) {
  console.log('TimeSeriesResults received:', data)
  
  if (!data || !Array.isArray(data)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>時系列分析の結果が無効です。</p>
        <p className="text-xs mt-2">Expected array, got: {typeof data}</p>
      </div>
    )
  }
  
  if (data.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>時系列分析の結果がありません。</p>
      </div>
    )
  }
  
  const chartData = {
    labels: data.map(d => d.time),
    datasets: [{
      label: '値',
      data: data.map(d => d.value),
      borderColor: '#3b82f6',
      backgroundColor: '#bfdbfe',
      fill: true,
    }]
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '時系列分析',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  }

  return (
    <div>
      <Line data={chartData} options={options} />
      <div className="mt-4 text-sm text-gray-600">
        データポイント数: {formatNumber(data.length)}
      </div>
    </div>
  )
}

function ColumnAnalysisResults({ data }: { data: ColumnAnalysisResult[] }) {
  console.log('ColumnAnalysisResults received:', data)
  
  // 安全なパーセンテージ表示のヘルパー関数
  const formatPercentage = (value: number | undefined | null): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.0'
    }
    return value.toFixed(1)
  }
  
  // 有効データパーセンテージの安全な計算
  const calculateValidDataPercentage = (column: ColumnAnalysisResult): string => {
    // データが0個の場合は0%（論理的に正しい表示）
    if (column.totalRows === 0) return '0.0'
    
    const nullPct = column.nullPercentage || 0
    const emptyPct = column.emptyStringPercentage || 0
    const validPct = 100 - nullPct - emptyPct
    
    if (isNaN(validPct)) return '0.0'
    return Math.max(0, validPct).toFixed(1)
  }
  
  // データが0個の場合の特別表示
  const getValidDataLabel = (column: ColumnAnalysisResult): string => {
    if (column.totalRows === 0) return '有効データ (データなし)'
    return '有効データ'
  }
  
  if (!data || !Array.isArray(data)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>カラム分析の結果が無効です。</p>
        <p className="text-xs mt-2">Expected array, got: {typeof data}</p>
      </div>
    )
  }
  
  if (data.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600">
        <p>カラム分析の結果がありません。</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {data.map((column, index) => (
        <div key={index} className="bg-gray-50 md:bg-white border rounded-lg p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h4 className="text-lg font-medium text-gray-900 break-words">{column.columnName}</h4>
              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                {column.dataType}
              </span>
            </div>
            <div className="text-left sm:text-right text-sm text-gray-600">
              総行数: {formatNumber(column.totalRows)}
            </div>
          </div>

          {/* 基本情報 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div className="text-center p-2 md:p-3 bg-white md:bg-gray-50 rounded">
              <div className="text-2xl font-bold text-blue-600">{formatNumber(column.uniqueValues)}</div>
              <div className="text-sm text-gray-600">ユニーク値</div>
            </div>
            <div className="text-center p-2 md:p-3 bg-white md:bg-gray-50 rounded">
              <div className="text-xl md:text-2xl font-bold text-red-600">{formatNumber(column.nullCount)}</div>
              <div className="text-xs md:text-sm text-gray-600">NULL値</div>
              <div className="text-xs text-gray-500">({formatPercentage(column.nullPercentage)}%)</div>
            </div>
            <div className="text-center p-2 md:p-3 bg-white md:bg-gray-50 rounded">
              <div className="text-xl md:text-2xl font-bold text-orange-600">{formatNumber(column.emptyStringCount)}</div>
              <div className="text-xs md:text-sm text-gray-600">空文字</div>
              <div className="text-xs text-gray-500">({formatPercentage(column.emptyStringPercentage)}%)</div>
            </div>
            <div className="text-center p-2 md:p-3 bg-white md:bg-gray-50 rounded">
              <div className="text-xl md:text-2xl font-bold text-green-600">
                {calculateValidDataPercentage(column)}%
              </div>
              <div className="text-xs md:text-sm text-gray-600">{getValidDataLabel(column)}</div>
            </div>
          </div>

          {/* 数値統計（数値型の場合） */}
          {column.numericStats && (
            <div className="mb-6">
              <h5 className="font-medium text-gray-900 mb-3">数値統計</h5>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="font-bold text-blue-700">{formatNumber(column.numericStats.min)}</div>
                  <div className="text-xs text-gray-600">最小値</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="font-bold text-blue-700">{formatNumber(column.numericStats.max)}</div>
                  <div className="text-xs text-gray-600">最大値</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="font-bold text-blue-700">{formatNumber(column.numericStats.mean)}</div>
                  <div className="text-xs text-gray-600">平均</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="font-bold text-blue-700">{formatNumber(column.numericStats.median)}</div>
                  <div className="text-xs text-gray-600">中央値</div>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="font-bold text-blue-700">{formatNumber(column.numericStats.std)}</div>
                  <div className="text-xs text-gray-600">標準偏差</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* 上位値 */}
            {column.topValues && column.topValues.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-3">上位値 (頻度順)</h5>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {column.topValues.map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 bg-gray-50 rounded text-sm gap-1 min-w-0">
                      <span className="break-all font-mono text-xs sm:text-sm flex-1 min-w-0">
                        {item.value || '(空)'}
                      </span>
                      <div className="text-right flex-shrink-0">
                        <span className="font-bold">{formatNumber(item.count)}</span>
                        <span className="text-gray-500 ml-2">({formatPercentage(item.percentage)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* サンプル値 */}
            <div>
              <h5 className="font-medium text-gray-900 mb-3">サンプル値</h5>
              <div className="flex flex-wrap gap-2">
                {column.sampleValues && column.sampleValues.length > 0 ? (
                  column.sampleValues.map((value, idx) => (
                    <span
                      key={idx}
                      className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded font-mono truncate max-w-24"
                      title={value}
                    >
                      {value || '(空)'}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500 text-sm">サンプル値がありません</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TextAnalysisResults({ data }: { data: any }) {
  console.log('TextAnalysisResults received:', data)
  
  if (!data || typeof data !== 'object') {
    return (
      <div className="text-center py-4 text-red-600">
        <p>テキスト分析の結果が無効です。</p>
      </div>
    )
  }

  const { statistics, wordFrequency, characterFrequency, patterns, language, sentences, readability } = data

  return (
    <div className="space-y-6">
      {/* 基本統計 */}
      {statistics && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">基本統計</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-700">{formatNumber(statistics.totalRecords)}</div>
              <div className="text-sm text-gray-600">総レコード数</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded">
              <div className="text-2xl font-bold text-green-700">{formatNumber(statistics.totalCharacters)}</div>
              <div className="text-sm text-gray-600">総文字数</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded">
              <div className="text-2xl font-bold text-purple-700">{formatNumber(statistics.totalWords)}</div>
              <div className="text-sm text-gray-600">総単語数</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded">
              <div className="text-2xl font-bold text-orange-700">{formatNumber(statistics.uniqueRecords)}</div>
              <div className="text-sm text-gray-600">ユニーク数</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.averageCharactersPerRecord)}</div>
              <div className="text-sm text-gray-600">平均文字数/レコード</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.averageWordsPerRecord)}</div>
              <div className="text-sm text-gray-600">平均単語数/レコード</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.uniquePercentage)}%</div>
              <div className="text-sm text-gray-600">ユニーク率</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.minCharacters)} - {formatNumber(statistics.maxCharacters)}</div>
              <div className="text-sm text-gray-600">文字数範囲</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.minWords)} - {formatNumber(statistics.maxWords)}</div>
              <div className="text-sm text-gray-600">単語数範囲</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(statistics.emptyPercentage)}%</div>
              <div className="text-sm text-gray-600">空レコード率</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* 単語頻度 */}
        {wordFrequency && wordFrequency.length > 0 && (
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">単語頻度 (上位15件)</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wordFrequency.map((item: WordFrequency, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-blue-50 rounded text-sm gap-1 min-w-0">
                  <span className="font-mono text-blue-900 font-medium break-all text-xs sm:text-sm flex-1 min-w-0">
                    {item.word}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-blue-700">{formatNumber(item.count)}</span>
                    <span className="text-blue-500 ml-2">({formatNumber(item.percentage)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 文字頻度 */}
        {characterFrequency && characterFrequency.length > 0 && (
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">文字頻度 (上位15件)</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {characterFrequency.map((item: CharacterFrequency, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-green-50 rounded text-sm">
                  <span className="font-mono text-green-900 font-bold text-lg">
                    {item.character}
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-green-700">{formatNumber(item.count)}</span>
                    <span className="text-green-500 ml-2">({formatNumber(item.percentage)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 言語・文字種分析 */}
      {language && language.languagePatterns && language.languagePatterns.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">言語・文字種分析</h4>
          <div className="mb-2">
            <span className="text-sm text-gray-600">
              平均文字列長: <span className="font-bold">{formatNumber(language.averageLength)}</span>文字
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {language.languagePatterns.map((pattern: any, idx: number) => (
              <div key={idx} className="text-center p-3 bg-purple-50 rounded">
                <div className="text-lg font-bold text-purple-700">{formatNumber(pattern.percentage)}%</div>
                <div className="text-sm text-gray-600">{pattern.pattern}</div>
                <div className="text-xs text-gray-500">({formatNumber(pattern.count)}文字)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* パターン分析 */}
      {patterns && patterns.patterns && patterns.patterns.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">パターン分析</h4>
          <div className="space-y-3">
            {patterns.patterns.map((pattern: any, idx: number) => (
              <div key={idx} className="p-4 bg-orange-50 border border-orange-200 rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-orange-900">{pattern.description}</span>
                  <div className="text-right">
                    <span className="font-bold text-orange-700">{formatNumber(pattern.count)}</span>
                    <span className="text-orange-500 ml-2">({formatNumber(pattern.percentage)}%)</span>
                  </div>
                </div>
                {pattern.examples && pattern.examples.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-600 mb-1">例:</div>
                    <div className="flex flex-wrap gap-1">
                      {pattern.examples.map((example: string, exIdx: number) => (
                        <span
                          key={exIdx}
                          className="inline-block bg-white text-orange-800 text-xs px-2 py-1 rounded border font-mono"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 文分析 */}
      {sentences && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">文分析</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-700">{formatNumber(sentences.totalSentences)}</div>
              <div className="text-sm text-gray-600">総文数</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded">
              <div className="text-2xl font-bold text-green-700">{formatNumber(sentences.averageSentenceLength)}</div>
              <div className="text-sm text-gray-600">平均文長(語数)</div>
            </div>
          </div>
          
          {/* 文長分布 */}
          {sentences.sentenceLengthDistribution && sentences.sentenceLengthDistribution.length > 0 && (
            <div className="mb-6">
              <h5 className="font-medium text-gray-900 mb-3">文長分布</h5>
              <div className="space-y-2">
                {sentences.sentenceLengthDistribution.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-blue-50 rounded">
                    <span className="font-medium text-blue-900">{item.range}</span>
                    <div className="text-right">
                      <span className="font-bold text-blue-700">{formatNumber(item.count)}</span>
                      <span className="text-blue-500 ml-2">({formatNumber(item.percentage)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 句読点使用分析 */}
          {sentences.punctuationUsage && sentences.punctuationUsage.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-900 mb-3">句読点使用状況</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sentences.punctuationUsage.map((item: any, idx: number) => (
                  <div key={idx} className="text-center p-3 bg-indigo-50 rounded">
                    <div className="text-2xl font-bold text-indigo-700 font-mono">{item.punctuation}</div>
                    <div className="text-sm font-bold text-indigo-600">{formatNumber(item.count)}</div>
                    <div className="text-xs text-gray-600">({formatNumber(item.percentage)}%)</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 読みやすさ分析 */}
      {readability && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">読みやすさ分析</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-teal-50 rounded-lg">
              <div className="text-3xl font-bold text-teal-700">{formatNumber(readability.readabilityScore)}</div>
              <div className="text-sm text-gray-600">読みやすさスコア</div>
              <div className="text-xs text-teal-600 mt-1">(0-100)</div>
            </div>
            <div className="text-center p-4 bg-teal-50 rounded-lg">
              <div className="text-lg font-bold text-teal-700">{readability.complexityLevel}</div>
              <div className="text-sm text-gray-600">複雑度レベル</div>
            </div>
            <div className="text-center p-4 bg-teal-50 rounded-lg">
              <div className="text-lg font-bold text-teal-700">{formatNumber(readability.averageWordsPerSentence)}</div>
              <div className="text-sm text-gray-600">平均語数/文</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-lg font-bold text-gray-700">{formatNumber(readability.averageCharactersPerWord)}</div>
              <div className="text-sm text-gray-600">平均文字数/語</div>
            </div>
          </div>
          
          {/* 改善提案 */}
          {readability.recommendations && readability.recommendations.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-900 mb-3">改善提案</h5>
              <div className="space-y-2">
                {readability.recommendations.map((recommendation: string, idx: number) => (
                  <div key={idx} className="p-3 bg-amber-50 border-l-4 border-amber-300 rounded">
                    <span className="text-amber-800">{recommendation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}