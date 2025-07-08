/**
 * Chart.js パフォーマンス最適化設定
 */

// テーマに応じた色を取得するヘルパー関数
function getThemeAwareColors() {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  
  return {
    text: isDark ? '#f3f4f6' : '#1f2937',
    gridLines: isDark ? '#374151' : '#e5e7eb',
    background: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#4b5563' : '#d1d5db',
  }
}

export interface OptimizedChartOptions {
  responsive: boolean
  maintainAspectRatio: boolean
  animation: boolean | false
  interaction: any
  elements: any
  plugins: any
  scales?: any
}

/**
 * 大量データ用の最適化されたChart.jsオプション
 */
export function getOptimizedChartOptions(
  dataSize: number,
  chartType: 'line' | 'bar' | 'scatter' | 'doughnut' = 'line'
): OptimizedChartOptions {
  const isLargeDataset = dataSize > 1000
  const isVeryLargeDataset = dataSize > 5000
  const colors = getThemeAwareColors()

  const baseOptions: OptimizedChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: !isLargeDataset, // 大量データでは無効化
    interaction: {
      intersect: false,
      mode: isLargeDataset ? 'nearest' : 'index' as const,
    },
    elements: {
      point: {
        radius: isVeryLargeDataset ? 0 : isLargeDataset ? 1 : 3,
        hoverRadius: isVeryLargeDataset ? 2 : isLargeDataset ? 3 : 5,
        hitRadius: isLargeDataset ? 10 : 15,
      } as any,
      line: {
        tension: isLargeDataset ? 0 : 0.1,
        borderWidth: isVeryLargeDataset ? 1 : 2,
      } as any,
    } as any,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          color: colors.text,
        },
      },
      tooltip: {
        enabled: !isVeryLargeDataset, // 超大量データでは無効化
        mode: 'nearest' as const,
        intersect: false,
        animation: false,
        ...(isLargeDataset && {
          filter: function(tooltipItem: any) {
            // 大量データでは一部のツールチップのみ表示
            return tooltipItem.dataIndex % Math.ceil(dataSize / 100) === 0
          }
        })
      },
      decimation: isLargeDataset ? {
        enabled: true,
        algorithm: 'min-max' as const,
        samples: Math.min(2000, Math.max(500, dataSize / 10)),
        threshold: 1000,
      } : undefined,
    },
  }

  // チャートタイプ別の最適化
  switch (chartType) {
    case 'line':
      return {
        ...baseOptions,
        scales: {
          x: {
            type: 'linear' as const,
            ticks: {
              maxTicksLimit: isLargeDataset ? 10 : 20,
              autoSkip: true,
              autoSkipPadding: 10,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
          y: {
            ticks: {
              maxTicksLimit: 10,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
        },
      }

    case 'scatter':
      return {
        ...baseOptions,
        scales: {
          x: {
            type: 'linear' as const,
            ticks: {
              maxTicksLimit: isLargeDataset ? 8 : 15,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
          y: {
            ticks: {
              maxTicksLimit: 8,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
        },
      }

    case 'bar':
      return {
        ...baseOptions,
        scales: {
          x: {
            ticks: {
              maxTicksLimit: isLargeDataset ? 15 : 25,
              autoSkip: true,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 8,
              color: colors.text,
            },
            grid: {
              color: colors.gridLines,
            },
          },
        },
      }

    case 'doughnut':
      return {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: {
            position: 'right' as const,
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              color: colors.text,
            },
          },
        },
      }

    default:
      return baseOptions
  }
}

/**
 * 変化点検出用の最適化されたChart.jsオプション
 */
export function getChangePointChartOptions(dataSize: number): OptimizedChartOptions {
  const options = getOptimizedChartOptions(dataSize, 'line')
  const colors = getThemeAwareColors()
  
  return {
    ...options,
    plugins: {
      ...options.plugins,
      title: {
        display: true,
        text: '変化点検出結果',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: colors.text,
      },
      annotation: {
        annotations: {
          // 変化点マーカー用の設定は動的に追加
        },
      },
    },
    elements: {
      ...options.elements,
      point: {
        ...options.elements.point,
        // 変化点は常に表示
        radius: 3,
        hoverRadius: 6,
      },
    },
  }
}

/**
 * 時系列分析用の最適化されたChart.jsオプション
 */
export function getTimeSeriesChartOptions(dataSize: number): OptimizedChartOptions {
  const options = getOptimizedChartOptions(dataSize, 'line')
  const colors = getThemeAwareColors()
  
  return {
    ...options,
    plugins: {
      ...options.plugins,
      title: {
        display: true,
        text: '時系列分析結果',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: colors.text,
      },
      legend: {
        ...options.plugins.legend,
        reverse: false,
        labels: {
          ...options.plugins.legend?.labels,
          sort: (a: any, b: any) => {
            return (a.datasetIndex || 0) - (b.datasetIndex || 0)
          }
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x' as const,
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x' as const,
        },
      },
    },
    scales: {
      ...options.scales,
      x: {
        ...options.scales?.x,
        type: 'linear' as const,
        title: {
          display: true,
          text: '時間',
          color: colors.text,
        },
        ticks: {
          maxTicksLimit: dataSize > 1000 ? 10 : 20,
          autoSkip: true,
        },
      },
      y: {
        ...options.scales?.y,
        title: {
          display: true,
          text: '値',
          color: colors.text,
        },
      },
    },
  }
}

/**
 * 相関分析用の最適化されたChart.jsオプション
 */
export function getCorrelationChartOptions(dataSize: number): OptimizedChartOptions {
  const colors = getThemeAwareColors()
  return {
    ...getOptimizedChartOptions(dataSize, 'bar'),
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'ピアソン相関係数',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: colors.text,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: function(context: any) {
            const correlation = context.parsed.y
            const strength = Math.abs(correlation) > 0.7 ? '強い' : 
                            Math.abs(correlation) > 0.3 ? '中程度' : '弱い'
            const direction = correlation > 0 ? '正の' : '負の'
            return `${direction}${strength}相関: ${correlation.toFixed(3)}`
          }
        }
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        min: -1,
        max: 1,
        title: {
          display: true,
          text: '相関係数',
          color: colors.text,
        },
        ticks: {
          stepSize: 0.2,
        },
      },
    },
  }
}

/**
 * ヒストグラム用の最適化されたChart.jsオプション
 */
export function getHistogramChartOptions(dataSize: number): OptimizedChartOptions {
  const colors = getThemeAwareColors()
  return {
    ...getOptimizedChartOptions(dataSize, 'bar'),
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'データ分布 (ヒストグラム)',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: colors.text,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '値の範囲',
          color: colors.text,
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: '頻度',
          color: colors.text,
        },
      },
    },
  }
}

/**
 * パフォーマンス情報を表示するコンポーネント用のデータ
 */
export function getPerformanceInfo(
  originalSize: number,
  processedSize: number,
  processingTime: number,
  samplingInfo?: any
) {
  const isReduced = originalSize > processedSize
  
  return {
    originalSize,
    processedSize,
    processingTime: Math.round(processingTime * 100) / 100,
    isReduced,
    reductionRatio: isReduced ? ((originalSize - processedSize) / originalSize * 100).toFixed(1) : '0',
    samplingInfo,
    performanceGrade: processingTime < 100 ? '高速' : processingTime < 500 ? '標準' : '低速',
    recommendations: getPerformanceRecommendations(originalSize, processingTime)
  }
}

function getPerformanceRecommendations(dataSize: number, processingTime: number): string[] {
  const recommendations: string[] = []
  
  if (dataSize > 10000) {
    recommendations.push('大量データのため、サンプリングが適用されました')
  }
  
  if (processingTime > 500) {
    recommendations.push('処理時間が長いため、データの絞り込みを検討してください')
  }
  
  if (dataSize > 50000) {
    recommendations.push('非常に大量のデータです。より具体的な条件でフィルタリングすることをお勧めします')
  }
  
  return recommendations
}