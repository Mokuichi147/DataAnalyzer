// メモリ使用量監視ユーティリティ

export interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
  usagePercentage: number
  isNearLimit: boolean
  isCritical: boolean
}

// メモリ情報を取得
export function getMemoryInfo(): MemoryInfo {
  const performance = window.performance as any
  
  if (performance && performance.memory) {
    const memory = performance.memory
    const usagePercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usagePercentage,
      isNearLimit: usagePercentage > 70,
      isCritical: usagePercentage > 85
    }
  }
  
  // メモリAPI未対応の場合はダミー値
  return {
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    usagePercentage: 0,
    isNearLimit: false,
    isCritical: false
  }
}

// メモリ使用量をフォーマット
export function formatMemorySize(bytes: number): string {
  const MB = 1024 * 1024
  const GB = MB * 1024
  
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`
  } else {
    return `${(bytes / MB).toFixed(2)} MB`
  }
}

// メモリ警告チェック
export function checkMemoryWarning(): { shouldWarn: boolean; message: string } {
  const memInfo = getMemoryInfo()
  
  if (memInfo.isCritical) {
    return {
      shouldWarn: true,
      message: `🚨 メモリ使用量が危険レベルです (${memInfo.usagePercentage.toFixed(1)}%)\n大容量ファイルの処理は制限される可能性があります。`
    }
  }
  
  if (memInfo.isNearLimit) {
    return {
      shouldWarn: true,
      message: `⚠️ メモリ使用量が高くなっています (${memInfo.usagePercentage.toFixed(1)}%)\nファイルサイズを小さくすることを推奨します。`
    }
  }
  
  return {
    shouldWarn: false,
    message: ''
  }
}

// ガベージコレクションの強制実行を試行
export function forceGarbageCollection(): void {
  // @ts-ignore
  if (window.gc) {
    // @ts-ignore
    window.gc()
    console.log('🗑️ ガベージコレクション実行')
  }
}

// メモリ使用量をコンソールに出力
export function logMemoryUsage(context: string = ''): void {
  const memInfo = getMemoryInfo()
  
  if (memInfo.jsHeapSizeLimit > 0) {
    console.log(`📊 メモリ使用状況${context ? ` (${context})` : ''}:`)
    console.log(`  使用中: ${formatMemorySize(memInfo.usedJSHeapSize)}`)
    console.log(`  総容量: ${formatMemorySize(memInfo.totalJSHeapSize)}`)
    console.log(`  上限: ${formatMemorySize(memInfo.jsHeapSizeLimit)}`)
    console.log(`  使用率: ${memInfo.usagePercentage.toFixed(1)}%`)
    
    if (memInfo.isCritical) {
      console.warn('🚨 メモリ使用量が危険レベルです！')
    } else if (memInfo.isNearLimit) {
      console.warn('⚠️ メモリ使用量が高くなっています')
    }
  }
}

// ブラウザのメモリ制限を推定
export function estimateMemoryLimit(): number {
  const memInfo = getMemoryInfo()
  
  if (memInfo.jsHeapSizeLimit > 0) {
    return memInfo.jsHeapSizeLimit
  }
  
  // フォールバック: 一般的な制限値
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (userAgent.includes('chrome')) {
    return 4 * 1024 * 1024 * 1024 // Chrome: 約4GB
  } else if (userAgent.includes('firefox')) {
    return 2 * 1024 * 1024 * 1024 // Firefox: 約2GB
  } else if (userAgent.includes('safari')) {
    return 1 * 1024 * 1024 * 1024 // Safari: 約1GB
  }
  
  return 2 * 1024 * 1024 * 1024 // デフォルト: 2GB
}