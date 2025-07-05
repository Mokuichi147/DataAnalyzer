import React, { useState, useEffect } from 'react'
import { BarChart, LineChart, PieChart, TrendingUp, Activity, Zap } from 'lucide-react'
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
  getTimeSeriesData as getTimeSeriesDataMemory
} from '@/lib/memoryStatistics'

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

type AnalysisType = 'basic' | 'correlation' | 'changepoint' | 'factor' | 'histogram' | 'timeseries'

interface AnalysisPanelProps {
  tableName: string
  columns: Array<{ name: string; type: string; nullable: boolean }>
}

export function AnalysisPanel({ tableName, columns }: AnalysisPanelProps) {
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType>('basic')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { setError } = useDataStore()
  
  console.log('AnalysisPanel props:', { tableName, columns })
  console.log('AnalysisPanel state:', { activeAnalysis, selectedColumns, analysisResults, isLoading })
  
  // 分析タイプが変更されたときに結果をクリア
  useEffect(() => {
    setAnalysisResults(null)
    setSelectedColumns([])
  }, [activeAnalysis])
  
  // テーブルが変更されたときに結果をクリア
  useEffect(() => {
    setAnalysisResults(null)
    setSelectedColumns([])
  }, [tableName])
  
  if (!tableName) {
    return <div className="text-center py-8 text-gray-500">テーブル名が設定されていません</div>
  }
  
  if (!columns || columns.length === 0) {
    return <div className="text-center py-8 text-gray-500">カラム情報が取得できません</div>
  }

  // 数値型の判定（メモリ内データストアの場合、すべてTEXTなので実際のデータから判定）
  const numericColumns = columns.filter(col => 
    col.type.includes('INT') || 
    col.type.includes('FLOAT') || 
    col.type.includes('DOUBLE') ||
    col.type.includes('DECIMAL') ||
    col.type.includes('NUMBER') ||
    // TEXTタイプでも数値として扱えるものを含める（仮で全て含める）
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
          if (selectedColumns.length === 1) {
            results = useMemoryStore 
              ? await getBasicStatisticsMemory(tableName, selectedColumns[0])
              : await getBasicStatisticsOriginal(tableName, selectedColumns[0])
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

  const analysisTypes = [
    { 
      key: 'basic' as const, 
      label: '基本統計量', 
      icon: BarChart, 
      description: '平均、標準偏差、四分位数など',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'correlation' as const, 
      label: '相関分析', 
      icon: TrendingUp, 
      description: '変数間の相関係数',
      minColumns: 2,
      maxColumns: 10
    },
    { 
      key: 'changepoint' as const, 
      label: '変化点検出', 
      icon: Zap, 
      description: '時系列データの変化点を検出',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'factor' as const, 
      label: '因子分析', 
      icon: Activity, 
      description: '主成分分析による次元削減',
      minColumns: 2,
      maxColumns: 10
    },
    { 
      key: 'histogram' as const, 
      label: 'ヒストグラム', 
      icon: BarChart, 
      description: 'データの分布を可視化',
      minColumns: 1,
      maxColumns: 1
    },
    { 
      key: 'timeseries' as const, 
      label: '時系列分析', 
      icon: LineChart, 
      description: '時間経過による変化を分析',
      minColumns: 1,
      maxColumns: 1
    }
  ]

  const currentAnalysisType = analysisTypes.find(t => t.key === activeAnalysis)
  const canRunAnalysis = selectedColumns.length >= (currentAnalysisType?.minColumns || 1) &&
                        selectedColumns.length <= (currentAnalysisType?.maxColumns || 10)

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
              setActiveAnalysis('basic')
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
            {isLoading ? '分析中...' : '分析実行'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {analysisTypes.map((type) => (
          <div
            key={type.key}
            onClick={() => setActiveAnalysis(type.key)}
            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              activeAnalysis === type.key
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center mb-2">
              <type.icon className="h-5 w-5 text-gray-600 mr-2" />
              <h3 className="font-medium text-gray-900">{type.label}</h3>
            </div>
            <p className="text-sm text-gray-600">{type.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">
          列選択 ({currentAnalysisType?.label})
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {currentAnalysisType?.description}
          {currentAnalysisType && (
            <span className="block mt-1">
              {currentAnalysisType.minColumns === 1 && currentAnalysisType.maxColumns === 1
                ? `1つの列を選択してください（ラジオボタン）`
                : currentAnalysisType.minColumns === currentAnalysisType.maxColumns
                ? `${currentAnalysisType.minColumns}個の列を選択してください（チェックボックス）`
                : `${currentAnalysisType.minColumns}-${currentAnalysisType.maxColumns}個の列を選択してください（チェックボックス）`
              }
            </span>
          )}
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {numericColumns.map((col) => {
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
        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-medium text-gray-900 mb-4">分析結果</h3>
          <AnalysisResults type={activeAnalysis} results={analysisResults} />
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
    default:
      return null
  }
}

function BasicStatsResults({ stats }: { stats: BasicStats }) {
  console.log('BasicStatsResults received:', stats)
  
  if (!stats || typeof stats !== 'object') {
    return (
      <div className="text-center py-4 text-red-600">
        <p>基本統計の結果が無効です。</p>
        <p className="text-xs mt-2">Expected object, got: {typeof stats}</p>
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