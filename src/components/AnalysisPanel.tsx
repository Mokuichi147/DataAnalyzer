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
  getBasicStatistics,
  getCorrelationMatrix,
  detectChangePoints,
  performFactorAnalysis,
  getHistogramData,
  getTimeSeriesData,
  BasicStats,
  CorrelationResult,
  ChangePointResult,
  FactorAnalysisResult
} from '@/lib/statistics'

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

type AnalysisType = 'basic' | 'correlation' | 'changepoint' | 'factor' | 'histogram' | 'timeseries'

interface AnalysisPanelProps {
  tableName: string
  columns: Array<{ column_name: string; column_type: string }>
}

export function AnalysisPanel({ tableName, columns }: AnalysisPanelProps) {
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType>('basic')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { setError } = useDataStore()

  const numericColumns = columns.filter(col => 
    col.column_type.includes('INT') || 
    col.column_type.includes('FLOAT') || 
    col.column_type.includes('DOUBLE') ||
    col.column_type.includes('DECIMAL')
  )

  const dateColumns = columns.filter(col => 
    col.column_type.includes('DATE') || 
    col.column_type.includes('TIMESTAMP')
  )

  const runAnalysis = async () => {
    if (!tableName || selectedColumns.length === 0) return
    
    setIsLoading(true)
    setAnalysisResults(null)
    
    try {
      let results: any = null
      
      switch (activeAnalysis) {
        case 'basic':
          if (selectedColumns.length === 1) {
            results = await getBasicStatistics(tableName, selectedColumns[0])
          }
          break
          
        case 'correlation':
          if (selectedColumns.length >= 2) {
            results = await getCorrelationMatrix(tableName, selectedColumns)
          }
          break
          
        case 'changepoint':
          if (selectedColumns.length >= 1) {
            results = await detectChangePoints(tableName, selectedColumns[0])
          }
          break
          
        case 'factor':
          if (selectedColumns.length >= 2) {
            results = await performFactorAnalysis(tableName, selectedColumns)
          }
          break
          
        case 'histogram':
          if (selectedColumns.length === 1) {
            results = await getHistogramData(tableName, selectedColumns[0])
          }
          break
          
        case 'timeseries':
          if (selectedColumns.length === 1 && dateColumns.length > 0) {
            results = await getTimeSeriesData(tableName, selectedColumns[0], dateColumns[0].column_name)
          }
          break
      }
      
      setAnalysisResults(results)
    } catch (error) {
      setError(error instanceof Error ? error.message : '分析に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleColumnToggle = (columnName: string) => {
    setSelectedColumns(prev => 
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    )
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
        <button
          onClick={runAnalysis}
          disabled={!canRunAnalysis || isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '分析中...' : '分析実行'}
        </button>
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
              {currentAnalysisType.minColumns === currentAnalysisType.maxColumns
                ? `${currentAnalysisType.minColumns}個の列を選択してください`
                : `${currentAnalysisType.minColumns}-${currentAnalysisType.maxColumns}個の列を選択してください`
              }
            </span>
          )}
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {numericColumns.map((col) => (
            <label key={col.column_name} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedColumns.includes(col.column_name)}
                onChange={() => handleColumnToggle(col.column_name)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">{col.column_name}</span>
            </label>
          ))}
        </div>
        
        {selectedColumns.length > 0 && (
          <div className="mt-3 p-2 bg-gray-50 rounded">
            <span className="text-sm text-gray-600">
              選択中: {selectedColumns.join(', ')}
            </span>
          </div>
        )}
      </div>

      {analysisResults && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-medium text-gray-900 mb-4">分析結果</h3>
          <AnalysisResults type={activeAnalysis} results={analysisResults} />
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
  if (!results) return null

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
  const data = [
    { label: '件数', value: stats.count.toLocaleString() },
    { label: '平均', value: stats.mean.toFixed(2) },
    { label: '標準偏差', value: stats.std.toFixed(2) },
    { label: '最小値', value: stats.min.toFixed(2) },
    { label: '最大値', value: stats.max.toFixed(2) },
    { label: '第1四分位数', value: stats.quartiles.q1.toFixed(2) },
    { label: '中央値', value: stats.quartiles.q2.toFixed(2) },
    { label: '第3四分位数', value: stats.quartiles.q3.toFixed(2) },
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
              {corr.correlation.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangePointResults({ changePoints }: { changePoints: ChangePointResult[] }) {
  const chartData = {
    labels: changePoints.map(cp => `Point ${cp.index}`),
    datasets: [{
      label: '変化点',
      data: changePoints.map(cp => cp.value),
      borderColor: '#ef4444',
      backgroundColor: '#fee2e2',
      pointBackgroundColor: changePoints.map(cp => 
        cp.confidence > 0.8 ? '#dc2626' : 
        cp.confidence > 0.6 ? '#f59e0b' : '#6b7280'
      ),
      pointRadius: changePoints.map(cp => 5 + cp.confidence * 5),
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
    },
  }

  return (
    <div>
      <Line data={chartData} options={options} />
      <div className="mt-4 space-y-2">
        {changePoints.map((cp, index) => (
          <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span className="font-medium">Index {cp.index}</span>
            <div className="text-right">
              <div className="font-bold">{cp.value.toFixed(2)}</div>
              <div className="text-sm text-gray-600">
                信頼度: {(cp.confidence * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FactorAnalysisResults({ factorAnalysis }: { factorAnalysis: FactorAnalysisResult }) {
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
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '因子分析結果',
      },
    },
  }

  return (
    <div>
      <Doughnut data={chartData} options={options} />
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
                  <span className="font-mono">{loading.loading.toFixed(3)}</span>
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
                <td className="p-2 text-right">{row.count}</td>
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
        データポイント数: {data.length}
      </div>
    </div>
  )
}