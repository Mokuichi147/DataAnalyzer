import React, { useState, useRef, useEffect } from 'react'
import { Upload, FileText, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { isValidFileType, formatBytes } from '@/lib/utils'
import { createTableFromFile, getTableCount, getTableInfo, createTablesFromJsonColumns, type FileProcessingResult } from '@/lib/duckdb'
import { useDataStore } from '@/store/dataStore'
import { useRealtimeStore } from '@/store/realtimeStore'
import { FileUploadAlternatives } from './FileUploadAlternatives'
import { getMemoryInfo, formatMemorySize, checkMemoryWarning } from '@/lib/memoryMonitor'
import { getEncodingDescription } from '@/lib/fileEncoding'
import { memoryDataStore } from '@/lib/memoryDataStore'

/**
 * ファイル名から拡張子を除去する関数
 * 最後のドットより後を拡張子として除去
 */
function getFileBaseName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex === -1 ? fileName : fileName.substring(0, lastDotIndex)
}

/**
 * テーブル名をサニタイズする関数（日本語対応）
 * DuckDBで引用符付き識別子として使用可能な安全なテーブル名に変換
 * 多くの文字が保持され、より意味のあるテーブル名が生成される
 */
function sanitizeTableName(tableName: string): string {
  if (!tableName || tableName.trim() === '') {
    return `table_${Math.random().toString(36).substr(2, 9)}`
  }
  
  // 先頭と末尾の空白を削除
  let sanitized = tableName.trim()
  
  // DuckDBの識別子規則に従って処理
  // 1. 数字で始まる場合は先頭に文字を追加
  if (/^\d/.test(sanitized)) {
    sanitized = `t_${sanitized}`
  }
  
  // 2. 最小限の危険な文字のみを処理（DuckDBは引用符で囲むため多くの文字が使用可能）
  sanitized = sanitized
    .replace(/"/g, '_')         // 二重引用符のみ（SQLで引用符を使うため）
    .replace(/[\r\n\t]/g, '_')  // 改行・タブ文字
    .replace(/\s+/g, '_')       // 連続する空白をアンダースコアに
    .replace(/^_+|_+$/g, '')    // 先頭・末尾のアンダースコアを削除
    .replace(/_+/g, '_')        // 連続するアンダースコアを1つに
  
  // 3. 空になった場合のフォールバック
  if (sanitized === '') {
    return `table_${Math.random().toString(36).substr(2, 9)}`
  }
  
  // 4. 最大長制限（DuckDBの制限を考慮）
  if (sanitized.length > 63) {
    const hash = Math.random().toString(36).substr(2, 6)
    sanitized = sanitized.substring(0, 57) + '_' + hash
  }
  
  return sanitized
}

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  tableName: string
  error?: string
  isDuckDBFile?: boolean
  extractedTables?: string[]
  jsonTables?: string[] // JSONカラムから作成されたテーブル
  encoding?: string // 検出されたエンコーディング
  encodingConfidence?: number // エンコーディング検出の信頼度
}

interface FileUploadProps {
  onNavigateToSettings?: () => void
}

export function FileUpload({ }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [memoryInfo, setMemoryInfo] = useState(getMemoryInfo())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addTable, setLoading, setError } = useDataStore()
  const { addSubscription } = useRealtimeStore()
  
  // デバイス・ブラウザ検出
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  
  // iOS Safari対応のUUID生成関数
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    // iOS Safari用のフォールバック
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
  
  // メモリ情報を定期的に更新
  useEffect(() => {
    const interval = setInterval(() => {
      setMemoryInfo(getMemoryInfo())
    }, 2000) // 2秒ごと
    
    return () => clearInterval(interval)
  }, [])

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) {
      return
    }

    const validFiles = Array.from(selectedFiles).filter(file => {
      const isValid = isValidFileType(file)
      if (!isValid) {
        setError(`サポートされていないファイル形式です: ${file.name}`)
        return false
      }
      return true
    })

    const uploadedFiles: UploadedFile[] = validFiles.map(file => {
      const isDuckDBFile = false
      // DuckDBファイル対応は現状非対応
      
      const uploadedFile = {
        id: generateUUID(),
        file,
        status: 'pending' as const,
        tableName: sanitizeTableName(getFileBaseName(file.name)),
        isDuckDBFile,
      }
      
      return uploadedFile
    })

    setFiles(prev => [...prev, ...uploadedFiles])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    
    // iOS Safari対応: input要素をリセットして再選択を可能にする
    if (isIOS && e.target) {
      setTimeout(() => {
        e.target.value = ''
      }, 100)
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const updateTableName = (id: string, tableName: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, tableName } : f
    ))
  }

  const processFile = async (uploadedFile: UploadedFile) => {
    
    try {
      // ファイルサイズチェック
      if (uploadedFile.file.size === 0) {
        throw new Error('ファイルサイズが0バイトです。正しいファイルを選択してください。')
      }
      
      // ファイルの有効性チェック
      if (!uploadedFile.file.name || uploadedFile.file.name.trim() === '') {
        throw new Error('ファイル名が無効です。')
      }
      
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id ? { ...f, status: 'uploading' } : f
      ))


        // 通常のファイル処理
        
        let result: FileProcessingResult
        try {
          // iOS Safari用の特別処理
          if (isIOS && isSafari) {
            // ファイル読み込みテスト
            try {
              const testChunk = uploadedFile.file.slice(0, 1024)
              await testChunk.text()
            } catch (readError) {
              throw new Error('iOS Safari: ファイル読み込みができません。ファイルが破損しているか、サイズが大きすぎる可能性があります。')
            }
            
            // メモリチェック
            if (uploadedFile.file.size > 10 * 1024 * 1024) { // 10MB
              throw new Error('iOS Safari: ファイルサイズが10MBを超えています。小さなファイルをお試しください。')
            }
          }
          
          result = await createTableFromFile(uploadedFile.file, uploadedFile.tableName)
          
          // エンコーディング情報を保存
          setFiles(prev => prev.map(f => 
            f.id === uploadedFile.id ? { 
              ...f, 
              status: 'success',
              encoding: result.encoding,
              encodingConfidence: result.encodingConfidence
            } : f
          ))
        } catch (createError) {
          throw new Error(`ファイル処理エラー: ${createError instanceof Error ? createError.message : '不明なエラー'}`)
        }

        // ファイル拡張子に基づいてテーブル名を決定
        const fileExtension = uploadedFile.file.name.split('.').pop()?.toLowerCase()
        let actualTableNames: string[] = []
        
        if (fileExtension === 'sqlite' || fileExtension === 'sqlite3' || fileExtension === 'db') {
          // データベースファイルの場合、実際に作成されたテーブル名を取得
          // メモリストアから取得
          actualTableNames = memoryDataStore.listTables()
        } else {
          // 通常のファイルの場合は結果のテーブル名を使用
          actualTableNames = result.tableNames
        }

        // 各テーブルをストアに追加
        for (const tableName of actualTableNames) {
          try {
            
            let tableInfo
            try {
              tableInfo = await getTableInfo(tableName)
            } catch (tableInfoError) {
              
              // iOS Safari フォールバック: メモリストアから直接取得を試行
              if (isIOS && isSafari) {
                try {
                  const schema = memoryDataStore.getTableSchema(tableName)
                  if (schema && schema.columns) {
                    tableInfo = schema.columns.map(col => ({
                      column_name: col.name,
                      column_type: col.type,
                      null: col.nullable ? 'YES' : 'NO'
                    }))
                  } else {
                    throw new Error('Memory store schema not found')
                  }
                } catch (memoryError) {
                  throw new Error(`テーブル情報の取得に失敗 (フォールバックも失敗): ${tableInfoError instanceof Error ? tableInfoError.message : String(tableInfoError)}`)
                }
              } else {
                throw new Error(`テーブル情報の取得に失敗: ${tableInfoError instanceof Error ? tableInfoError.message : String(tableInfoError)}`)
              }
            }
            
            if (!tableInfo || tableInfo.length === 0) {
              throw new Error(`テーブル ${tableName} の情報が見つかりません`)
            }
            
            const columns = tableInfo.map(col => ({
              name: col.column_name,
              type: col.column_type,
              nullable: col.null === 'YES'
            }))

            let rowCount
            try {
              rowCount = await getTableCount(tableName)
            } catch (rowCountError) {
              
              // iOS Safari フォールバック: メモリストアから直接取得を試行
              if (isIOS && isSafari) {
                try {
                  const schema = memoryDataStore.getTableSchema(tableName)
                  if (schema && schema.data) {
                    rowCount = schema.data.length
                  } else {
                    rowCount = 0
                  }
                } catch (memoryError) {
                  rowCount = 0
                }
              } else {
                throw new Error(`行数の取得に失敗: ${rowCountError instanceof Error ? rowCountError.message : String(rowCountError)}`)
              }
            }
            
            try {
              addTable({
                name: tableName,
                connectionId: 'file',
                columns,
                rowCount,
                isLoaded: true
              })
              
              addSubscription({
                tableName,
                connectionId: 'file',
                rowCount,
              })
              
              // JSONカラムのチェックと新しいテーブル作成
              try {
                const jsonTables = await createTablesFromJsonColumns(tableName)
                
                if (jsonTables.length > 0) {
                  
                  // ファイル状態にJSONテーブル情報を保存
                  setFiles(prev => prev.map(f => 
                    f.id === uploadedFile.id ? { ...f, jsonTables } : f
                  ))
                  
                  // 作成されたJSONテーブルもストアに追加
                  for (const jsonTableName of jsonTables) {
                    try {
                      const jsonTableInfo = await getTableInfo(jsonTableName)
                      const jsonColumns = jsonTableInfo.map(col => ({
                        name: col.column_name,
                        type: col.column_type,
                        nullable: col.null === 'YES'
                      }))
                      
                      const jsonRowCount = await getTableCount(jsonTableName)
                      
                      addTable({
                        name: jsonTableName,
                        connectionId: 'file',
                        columns: jsonColumns,
                        rowCount: jsonRowCount,
                        isLoaded: true
                      })
                      
                      addSubscription({
                        tableName: jsonTableName,
                        connectionId: 'file',
                        rowCount: jsonRowCount,
                      })
                    } catch (jsonTableError) {
                    }
                  }
                }
              } catch (jsonError) {
                // JSONカラムのチェックでエラーが発生しても、メインの処理は成功として扱う
              }
              
              
            } catch (storeError) {
              throw new Error(`ストアへのテーブル追加に失敗: ${storeError instanceof Error ? storeError.message : String(storeError)}`)
            }
          } catch (tableError) {
            
            // エラーの詳細情報をキャプチャ
            let errorDetails = 'Unknown error'
            if (tableError instanceof Error) {
              errorDetails = `${tableError.name}: ${tableError.message}`
            } else if (typeof tableError === 'object' && tableError !== null) {
              errorDetails = JSON.stringify(tableError, Object.getOwnPropertyNames(tableError))
            } else {
              errorDetails = String(tableError)
            }
            
            throw new Error(`テーブル ${tableName} の処理でエラーが発生しました: ${errorDetails}`)
          }
        }

    } catch (error) {
      
      // エラーの完全な詳細をキャプチャ
      let errorMessage = 'アップロードに失敗しました'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error === null) {
        errorMessage = 'iOS Safari: ファイル読み込みエラーが発生しました。ファイルサイズが大きすぎるか、ファイルが破損している可能性があります。'
      } else if (typeof error === 'object') {
        try {
          const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
          errorMessage = `オブジェクトエラー: ${errorDetails}`
        } catch (jsonError) {
          errorMessage = 'オブジェクトエラー（詳細取得不可）'
        }
      } else {
        errorMessage = `未知のエラータイプ: ${String(error)}`
      }
      
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id ? { 
          ...f, 
          status: 'error', 
          error: errorMessage
        } : f
      ))
    }
  }

  const processAllFiles = async () => {
    setLoading(true)
    const pendingFiles = files.filter(f => f.status === 'pending')
    
    for (const file of pendingFiles) {
      await processFile(file)
    }
    
    setLoading(false)
  }

  const memoryWarning = checkMemoryWarning()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">ファイルアップロード</h2>
        {files.some(f => f.status === 'pending') && (
          <button
            onClick={processAllFiles}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            すべて処理
          </button>
        )}
      </div>

      {/* メモリ使用量警告 */}
      {memoryInfo.jsHeapSizeLimit > 0 && (
        <div className={`p-4 rounded-lg border transition-colors ${
          memoryInfo.isCritical ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-600' :
          memoryInfo.isNearLimit ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-600' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600'
        }`}>
          <div className="flex items-center space-x-2">
            {memoryInfo.isCritical && <AlertTriangle className="h-5 w-5 text-red-600" />}
            {memoryInfo.isNearLimit && !memoryInfo.isCritical && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  メモリ使用量: {memoryInfo.usagePercentage.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatMemorySize(memoryInfo.usedJSHeapSize)} / {formatMemorySize(memoryInfo.jsHeapSizeLimit)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    memoryInfo.isCritical ? 'bg-red-600' :
                    memoryInfo.isNearLimit ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(memoryInfo.usagePercentage, 100)}%` }}
                ></div>
              </div>
              {memoryWarning.shouldWarn && (
                <p className={`text-sm mt-2 ${
                  memoryInfo.isCritical ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'
                }`}>
                  {memoryWarning.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        } ${isMobile ? 'touch-manipulation' : ''}`}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          {isMobile 
            ? 'ファイルを選択してアップロード' 
            : 'ファイルをドラッグ&ドロップ'
          }
        </p>
        {!isMobile && (
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            または
          </p>
        )}
        <button
          onClick={(e) => {
            e.preventDefault()
            if (fileInputRef.current) {
              fileInputRef.current.click()
            }
          }}
          onTouchStart={(e) => {
            // iOS Safari用の追加対策
            if (isIOS) {
              e.preventDefault()
            }
          }}
          onTouchEnd={(e) => {
            // モバイル端末でのタッチサポート
            if (isMobile) {
              e.preventDefault()
              setTimeout(() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click()
                }
              }, 50)
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 py-2 rounded-md touch-manipulation transition-colors"
        >
          ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={isIOS 
            ? ".csv,.tsv,.json,.sqlite,.sqlite3,.db" 
            : ".csv,.tsv,.json,.sqlite,.sqlite3,.db,text/csv,application/json,application/x-sqlite3,application/vnd.sqlite3"
          }
          onChange={handleFileInputChange}
          className="hidden"
          key={isIOS ? 'ios-input' : 'desktop-input'}
          style={{ 
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            opacity: 0,
            pointerEvents: 'none'
          }}
          tabIndex={-1}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          対応形式: CSV, TSV, JSON, SQLite3
        </p>
        
      </div>


      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-900 dark:text-white">アップロードファイル</h3>
          <div className="space-y-3">
            {files.map((uploadedFile) => (
              <div key={uploadedFile.id} className="bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg p-4 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 dark:text-white">{uploadedFile.file.name}</p>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatBytes(uploadedFile.file.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {uploadedFile.status === 'success' && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    {uploadedFile.status === 'error' && (
                      <X className="h-5 w-5 text-red-600" />
                    )}
                    <button
                      onClick={() => removeFile(uploadedFile.id)}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {uploadedFile.status === 'pending' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      テーブル名
                    </label>
                    <input
                      type="text"
                      value={uploadedFile.tableName}
                      onChange={(e) => updateTableName(uploadedFile.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white transition-colors"
                    />
                  </div>
                )}
                
                {uploadedFile.status === 'uploading' && (
                  <div className="mt-3">
                    <div className="bg-blue-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      処理中...
                      {/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && (
                        <span className="block text-xs text-gray-500 mt-1">
                          ⏳ 大容量ファイルの処理には時間がかかる場合があります
                        </span>
                      )}
                    </p>
                  </div>
                )}
                
                {uploadedFile.status === 'success' && (
                  <div className="mt-3">
                    <div className="text-sm text-green-600 dark:text-green-400">
                        <p className="mb-2">
                          テーブル「{uploadedFile.tableName}」として正常にアップロードされました
                        </p>
                        
                        {/* エンコーディング情報の表示 */}
                        {uploadedFile.encoding && (
                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs transition-colors">
                            <span className="text-gray-700 dark:text-gray-300">
                              📄 エンコーディング: <span className="font-mono text-blue-600 dark:text-blue-400">{uploadedFile.encoding}</span>
                              {uploadedFile.encoding !== 'utf-8' && (
                                <span className="ml-1 text-gray-600 dark:text-gray-400">
                                  ({getEncodingDescription(uploadedFile.encoding)})
                                </span>
                              )}
                              {uploadedFile.encodingConfidence && (
                                <span className="ml-2 text-gray-500 dark:text-gray-400">
                                  信頼度: {Math.round(uploadedFile.encodingConfidence * 100)}%
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {uploadedFile.jsonTables && uploadedFile.jsonTables.length > 0 && (
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded transition-colors">
                            <p className="text-blue-700 dark:text-blue-300 font-medium text-sm mb-2">
                              🔍 JSONデータを検出
                            </p>
                            <p className="text-blue-600 dark:text-blue-400 text-sm mb-2">
                              JSONカラムから{uploadedFile.jsonTables.length}個の追加テーブルを作成しました:
                            </p>
                            <ul className="list-disc list-inside space-y-1">
                              {uploadedFile.jsonTables.map((jsonTableName, index) => (
                                <li key={index} className="font-mono text-xs text-blue-800 dark:text-blue-200">
                                  {jsonTableName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                  </div>
                )}
                
                {uploadedFile.status === 'error' && (
                  <div className="mt-3">
                    <div>
                      <FileUploadAlternatives
                        errorMessage={uploadedFile.error || ''}
                        fileName={uploadedFile.file.name}
                        fileExtension={uploadedFile.file.name.split('.').pop()?.toLowerCase() || 'unknown'}
                      />
                      <button
                        onClick={() => processFile(uploadedFile)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-2"
                      >
                        再試行
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}