import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  // iOS Safari対応: bytesが null, undefined, NaN の場合を処理
  if (bytes == null || isNaN(bytes) || bytes < 0) {
    return 'サイズ不明'
  }
  
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  // Math.log が有効な結果を返すことを確認
  if (!isFinite(i) || i < 0) {
    return bytes + ' Bytes'
  }
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function isValidFileType(file: File): boolean {
  const validTypes = [
    'text/csv',
    'text/tab-separated-values',
    'application/json',
    'text/plain',
    'application/x-sqlite3',
    'application/vnd.sqlite3',
    'application/octet-stream' // SQLite/DuckDBファイルの場合
  ]
  
  const validExtensions = [
    'csv', 'tsv', 'txt', 'json', 'sqlite', 'sqlite3', 'db', 'duckdb'
  ]
  
  const fileExtension = file.name.split('.').pop()?.toLowerCase()
  
  return validTypes.includes(file.type) || 
         (!!fileExtension && validExtensions.includes(fileExtension))
}