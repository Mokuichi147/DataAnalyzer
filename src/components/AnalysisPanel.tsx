import { useState, useEffect, useCallback } from 'react'
import { BarChart, LineChart, TrendingUp, Activity, Zap, Database, Type } from 'lucide-react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
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
  ScatterController,
} from 'chart.js'
import {
  getBasicStatistics as getBasicStatisticsOriginal,
  getCorrelationMatrix as getCorrelationMatrixOriginal,
  detectChangePoints as detectChangePointsOriginal,
  performFactorAnalysis as performFactorAnalysisOriginal,
  getHistogramData as getHistogramDataOriginal,
  getTimeSeriesData as getTimeSeriesDataOriginal,
  CorrelationResult,
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
  detectMissingData,
  prepareMissingDataChart,
  type MissingDataResult,
  type MissingDataOptions
} from '@/lib/missingDataDetection'

import {
  getTextStatistics,
  getWordFrequency,
  getCharacterFrequency,
  getTextPatternAnalysis,
  getLanguageDetectionAnalysis,
  getSentenceAnalysis,
  getReadabilityAnalysis,
  type WordFrequency,
  type CharacterFrequency
} from '@/lib/textAnalysis'

import {
  getChangePointChartOptions,
  getTimeSeriesChartOptions
} from '@/lib/chartOptimization'

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

// Safari環境での scatter chart サポートのため、動的に ScatterController を登録
try {
  ChartJS.register(ScatterController)
} catch (error) {
  console.warn('ScatterController registration failed:', error)
  // Safari環境では代替チャートタイプを使用
}

// テーマ対応の色パレットを取得する関数
function getThemeColors() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  
  if (isDark) {
    return {
      primary: '#60a5fa',      // blue-400
      success: '#4ade80',      // green-400
      warning: '#fbbf24',      // yellow-400
      danger: '#f87171',       // red-400
      secondary: '#9ca3af',    // gray-400
      info: '#38bdf8',         // sky-400
      purple: '#a78bfa',       // violet-400
      orange: '#fb923c',       // orange-400
      background: 'rgba(96, 165, 250, 0.2)', // blue-400 with opacity
      text: '#f3f4f6',         // gray-100
      gridLines: '#374151',    // gray-700
    }
  } else {
    return {
      primary: '#3b82f6',      // blue-500
      success: '#22c55e',      // green-500
      warning: '#f59e0b',      // yellow-500
      danger: '#ef4444',       // red-500
      secondary: '#6b7280',    // gray-500
      info: '#0ea5e9',         // sky-500
      purple: '#8b5cf6',       // violet-500
      orange: '#f97316',       // orange-500
      background: 'rgba(59, 130, 246, 0.1)', // blue-500 with opacity
      text: '#1f2937',         // gray-800
      gridLines: '#e5e7eb',    // gray-200
    }
  }
}

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

type AnalysisType = 'basic' | 'correlation' | 'changepoint' | 'factor' | 'histogram' | 'timeseries' | 'column' | 'text' | 'missing'

interface AnalysisPanelProps {
  tableName: string
  columns: Array<{ name: string; type: string; nullable: boolean }>
}

export function AnalysisPanel({ tableName, columns }: AnalysisPanelProps) {
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType>('column')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [xAxisColumn, setXAxisColumn] = useState<string>('index') // 横軸カラム選択
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [changePointAlgorithm, setChangePointAlgorithm] = useState<'moving_average' | 'cusum' | 'ewma' | 'binary_segmentation'>('moving_average')
  const [missingDataOptions, setMissingDataOptions] = useState<MissingDataOptions>({
    includeZero: true,
    includeEmpty: true
  })
  const [error, setError] = useState<string | null>(null)
  
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

  // 選択されたカラムやフィルタが変更されたとき、条件を満たしていれば自動実行
  useEffect(() => {
    if (selectedColumns.length > 0 && isValidColumnSelection() && !isLoading) {
      runAnalysis()
    }
  }, [selectedColumns, tableName])

  // 変化点検出アルゴリズムが変更されたとき、自動実行
  useEffect(() => {
    if (activeAnalysis === 'changepoint' && selectedColumns.length > 0 && isValidColumnSelection() && !isLoading) {
      runAnalysis()
    }
  }, [changePointAlgorithm])

  // 横軸カラムが変更されたとき、自動実行（時系列分析と変化点検出のみ）
  useEffect(() => {
    if ((activeAnalysis === 'timeseries' || activeAnalysis === 'changepoint') && selectedColumns.length > 0 && isValidColumnSelection() && !isLoading) {
      runAnalysis()
    }
  }, [xAxisColumn])

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

  // 横軸に使用可能なカラムを取得（数値型、日時型、INDEX）
  const getXAxisColumns = () => {
    const availableColumns = columns.filter(col => 
      col.type.includes('INT') || 
      col.type.includes('FLOAT') || 
      col.type.includes('DOUBLE') ||
      col.type.includes('DECIMAL') ||
      col.type.includes('NUMBER') ||
      col.type.includes('DATE') ||
      col.type.includes('TIME') ||
      col.type.includes('TIMESTAMP')
    )
    
    // INDEXオプションを先頭に追加
    return [{ name: 'index', type: 'INDEX', nullable: false, label: 'INDEX（行番号）' }, ...availableColumns.map(col => ({ ...col, label: col.name }))]
  }

  const availableColumns = getAvailableColumns()
  
  // 後方互換性のため numericColumns を維持
  // 数値カラムフィルタリング（未使用だが将来的に使用予定）
  // const numericColumns = columns.filter(col => 
  //   col.type.includes('INT') || 
  //   col.type.includes('FLOAT') || 
  //   col.type.includes('DOUBLE') ||
  //   col.type.includes('DECIMAL') ||
  //   col.type.includes('NUMBER') ||
  //   col.type === 'TEXT'
  // )

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
      console.log('🚀 Starting analysis:', { activeAnalysis, tableName, selectedColumns })
      let results: any = null
      
      // メモリ内データストアを使用（DuckDBのフォールバック判定）
      const useMemoryStore = true // 現在はメモリ内データストアを使用
      
      switch (activeAnalysis) {
        case 'basic':
          if (selectedColumns.length >= 1) {
            results = []
            for (const column of selectedColumns) {
              const stats = useMemoryStore
                ? await getBasicStatisticsMemory(tableName, column)
                : await getBasicStatisticsOriginal(tableName, column)
              results.push(stats)
            }
          }
          break
          
        case 'correlation':
          if (selectedColumns.length >= 2) {
            results = useMemoryStore
              ? await getCorrelationMatrixMemory(tableName, selectedColumns)
              : await getCorrelationMatrixOriginal(tableName, selectedColumns)
          }
          break
          
        case 'changepoint':
          if (selectedColumns.length >= 1) {
            results = useMemoryStore
              ? await detectChangePointsMemory(tableName, selectedColumns[0], { algorithm: changePointAlgorithm, xColumn: xAxisColumn })
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
              ? await getTimeSeriesDataMemory(tableName, selectedColumns[0], xAxisColumn)
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
          
        case 'missing':
          if (selectedColumns.length >= 1) {
            const startTime = performance.now()
            results = await detectMissingData(tableName, selectedColumns, missingDataOptions)
            const endTime = performance.now()
            
            // performanceMetricsを追加
            if (results) {
              results.performanceMetrics = {
                processingTime: Math.round(endTime - startTime),
                originalSize: results.events?.length || 0,
                processedSize: results.events?.length || 0
              }
            }
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
      
      console.log('📈 Analysis results:', results)
      console.log('📊 Analysis type:', activeAnalysis)
      console.log('🎯 Results type:', typeof results, results ? Object.keys(results) : 'null')
      
      if (results) {
        console.log('✅ Setting analysis results')
        setAnalysisResults(results)
      } else {
        console.warn('⚠️ No results returned from analysis')
        setError('分析結果が取得できませんでした')
      }
      
    } catch (error) {
      console.error('❌ Analysis error:', error)
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
      description: '【手法】Moving Average / CUSUM / EWMA / Binary Segmentation\n【内容】選択可能な4つのアルゴリズムでデータの急激な変化点を統計的に検出。小さな変化から大きな構造変化まで対応',
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
      key: 'missing' as const, 
      label: 'データ欠損検知', 
      icon: Activity, 
      description: '【手法】連続欠損パターン検出・統計的信頼度評価\n【内容】NULL値・空文字・0値の欠損開始/復旧タイミングを検出。欠損長・信頼度・カラム別統計を提供。データ品質監視に最適',
      minColumns: 1,
      maxColumns: 10
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
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-colors">
        <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        <p>分析を開始するためにテーブルを選択してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">分析・可視化</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setAnalysisResults(null)
              setSelectedColumns([])
              setActiveAnalysis('column')
            }}
            className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm transition-colors"
          >
            リセット
          </button>
          <button
            onClick={runAnalysis}
            disabled={!canRunAnalysis || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '分析中...' : '手動実行'}
          </button>
        </div>
      </div>


      {/* 分析タイプ選択：コンパクトなカード形式 */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 transition-colors">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 transition-colors">分析手法を選択</h3>
        <div className="max-h-64 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {analysisTypes.map((type) => (
              <div
                key={type.key}
                onClick={() => setActiveAnalysis(type.key)}
                className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 ${
                  activeAnalysis === type.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400 shadow-md'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-sm bg-white dark:bg-gray-700'
                }`}
              >
                <div className="flex flex-col items-center text-center space-y-1.5">
                  <type.icon className={`h-5 w-5 sm:h-6 sm:w-6 transition-colors ${
                    activeAnalysis === type.key ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                  }`} />
                  <h3 className={`text-xs font-medium leading-tight min-h-[2.5rem] flex items-center justify-center transition-colors ${
                    activeAnalysis === type.key ? 'text-blue-900 dark:text-blue-200' : 'text-gray-900 dark:text-gray-200'
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
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-600 rounded-lg p-4 transition-colors">
          <div className="flex items-start space-x-3">
            <currentAnalysisType.icon className="h-6 w-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0 transition-colors" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2 transition-colors">{currentAnalysisType.label}</h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-line transition-colors">
                {currentAnalysisType.description}
              </p>
            </div>
          </div>
        </div>
      )}


      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white transition-colors">
            列選択 ({currentAnalysisType?.label})
          </h3>
          {isLoading && (
            <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 transition-colors">
              <div className="w-4 h-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <span>分析実行中...</span>
            </div>
          )}
        </div>
        
        {/* 列選択の指示と警告 */}
        <div className="mb-4">
          {currentAnalysisType && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 transition-colors">
              {currentAnalysisType.minColumns === 1 && currentAnalysisType.maxColumns === 1
                ? `1つの列を選択してください（自動実行）`
                : currentAnalysisType.minColumns === currentAnalysisType.maxColumns
                ? `${currentAnalysisType.minColumns}個の列を選択してください（自動実行）`
                : `${currentAnalysisType.minColumns}-${currentAnalysisType.maxColumns}個の列を選択してください（自動実行）`
              }
            </p>
          )}
          {availableColumns.length === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-600 rounded-md p-3 transition-colors">
              <div className="flex items-center">
                <span className="text-amber-600 dark:text-amber-400 mr-2 transition-colors">⚠️</span>
                <span className="text-amber-800 dark:text-amber-200 text-sm font-medium transition-colors">
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
              className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              全て選択
              {currentAnalysisType.maxColumns < availableColumns.length && 
                ` (最大${currentAnalysisType.maxColumns}個)`
              }
            </button>
            <button
              onClick={handleDeselectAll}
              disabled={selectedColumns.length === 0}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              選択解除
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors">
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
                className={`flex items-center space-x-2 transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type={isSingleSelect ? "radio" : "checkbox"}
                  name={isSingleSelect ? "single-column-selection" : undefined}
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => handleColumnToggle(col.name)}
                  className="h-4 w-4 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 transition-colors"
                />
                <span className={`text-sm transition-colors ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                  {col.name}
                </span>
              </label>
            )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-colors">
            <p className="text-sm">この分析タイプに適したカラムがありません</p>
            <p className="text-xs mt-2">
              {activeAnalysis === 'basic' && '数値型のカラムが必要です'}
              {activeAnalysis === 'text' && 'TEXT型のカラムが必要です'}
              {(activeAnalysis === 'correlation' || activeAnalysis === 'factor') && '数値型のカラムが2つ以上必要です'}
            </p>
          </div>
        )}
        
      </div>

      {/* 変化点検出アルゴリズム選択 */}
      {activeAnalysis === 'changepoint' && availableColumns.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-600 rounded-lg p-4 transition-colors">
          <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-200 mb-3 flex items-center transition-colors">
            <Zap className="h-4 w-4 mr-2 text-yellow-600 dark:text-yellow-400 transition-colors" />
            変化点検出アルゴリズムを選択
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="changepoint-algorithm"
                value="moving_average"
                checked={changePointAlgorithm === 'moving_average'}
                onChange={(e) => setChangePointAlgorithm(e.target.value as any)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-200 transition-colors">移動平均法</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 transition-colors">短期・長期移動平均の差分で検出。安定した結果。</div>
              </div>
            </label>
            
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="changepoint-algorithm"
                value="cusum"
                checked={changePointAlgorithm === 'cusum'}
                onChange={(e) => setChangePointAlgorithm(e.target.value as any)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-200 transition-colors">CUSUM</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 transition-colors">累積和による検出。小さな変化にも敏感。</div>
              </div>
            </label>
            
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="changepoint-algorithm"
                value="ewma"
                checked={changePointAlgorithm === 'ewma'}
                onChange={(e) => setChangePointAlgorithm(e.target.value as any)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-200 transition-colors">EWMA</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 transition-colors">指数重み付き移動平均。最近のデータを重視。</div>
              </div>
            </label>
            
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="changepoint-algorithm"
                value="binary_segmentation"
                checked={changePointAlgorithm === 'binary_segmentation'}
                onChange={(e) => setChangePointAlgorithm(e.target.value as any)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-200 transition-colors">Binary Segmentation</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 transition-colors">再帰的分割法。複数の構造変化に適用。</div>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* 欠損検知オプション */}
      {activeAnalysis === 'missing' && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-600 rounded-lg p-4 transition-colors">
          <h4 className="text-sm font-medium text-orange-900 dark:text-orange-300 mb-3 flex items-center transition-colors">
            <Activity className="h-4 w-4 mr-2" />
            欠損検知オプション
          </h4>
          <div className="space-y-3">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={missingDataOptions.includeEmpty}
                onChange={(e) => setMissingDataOptions(prev => ({ ...prev, includeEmpty: e.target.checked }))}
                className="rounded border-orange-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">空文字を欠損として扱う</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={missingDataOptions.includeZero}
                onChange={(e) => setMissingDataOptions(prev => ({ ...prev, includeZero: e.target.checked }))}
                className="rounded border-orange-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">0値を欠損として扱う</span>
            </label>
          </div>
        </div>
      )}

      {/* 横軸カラム選択（時系列分析と変化点検出のみ） */}
      {(activeAnalysis === 'timeseries' || activeAnalysis === 'changepoint') && availableColumns.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-4 transition-colors">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3 flex items-center transition-colors">
            <LineChart className="h-4 w-4 mr-2" />
            横軸（X軸）カラムを選択
          </h4>
          <div className="mb-2">
            <select
              value={xAxisColumn}
              onChange={(e) => setXAxisColumn(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              {getXAxisColumns().map((col) => (
                <option key={col.name} value={col.name}>
                  {col.label || col.name} ({col.type})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 transition-colors">
            横軸に使用するカラムを選択してください。INDEXは行番号を表します。
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-lg p-4 transition-colors">
          <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
        </div>
      )}

      {analysisResults && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg p-4 md:p-6 transition-colors">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">分析結果</h3>
          <div className="overflow-hidden">
            <AnalysisResults type={activeAnalysis} results={analysisResults} />
          </div>
        </div>
      )}
    </div>
  )
}

// パフォーマンス情報表示コンポーネント
function PerformanceInfo({ performanceInfo, samplingInfo }: { 
  performanceInfo?: any, 
  samplingInfo?: any 
}) {
  if (!performanceInfo && !samplingInfo) return null

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-3 mb-4 transition-colors">
      <div className="flex items-center space-x-2 mb-2">
        <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-medium text-blue-900 dark:text-blue-300 transition-colors">パフォーマンス情報</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {performanceInfo && (
          <>
            <div>
              <div className="text-blue-600 dark:text-blue-400 font-medium transition-colors">処理時間</div>
              <div className="text-blue-900 dark:text-blue-200 transition-colors">{performanceInfo.processingTime || 0}ms</div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400 font-medium transition-colors">データサイズ</div>
              <div className="text-blue-900 dark:text-blue-200 transition-colors">
                {(performanceInfo.originalSize || 0).toLocaleString()} → {(performanceInfo.processedSize || 0).toLocaleString()}
              </div>
            </div>
          </>
        )}
        
        {samplingInfo && (
          <>
            <div>
              <div className="text-blue-600 dark:text-blue-400 font-medium transition-colors">サンプリング率</div>
              <div className="text-blue-900 dark:text-blue-200 transition-colors">{(samplingInfo.samplingRatio * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-blue-600 dark:text-blue-400 font-medium transition-colors">手法</div>
              <div className="text-blue-900 dark:text-blue-200 transition-colors">{samplingInfo.method}</div>
            </div>
          </>
        )}
      </div>
      
      {samplingInfo && (
        <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 transition-colors">
          💡 大量データのため、{samplingInfo.method}手法でサンプリングを適用しました
        </div>
      )}
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
    case 'missing':
      return <MissingDataResults data={results} />
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
    
    return <BasicStatsTable stats={stats} />
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
        <div key={item.label} className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
          <div className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">{item.value}</div>
          <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">{item.label}</div>
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
      backgroundColor: correlations.map(c => {
        const colors = getThemeColors()
        return c.correlation > 0.7 ? colors.success : 
               c.correlation > 0.3 ? colors.primary : 
               c.correlation < -0.7 ? colors.danger : 
               c.correlation < -0.3 ? colors.warning : colors.secondary
      }),
    }]
  }

  const themeColors = getThemeColors()
  
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: themeColors.text,
        },
      },
      title: {
        display: true,
        text: '相関係数マトリックス',
        color: themeColors.text,
      },
    },
    scales: {
      x: {
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
      y: {
        beginAtZero: true,
        min: -1,
        max: 1,
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
    },
  }

  return (
    <div>
      <Bar data={chartData} options={options} />
      
      {/* 相関分析詳細テーブル */}
      <CorrelationTable correlations={correlations} />
    </div>
  )
}

function ChangePointResults({ changePoints }: { changePoints: any }) {
  console.log('ChangePointResults received:', changePoints)
  
  // 新しい形式の結果（最適化済み）かどうかを判定
  const isOptimizedResult = changePoints && typeof changePoints === 'object' && 
    'changePoints' in changePoints && 'chartData' in changePoints
  
  if (isOptimizedResult) {
    // 最適化された結果の表示
    const { changePoints: points, chartData, samplingInfo, performanceMetrics, statistics } = changePoints
    
    if (!points || points.length === 0) {
      return (
        <div>
          <PerformanceInfo 
            performanceInfo={performanceMetrics || null} 
            samplingInfo={samplingInfo || null} 
          />
          <div className="text-center py-4 text-gray-600">
            <p>変化点が検出されませんでした。</p>
          </div>
        </div>
      )
    }

    const options = getChangePointChartOptions(performanceMetrics?.processedSize || points.length) as any

    return (
      <div>
        <PerformanceInfo 
          performanceInfo={performanceMetrics || null} 
          samplingInfo={samplingInfo || null} 
        />
        
        {/* 統計情報の表示 */}
        {statistics && (
          <div className="space-y-4 mb-4">
            {/* アルゴリズム情報 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-3 transition-colors">
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-300 transition-colors">
                  使用アルゴリズム: {statistics.algorithm || 'Moving Average'}
                </span>
              </div>
            </div>
            
            {/* 統計指標 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
                <div className="text-xl font-bold text-gray-900 dark:text-white transition-colors">{points.length}</div>
                <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">変化点数</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
                <div className="text-xl font-bold text-gray-900 dark:text-white transition-colors">{(statistics.averageConfidence * 100).toFixed(1)}%</div>
                <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均信頼度</div>
              </div>
              {statistics.threshold && (
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
                  <div className="text-xl font-bold text-gray-900 dark:text-white transition-colors">{formatNumber(statistics.threshold)}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">検出閾値</div>
                </div>
              )}
              {statistics.globalStd && (
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
                  <div className="text-xl font-bold text-gray-900 dark:text-white transition-colors">{formatNumber(statistics.globalStd)}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">標準偏差</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="h-80 mb-6">
          <Line data={chartData} options={options} />
        </div>

        {/* 変化点詳細テーブル */}
        <ChangePointTable points={points} />
      </div>
    )
  }

  // 従来形式の結果（配列）の処理
  if (!changePoints || !Array.isArray(changePoints)) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>変化点検出の結果が無効です。</p>
        <p className="text-xs mt-2">Expected array or optimized result, got: {typeof changePoints}</p>
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
  
  const colors = getThemeColors()
  
  const chartData = {
    labels: changePoints.map(cp => `Point ${cp.index || 'N/A'}`),
    datasets: [{
      label: '変化点',
      data: changePoints.map(cp => cp.value || 0),
      borderColor: colors.danger,
      backgroundColor: colors.danger + '20', // Add transparency
      pointBackgroundColor: changePoints.map(cp => 
        (cp.confidence || 0) > 0.8 ? colors.danger : 
        (cp.confidence || 0) > 0.6 ? colors.warning : colors.secondary
      ),
      pointBorderColor: changePoints.map(cp => 
        (cp.confidence || 0) > 0.8 ? colors.danger : 
        (cp.confidence || 0) > 0.6 ? colors.warning : colors.secondary
      ),
      pointBorderWidth: 0,
      pointRadius: changePoints.map(cp => 1 + (cp.confidence || 0) * 2),
      pointHoverRadius: changePoints.map(cp => 2 + (cp.confidence || 0) * 3),
    }]
  }

  const options = getChangePointChartOptions(changePoints.length) as any

  return (
    <div>
      <Line data={chartData} options={options} />
      
      {/* 変化点詳細表示 */}
      <div className="mt-4 space-y-2">
        {changePoints.map((cp, index) => (
          <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
            <span className="font-medium text-gray-900 dark:text-white transition-colors">Index {cp.index || 'N/A'}</span>
            <div className="text-right">
              <div className="font-bold text-gray-900 dark:text-white transition-colors">
                {formatNumber(cp.value)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">
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
  
  const colors = getThemeColors()
  
  const chartData = {
    labels: factorAnalysis.factors.map(f => f.name),
    datasets: [{
      label: '寄与率',
      data: factorAnalysis.factors.map(f => f.variance * 100),
      backgroundColor: [colors.primary, colors.success, colors.warning, colors.danger, colors.purple, colors.orange],
    }]
  }

  const themeColors = getThemeColors()
  
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
          },
          color: themeColors.text,
        }
      },
      title: {
        display: true,
        text: '因子分析結果',
        font: {
          size: 14
        },
        color: themeColors.text,
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
          <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
            <h4 className="font-medium mb-2 text-gray-900 dark:text-white transition-colors">
              {factor.name} (寄与率: {(factor.variance * 100).toFixed(1)}%)
            </h4>
            <div className="space-y-1">
              {factor.loadings.map((loading, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-900 dark:text-white transition-colors">{loading.variable}</span>
                  <span className="font-mono text-gray-900 dark:text-white transition-colors">{formatNumber(loading.loading)}</span>
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
  
  const colors = getThemeColors()
  
  const chartData = {
    labels: data.map(d => d.bin),
    datasets: [{
      label: '度数',
      data: data.map(d => d.count),
      backgroundColor: colors.primary,
    }]
  }

  const themeColors = getThemeColors()
  
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: themeColors.text,
        },
      },
      title: {
        display: true,
        text: 'ヒストグラム',
        color: themeColors.text,
      },
    },
    scales: {
      x: {
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
      y: {
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
    },
  }

  return (
    <div>
      <Bar data={chartData} options={options} />
      
      {/* ヒストグラム詳細テーブル */}
      <HistogramTable data={data} />
    </div>
  )
}

function TimeSeriesResults({ data }: { data: any }) {
  console.log('TimeSeriesResults received:', data)
  
  // 新しい形式の結果（最適化済み）かどうかを判定
  const isOptimizedResult = data && typeof data === 'object' && 
    'data' in data && 'chartData' in data
  
  if (isOptimizedResult) {
    // 最適化された結果の表示
    const { data: timeSeriesData, chartData, samplingInfo, performanceMetrics, statistics } = data
    
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return (
        <div>
          <PerformanceInfo 
            performanceInfo={performanceMetrics} 
            samplingInfo={samplingInfo} 
          />
          <div className="text-center py-4 text-gray-600">
            <p>時系列データがありません。</p>
          </div>
        </div>
      )
    }

    const options = getTimeSeriesChartOptions(performanceMetrics?.processedSize || timeSeriesData.length) as any

    return (
      <div>
        <PerformanceInfo 
          performanceInfo={performanceMetrics || null} 
          samplingInfo={samplingInfo || null} 
        />
        
        {/* 統計情報の表示 */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-xl font-bold text-gray-900 dark:text-white">{timeSeriesData.length}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">データ点数</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-xl font-bold text-gray-900 dark:text-white">{formatNumber(statistics.mean)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均値</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-xl font-bold text-gray-900 dark:text-white">{statistics.trend.direction === 'increasing' ? '↗️' : statistics.trend.direction === 'decreasing' ? '↘️' : '→'}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">トレンド</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-xl font-bold text-gray-900 dark:text-white">{statistics.movingAverageWindow}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">移動平均期間</div>
            </div>
          </div>
        )}

        <div className="h-80 mb-6">
          <Line data={chartData} options={options} />
        </div>

        {/* トレンド情報 */}
        {statistics?.trend && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors mb-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">トレンド分析</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-300 transition-colors">傾き: </span>
                <span className="font-mono text-gray-900 dark:text-white transition-colors">{formatNumber(statistics.trend.slope)}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-300 transition-colors">切片: </span>
                <span className="font-mono text-gray-900 dark:text-white transition-colors">{formatNumber(statistics.trend.intercept)}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-300 transition-colors">方向: </span>
                <span className={`font-medium transition-colors ${
                  statistics.trend.direction === 'increasing' ? 'text-green-600 dark:text-green-400' :
                  statistics.trend.direction === 'decreasing' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-600 dark:text-gray-300'
                }`}>
                  {statistics.trend.direction === 'increasing' ? '上昇傾向' :
                   statistics.trend.direction === 'decreasing' ? '下降傾向' : '安定'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 時系列データテーブル */}
        <TimeSeriesTable data={timeSeriesData} />
      </div>
    )
  }

  // 従来形式の結果（配列）の処理
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
  
  const colors = getThemeColors()
  
  const chartData = {
    labels: data.map(d => d.time),
    datasets: [{
      label: '値',
      data: data.map(d => d.value),
      borderColor: colors.primary,
      backgroundColor: colors.background,
      fill: true,
    }]
  }

  const themeColors = getThemeColors()
  
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: themeColors.text,
        },
      },
      title: {
        display: true,
        text: '時系列分析',
        color: themeColors.text,
      },
    },
    scales: {
      x: {
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: themeColors.text,
        },
        grid: {
          color: themeColors.gridLines,
        },
      },
    },
  }

  return (
    <div>
      <Line data={chartData} options={options} />
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-300 transition-colors">
        データポイント数: {formatNumber(data.length)}
      </div>
      
      {/* 時系列データテーブル */}
      <TimeSeriesTable data={data} />
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
    <div className="space-y-3">
      {data.map((column, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg p-3 md:p-4 transition-colors">
          {/* ヘッダー部分 - コンパクト化 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-medium text-gray-900 dark:text-white break-words">{column.columnName}</h4>
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded transition-colors">
                {column.dataType}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {formatNumber(column.totalRows)}行
            </div>
          </div>

          {/* 基本情報 - 横並び・コンパクト化 */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-3 py-1 transition-colors">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.uniqueValues)}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">ユニーク</span>
            </div>
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded px-3 py-1 transition-colors">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">{formatNumber(column.nullCount)}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">NULL({formatPercentage(column.nullPercentage)}%)</span>
            </div>
            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded px-3 py-1 transition-colors">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{formatNumber(column.emptyStringCount)}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">空文字({formatPercentage(column.emptyStringPercentage)}%)</span>
            </div>
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded px-3 py-1 transition-colors">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">{calculateValidDataPercentage(column)}%</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                {column.totalRows === 0 ? '有効データ (データなし)' : '有効データ'}
              </span>
            </div>
          </div>

          {/* 数値統計（数値型の場合） - 横並び・コンパクト化 */}
          {column.numericStats && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 transition-colors">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.numericStats.min)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">最小</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 transition-colors">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.numericStats.max)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">最大</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 transition-colors">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.numericStats.mean)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">平均</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 transition-colors">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.numericStats.median)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">中央値</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 transition-colors">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{formatNumber(column.numericStats.std)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300">標準偏差</span>
                </div>
              </div>
            </div>
          )}

          {/* 上位値とサンプル値 - 折りたたみ可能 */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white py-1">
              詳細データ
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 group-open:hidden">（クリックで展開）</span>
            </summary>
            <div className="mt-2 grid md:grid-cols-2 gap-4">
              {/* 上位値 */}
              {column.topValues && column.topValues.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">上位値</h5>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {column.topValues.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-1 bg-gray-50 dark:bg-gray-700 rounded text-xs transition-colors">
                        <span className="break-all font-mono truncate flex-1 min-w-0 text-gray-900 dark:text-white">
                          {item.value || '(空)'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                          {formatNumber(item.count)}({formatPercentage(item.percentage)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* サンプル値 */}
              <div>
                <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2 transition-colors">サンプル値</h5>
                <div className="flex flex-wrap gap-1">
                  {column.sampleValues && column.sampleValues.length > 0 ? (
                    column.sampleValues.slice(0, 8).map((value, idx) => (
                      <span
                        key={idx}
                        className="bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded font-mono truncate max-w-20 transition-colors"
                        title={value}
                      >
                        {value || '(空)'}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 text-xs transition-colors">サンプル値なし</span>
                  )}
                </div>
              </div>
            </div>
          </details>
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
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">基本統計</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatNumber(statistics.totalRecords)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">総レコード数</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{formatNumber(statistics.totalCharacters)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">総文字数</div>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatNumber(statistics.totalWords)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">総単語数</div>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatNumber(statistics.uniqueRecords)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">ユニーク数</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.averageCharactersPerRecord)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均文字数/レコード</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.averageWordsPerRecord)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均単語数/レコード</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.uniquePercentage)}%</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">ユニーク率</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.minCharacters)} - {formatNumber(statistics.maxCharacters)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">文字数範囲</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.minWords)} - {formatNumber(statistics.maxWords)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">単語数範囲</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(statistics.emptyPercentage)}%</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">空レコード率</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* 単語頻度 */}
        {wordFrequency && wordFrequency.length > 0 && (
          <div>
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">単語頻度 (上位15件)</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wordFrequency.map((item: WordFrequency, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-sm gap-1 min-w-0 transition-colors">
                  <span className="font-mono text-blue-900 dark:text-blue-200 font-medium break-all text-xs sm:text-sm flex-1 min-w-0 transition-colors">
                    {item.word}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-blue-700 dark:text-blue-300 transition-colors">{formatNumber(item.count)}</span>
                    <span className="text-blue-500 dark:text-blue-400 ml-2 transition-colors">({formatNumber(item.percentage)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 文字頻度 */}
        {characterFrequency && characterFrequency.length > 0 && (
          <div>
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">文字頻度 (上位15件)</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {characterFrequency.map((item: CharacterFrequency, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded text-sm transition-colors">
                  <span className="font-mono text-green-900 dark:text-green-200 font-bold text-lg transition-colors">
                    {item.character}
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-green-700 dark:text-green-300 transition-colors">{formatNumber(item.count)}</span>
                    <span className="text-green-500 dark:text-green-400 ml-2 transition-colors">({formatNumber(item.percentage)}%)</span>
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
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">言語・文字種分析</h4>
          <div className="mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-300 transition-colors">
              平均文字列長: <span className="font-bold">{formatNumber(language.averageLength)}</span>文字
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {language.languagePatterns.map((pattern: any, idx: number) => (
              <div key={idx} className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded transition-colors">
                <div className="text-lg font-bold text-purple-700 dark:text-purple-300">{formatNumber(pattern.percentage)}%</div>
                <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">{pattern.pattern}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">({formatNumber(pattern.count)}文字)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* パターン分析 */}
      {patterns && patterns.patterns && patterns.patterns.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">パターン分析</h4>
          <div className="space-y-3">
            {patterns.patterns.map((pattern: any, idx: number) => (
              <div key={idx} className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-600 rounded transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-orange-900 dark:text-orange-300 transition-colors">{pattern.description}</span>
                  <div className="text-right">
                    <span className="font-bold text-orange-700 dark:text-orange-300 transition-colors">{formatNumber(pattern.count)}</span>
                    <span className="text-orange-500 dark:text-orange-400 ml-2 transition-colors">({formatNumber(pattern.percentage)}%)</span>
                  </div>
                </div>
                {pattern.examples && pattern.examples.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1 transition-colors">例:</div>
                    <div className="flex flex-wrap gap-1">
                      {pattern.examples.map((example: string, exIdx: number) => (
                        <span
                          key={exIdx}
                          className="inline-block bg-white dark:bg-gray-700 text-orange-800 dark:text-orange-300 text-xs px-2 py-1 rounded border dark:border-gray-600 font-mono transition-colors"
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
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">文分析</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatNumber(sentences.totalSentences)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">総文数</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded transition-colors">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{formatNumber(sentences.averageSentenceLength)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均文長(語数)</div>
            </div>
          </div>
          
          {/* 文長分布 */}
          {sentences.sentenceLengthDistribution && sentences.sentenceLengthDistribution.length > 0 && (
            <div className="mb-6">
              <h5 className="font-medium text-gray-900 dark:text-white mb-3 transition-colors">文長分布</h5>
              <div className="space-y-2">
                {sentences.sentenceLengthDistribution.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded transition-colors">
                    <span className="font-medium text-blue-900 dark:text-blue-200 transition-colors">{item.range}</span>
                    <div className="text-right">
                      <span className="font-bold text-blue-700 dark:text-blue-300 transition-colors">{formatNumber(item.count)}</span>
                      <span className="text-blue-500 dark:text-blue-400 ml-2 transition-colors">({formatNumber(item.percentage)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 句読点使用分析 */}
          {sentences.punctuationUsage && sentences.punctuationUsage.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white mb-3 transition-colors">句読点使用状況</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {sentences.punctuationUsage.map((item: any, idx: number) => (
                  <div key={idx} className="text-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded transition-colors">
                    <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 font-mono">{item.punctuation}</div>
                    <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 transition-colors">{formatNumber(item.count)}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 transition-colors">({formatNumber(item.percentage)}%)</div>
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
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">読みやすさ分析</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg transition-colors">
              <div className="text-3xl font-bold text-teal-700 dark:text-teal-300">{formatNumber(readability.readabilityScore)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">読みやすさスコア</div>
              <div className="text-xs text-teal-600 dark:text-teal-400 mt-1 transition-colors">(0-100)</div>
            </div>
            <div className="text-center p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg transition-colors">
              <div className="text-lg font-bold text-teal-700 dark:text-teal-300">{readability.complexityLevel}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">複雑度レベル</div>
            </div>
            <div className="text-center p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg transition-colors">
              <div className="text-lg font-bold text-teal-700 dark:text-teal-300">{formatNumber(readability.averageWordsPerSentence)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均語数/文</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded transition-colors">
              <div className="text-lg font-bold text-gray-700 dark:text-gray-200 transition-colors">{formatNumber(readability.averageCharactersPerWord)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">平均文字数/語</div>
            </div>
          </div>
          
          {/* 改善提案 */}
          {readability.recommendations && readability.recommendations.length > 0 && (
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white mb-3 transition-colors">改善提案</h5>
              <div className="space-y-2">
                {readability.recommendations.map((recommendation: string, idx: number) => (
                  <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-300 dark:border-amber-600 rounded transition-colors">
                    <span className="text-amber-800 dark:text-amber-300 transition-colors">{recommendation}</span>
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

function MissingDataResults({ data }: { data: MissingDataResult & { performanceMetrics?: any } }) {
  console.log('MissingDataResults received:', data)
  
  if (!data || !data.events) {
    return (
      <div className="text-center py-4 text-red-600">
        <p>欠損検知の結果が無効です。</p>
      </div>
    )
  }

  const { events, summary, columnStats, performanceMetrics } = data

  // イベントを時系列の逆順にソート（最新が先頭）
  const sortedEvents = [...events].sort((a, b) => b.rowIndex - a.rowIndex)

  // チャートデータの準備
  const chartData = prepareMissingDataChart(data, 'defaultTable')

  return (
    <div className="space-y-6">
      {/* パフォーマンス情報 */}
      <PerformanceInfo 
        performanceInfo={performanceMetrics || null} 
        samplingInfo={null} 
      />
      
      {/* サマリー統計 */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">欠損検知サマリー</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded transition-colors">
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{formatNumber(summary.totalEvents)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">総イベント数</div>
          </div>
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded transition-colors">
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatNumber(summary.missingStartEvents)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">欠損開始</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded transition-colors">
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{formatNumber(summary.missingEndEvents)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">欠損復旧</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded transition-colors">
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatNumber(summary.longestMissingStreak)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 transition-colors">最長欠損期間</div>
          </div>
        </div>
      </div>

      {/* カラム別統計 */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors">カラム別統計</h4>
        <div className="space-y-3">
          {Object.entries(columnStats).map(([columnName, stats]: [string, any]) => (
            <div key={columnName} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-gray-900 dark:text-white transition-colors">{columnName}</h5>
                <span className="text-sm text-gray-600 dark:text-gray-300 transition-colors">{formatNumber(stats.missingPercentage)}% 欠損</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-300 transition-colors">イベント数: </span>
                  <span className="font-medium text-gray-900 dark:text-white transition-colors">{stats.totalMissingEvents}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-300 transition-colors">平均欠損期間: </span>
                  <span className="font-medium text-gray-900 dark:text-white transition-colors">{formatNumber(stats.averageMissingLength)}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-300 transition-colors">最大欠損期間: </span>
                  <span className="font-medium text-gray-900 dark:text-white transition-colors">{stats.maxMissingLength}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 欠損イベント一覧 */}
      {events.length > 0 && (
        <MissingDataTable events={sortedEvents} />
      )}

      {/* チャート表示 */}
      {chartData && chartData.datasets.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">欠損パターン可視化</h4>
          <div className="bg-white dark:bg-gray-800 p-4 border dark:border-gray-600 rounded-lg transition-colors">
            <Line 
              data={chartData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                  title: {
                    display: true,
                    text: '欠損イベントの時系列分布'
                  }
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: '行番号'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'カラム'
                    },
                    type: 'linear' as const,
                    ticks: {
                      stepSize: 1
                    }
                  }
                }
              }}
              height={300}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface MissingDataTableProps {
  events: any[]
}

function MissingDataTable({ events }: MissingDataTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>欠損イベントの詳細データがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(events.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentEvents = events.slice(startIndex, endIndex)
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">欠損イベント詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 transition-colors">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  行番号
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  カラム
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  イベント
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  値
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  欠損期間
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {currentEvents.map((event, index) => (
                <tr key={index} className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  event.eventType === 'missing_start' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'
                }`}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors">
                    {event.rowIndex}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white transition-colors">
                    {event.columnName}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      event.eventType === 'missing_start' 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' 
                        : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    }`}>
                      {event.eventType === 'missing_start' ? '欠損開始' : '欠損復旧'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors">
                    {event.value === null ? 'NULL' : event.value === '' ? '(空)' : String(event.value)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white transition-colors">
                    {event.missingLength ? `${event.missingLength}行` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({events.length}件)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-orange-700 dark:text-orange-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, events.length)} / 全{events.length}件の欠損イベント
        </div>
      </div>
    </div>
  )
}

interface TimeSeriesTableProps {
  data: any[]
}

function TimeSeriesTable({ data }: TimeSeriesTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>時系列データがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(data.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = data.slice(startIndex, endIndex)
  
  // データの構造を確認して適切な列を決定
  const hasMovingAverage = data.some(row => row.movingAverage !== undefined)
  const hasTrend = data.some(row => row.trend !== undefined)
  
  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">時系列データ詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 transition-colors">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  時間
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  値
                </th>
                {hasMovingAverage && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                    移動平均
                  </th>
                )}
                {hasTrend && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                    トレンド値
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {currentData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white transition-colors">
                    {row.time || row.label || `Point ${startIndex + index + 1}`}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">
                    {formatNumber(row.value)}
                  </td>
                  {hasMovingAverage && (
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">
                      {row.movingAverage !== undefined ? formatNumber(row.movingAverage) : '-'}
                    </td>
                  )}
                  {hasTrend && (
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">
                      {row.trend !== undefined ? formatNumber(row.trend) : '-'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({data.length}件)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-blue-700 dark:text-blue-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, data.length)} / 全{data.length}件の時系列データ
        </div>
      </div>
    </div>
  )
}

interface BasicStatsTableProps {
  stats: any[]
}

function BasicStatsTable({ stats }: BasicStatsTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!stats || stats.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>基本統計データがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(stats.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentStats = stats.slice(startIndex, endIndex)
  
  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">基本統計詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 transition-colors">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">列名</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">件数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">平均</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">標準偏差</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">最小値</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">最大値</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">Q1</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">中央値</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">Q3</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {currentStats.map((stat, index) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white transition-colors">{stat.columnName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.count)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.mean)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.std)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.min)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.max)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.quartiles?.q1)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.quartiles?.q2)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(stat.quartiles?.q3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({stats.length}列)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-green-700 dark:text-green-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, stats.length)} / 全{stats.length}列の基本統計
        </div>
      </div>
    </div>
  )
}

interface CorrelationTableProps {
  correlations: any[]
}

function CorrelationTable({ correlations }: CorrelationTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!correlations || correlations.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>相関分析データがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(correlations.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCorrelations = correlations.slice(startIndex, endIndex)
  
  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">相関分析詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="space-y-2">
        {currentCorrelations.map((corr, index) => (
          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors">
            <span className="font-medium text-gray-900 dark:text-white transition-colors">{corr.column1} × {corr.column2}</span>
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-3 h-3 rounded-full ${
                Math.abs(corr.correlation) > 0.7 ? 'bg-red-500 dark:bg-red-400' :
                Math.abs(corr.correlation) > 0.3 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-gray-400 dark:bg-gray-500'
              }`}></span>
              <span className={`font-bold font-mono transition-colors ${
                Math.abs(corr.correlation) > 0.7 ? 'text-red-600 dark:text-red-400' :
                Math.abs(corr.correlation) > 0.3 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
              }`}>
                {formatNumber(corr.correlation)}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({correlations.length}組み合わせ)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-purple-700 dark:text-purple-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, correlations.length)} / 全{correlations.length}組み合わせの相関係数
        </div>
      </div>
    </div>
  )
}

interface HistogramTableProps {
  data: Array<{ bin: string; count: number; frequency: number }>
}

function HistogramTable({ data }: HistogramTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>ヒストグラムデータがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(data.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = data.slice(startIndex, endIndex)
  
  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">ヒストグラム詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 transition-colors">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">区間</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">度数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">頻度 (%)</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {currentData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors">{row.bin}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{formatNumber(row.count)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors text-right">{row.frequency}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({data.length}区間)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-yellow-700 dark:text-yellow-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, data.length)} / 全{data.length}区間のヒストグラム
        </div>
      </div>
    </div>
  )
}

interface ChangePointTableProps {
  points: any[]
}

function ChangePointTable({ points }: ChangePointTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  if (!points || points.length === 0) {
    return (
      <div className="text-center py-4 text-gray-600 dark:text-gray-400 transition-colors">
        <p>変化点の詳細データがありません。</p>
      </div>
    )
  }
  
  // ページネーション計算
  const totalPages = Math.ceil(points.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentPoints = points.slice(startIndex, endIndex)
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-medium text-gray-900 dark:text-white transition-colors">変化点詳細</h4>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-700 dark:text-gray-300 transition-colors">表示件数:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value={5} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">5</option>
            <option value={10} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">10</option>
            <option value={25} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">25</option>
            <option value={50} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">50</option>
          </select>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 transition-colors">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  インデックス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  値
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  信頼度
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider transition-colors">
                  アルゴリズム
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {currentPoints.map((point, index) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors">
                    {point.index !== undefined ? point.index : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white transition-colors">
                    {formatNumber(point.value)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white transition-colors">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${
                        (point.confidence || 0) > 0.8 ? 'bg-green-500 dark:bg-green-400' :
                        (point.confidence || 0) > 0.6 ? 'bg-yellow-500 dark:bg-yellow-400' :
                        (point.confidence || 0) > 0.4 ? 'bg-orange-500 dark:bg-orange-400' : 'bg-red-500 dark:bg-red-400'
                      }`}></span>
                      <span className="font-mono text-gray-900 dark:text-white transition-colors">
                        {point.confidence !== undefined ? (point.confidence * 100).toFixed(1) : 'N/A'}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 transition-colors">
                    {point.algorithm || 'Moving Average'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最初
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              前へ
            </button>
          </div>
          
          <div className="flex items-center justify-center">
            <span className="text-sm text-gray-700 dark:text-gray-300 transition-colors">
              {currentPage} / {totalPages} ページ ({points.length}件)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              次へ
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-colors"
            >
              最後
            </button>
          </div>
        </div>
      )}
      
      {/* 統計情報 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-3 transition-colors">
        <div className="text-sm text-blue-700 dark:text-blue-300 transition-colors">
          <span className="font-medium">表示中:</span> {startIndex + 1}-{Math.min(endIndex, points.length)} / 全{points.length}件の変化点
        </div>
      </div>
    </div>
  )
}