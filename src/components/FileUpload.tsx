import React, { useState, useRef, useEffect } from 'react'
import { Upload, FileText, X, CheckCircle, Database, AlertTriangle } from 'lucide-react'
import { isValidFileType, formatBytes } from '@/lib/utils'
import { createTableFromFile, getTableCount, loadDuckDBFile, getTableInfo, createTablesFromJsonColumns } from '@/lib/duckdb'
import { useDataStore } from '@/store/dataStore'
import { useRealtimeStore } from '@/store/realtimeStore'
import { FileUploadAlternatives } from './FileUploadAlternatives'
import { getMemoryInfo, formatMemorySize, checkMemoryWarning } from '@/lib/memoryMonitor'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  tableName: string
  error?: string
  isDuckDBFile?: boolean
  extractedTables?: string[]
  jsonTables?: string[] // JSONカラムから作成されたテーブル
}

interface FileUploadProps {
  onNavigateToSettings?: () => void
}

export function FileUpload({ onNavigateToSettings }: FileUploadProps) {
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
    console.log('📂 handleFileSelect called', {
      selectedFiles,
      selectedFilesLength: selectedFiles?.length,
      isIOS,
      isSafari
    })
    
    if (!selectedFiles) {
      console.log('❌ No files selected')
      return
    }

    console.log('📋 Selected files:', Array.from(selectedFiles).map(f => ({ 
      name: f.name, 
      size: f.size, 
      type: f.type,
      lastModified: f.lastModified 
    })))

    const validFiles = Array.from(selectedFiles).filter(file => {
      const isValid = isValidFileType(file)
      console.log(`🔍 File validation: ${file.name} - ${isValid ? 'VALID' : 'INVALID'}`)
      if (!isValid) {
        setError(`サポートされていないファイル形式です: ${file.name}`)
        return false
      }
      return true
    })

    console.log('✅ Valid files:', validFiles.length)

    const uploadedFiles: UploadedFile[] = validFiles.map(file => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      const isDuckDBFile = false
      // DuckDBファイル対応は現状非対応
      
      const uploadedFile = {
        id: generateUUID(),
        file,
        status: 'pending' as const,
        tableName: file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_'),
        isDuckDBFile,
      }
      
      console.log('📄 Created uploaded file object:', {
        id: uploadedFile.id,
        name: file.name,
        tableName: uploadedFile.tableName,
        isDuckDBFile: uploadedFile.isDuckDBFile
      })
      
      return uploadedFile
    })

    console.log('💾 Setting files state with:', uploadedFiles.length, 'files')
    setFiles(prev => {
      const newFiles = [...prev, ...uploadedFiles]
      console.log('📁 New files state will be:', newFiles.length, 'total files')
      return newFiles
    })
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
    console.log('📱 handleFileInputChange called', {
      isIOS,
      isSafari,
      filesLength: e.target.files?.length,
      files: e.target.files ? Array.from(e.target.files).map(f => ({ name: f.name, size: f.size, type: f.type })) : null
    })
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
    console.log('🚀 processFile started for:', {
      fileName: uploadedFile.file.name,
      fileSize: uploadedFile.file.size,
      fileType: uploadedFile.file.type,
      isDuckDBFile: uploadedFile.isDuckDBFile,
      isIOS,
      isSafari
    })
    
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

      console.log('📁 File validation passed, processing...')

        // 通常のファイル処理
        console.log('📊 Processing regular file...')
        
        try {
          // iOS Safari用の特別処理
          if (isIOS && isSafari) {
            console.log('🍎 iOS Safari detected, using safe file processing')
            
            // ファイル読み込みテスト
            try {
              const testChunk = uploadedFile.file.slice(0, 1024)
              const testText = await testChunk.text()
              console.log('📝 File read test successful, first 50 chars:', testText.substring(0, 50))
            } catch (readError) {
              console.error('❌ File read test failed:', readError)
              throw new Error('iOS Safari: ファイル読み込みができません。ファイルが破損しているか、サイズが大きすぎる可能性があります。')
            }
            
            // メモリチェック
            if (uploadedFile.file.size > 10 * 1024 * 1024) { // 10MB
              console.warn('⚠️ Large file detected on iOS Safari')
              throw new Error('iOS Safari: ファイルサイズが10MBを超えています。小さなファイルをお試しください。')
            }
          }
          
          await createTableFromFile(uploadedFile.file, uploadedFile.tableName)
          console.log('✅ createTableFromFile completed successfully')
        } catch (createError) {
          console.error('❌ createTableFromFile failed:', createError)
          throw new Error(`ファイル処理エラー: ${createError instanceof Error ? createError.message : '不明なエラー'}`)
        }

        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { ...f, status: 'success' } : f
        ))

        // ファイル拡張子に基づいてテーブル名を決定
        const fileExtension = uploadedFile.file.name.split('.').pop()?.toLowerCase()
        let actualTableNames: string[] = []
        
        if (fileExtension === 'sqlite' || fileExtension === 'sqlite3' || fileExtension === 'db') {
          // データベースファイルの場合、実際に作成されたテーブル名を取得
          // メモリストアから取得
          const { memoryDataStore } = await import('@/lib/memoryDataStore')
          actualTableNames = memoryDataStore.listTables()
          console.log('データベースファイルから取得されたテーブル名:', actualTableNames)
        } else {
          // 通常のファイルの場合は指定されたテーブル名を使用
          actualTableNames = [uploadedFile.tableName]
        }

        // 各テーブルをストアに追加
        console.log('📋 Adding tables to store:', actualTableNames)
        for (const tableName of actualTableNames) {
          try {
            console.log(`🔍 Getting table info for: ${tableName}`)
            
            let tableInfo
            try {
              tableInfo = await getTableInfo(tableName)
              console.log('✅ getTableInfo successful, columns:', tableInfo?.length)
            } catch (tableInfoError) {
              console.error('❌ getTableInfo failed:', tableInfoError)
              
              // iOS Safari フォールバック: メモリストアから直接取得を試行
              if (isIOS && isSafari) {
                console.log('🍎 iOS Safari: trying memory store fallback for table info')
                try {
                  const { memoryDataStore } = await import('@/lib/memoryDataStore')
                  const schema = memoryDataStore.getTableSchema(tableName)
                  if (schema && schema.columns) {
                    console.log('✅ Memory store fallback successful')
                    tableInfo = schema.columns.map(col => ({
                      column_name: col.name,
                      column_type: col.type,
                      null: col.nullable ? 'YES' : 'NO'
                    }))
                  } else {
                    throw new Error('Memory store schema not found')
                  }
                } catch (memoryError) {
                  console.error('❌ Memory store fallback failed:', memoryError)
                  throw new Error(`テーブル情報の取得に失敗 (フォールバックも失敗): ${tableInfoError instanceof Error ? tableInfoError.message : String(tableInfoError)}`)
                }
              } else {
                throw new Error(`テーブル情報の取得に失敗: ${tableInfoError instanceof Error ? tableInfoError.message : String(tableInfoError)}`)
              }
            }
            
            if (!tableInfo || tableInfo.length === 0) {
              console.warn(`⚠️ No table info found for: ${tableName}`)
              throw new Error(`テーブル ${tableName} の情報が見つかりません`)
            }
            
            const columns = tableInfo.map(col => ({
              name: col.column_name,
              type: col.column_type,
              nullable: col.null === 'YES'
            }))

            console.log(`📊 Getting row count for: ${tableName}`)
            let rowCount
            try {
              rowCount = await getTableCount(tableName)
              console.log('✅ getTableCount successful, count:', rowCount)
            } catch (rowCountError) {
              console.error('❌ getTableCount failed:', rowCountError)
              
              // iOS Safari フォールバック: メモリストアから直接取得を試行
              if (isIOS && isSafari) {
                console.log('🍎 iOS Safari: trying memory store fallback for row count')
                try {
                  const { memoryDataStore } = await import('@/lib/memoryDataStore')
                  const schema = memoryDataStore.getTableSchema(tableName)
                  if (schema && schema.data) {
                    rowCount = schema.data.length
                    console.log('✅ Memory store row count fallback successful:', rowCount)
                  } else {
                    console.warn('⚠️ Setting default row count: 0')
                    rowCount = 0
                  }
                } catch (memoryError) {
                  console.error('❌ Memory store row count fallback failed:', memoryError)
                  console.warn('⚠️ Setting default row count: 0')
                  rowCount = 0
                }
              } else {
                throw new Error(`行数の取得に失敗: ${rowCountError instanceof Error ? rowCountError.message : String(rowCountError)}`)
              }
            }
            
            console.log(`✅ Adding table to store:`, {
              name: tableName,
              columnsCount: columns.length,
              rowCount
            })
            
            console.log(`📋 Adding table to store: ${tableName}`)
            try {
              addTable({
                name: tableName,
                connectionId: 'file',
                columns,
                rowCount,
                isLoaded: true
              })
              console.log('✅ Table added to store successfully')
              
              addSubscription({
                tableName,
                connectionId: 'file',
                rowCount,
              })
              console.log('✅ Subscription added successfully')
              
              // JSONカラムのチェックと新しいテーブル作成
              try {
                console.log(`🔍 JSONカラムをチェック中: ${tableName}`)
                console.log(`🔍 テーブル情報:`, { name: tableName, columns: columns.length, rows: rowCount })
                console.log(`🔍 カラム詳細:`, columns.map(col => `${col.name}(${col.type})`).join(', '))
                
                // テーブルが実際に存在するかを確認
                try {
                  const testRowCount = await getTableCount(tableName)
                  console.log(`✅ テーブル ${tableName} の行数確認: ${testRowCount}`)
                } catch (countError) {
                  console.error(`❌ テーブル ${tableName} の行数取得エラー:`, countError)
                }
                
                const jsonTables = await createTablesFromJsonColumns(tableName)
                
                if (jsonTables.length > 0) {
                  console.log(`📊 JSONデータから${jsonTables.length}個のテーブルを作成しました`)
                  
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
                      console.log(`🔢 JSONテーブル ${jsonTableName} の行数: ${jsonRowCount}`)
                      
                      if (jsonRowCount === 0) {
                        console.warn(`⚠️ JSONテーブル ${jsonTableName} にデータがありません`)
                      }
                      
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
                      
                      console.log(`✅ JSONテーブル ${jsonTableName} をストアに追加 (${jsonColumns.length}カラム, ${jsonRowCount}行)`)
                    } catch (jsonTableError) {
                      console.error(`❌ JSONテーブル ${jsonTableName} の追加に失敗:`, jsonTableError)
                    }
                  }
                }
              } catch (jsonError) {
                console.error('⚠️ JSONカラムチェックでエラー（処理は継続）:', jsonError)
                // JSONカラムのチェックでエラーが発生しても、メインの処理は成功として扱う
              }
              
              // iOS Safari: 状態の強制更新
              if (isIOS && isSafari) {
                console.log('🍎 iOS Safari: forcing state update')
                setTimeout(() => {
                  console.log('🔄 iOS Safari: delayed state verification')
                }, 1000)
              }
              
            } catch (storeError) {
              console.error('❌ Failed to add table to store:', storeError)
              throw new Error(`ストアへのテーブル追加に失敗: ${storeError instanceof Error ? storeError.message : String(storeError)}`)
            }
          } catch (tableError) {
            console.error(`❌ Error adding table ${tableName}:`, tableError)
            
            // エラーの詳細情報をキャプチャ
            let errorDetails = 'Unknown error'
            if (tableError instanceof Error) {
              errorDetails = `${tableError.name}: ${tableError.message}`
              if (tableError.stack) {
                console.error('Stack trace:', tableError.stack)
              }
            } else if (typeof tableError === 'object' && tableError !== null) {
              errorDetails = JSON.stringify(tableError, Object.getOwnPropertyNames(tableError))
            } else {
              errorDetails = String(tableError)
            }
            
            console.error(`📋 Detailed error info for table ${tableName}:`, errorDetails)
            throw new Error(`テーブル ${tableName} の処理でエラーが発生しました: ${errorDetails}`)
          }
        }

    } catch (error) {
      console.error('💥 processFile error:', error)
      
      // エラーの完全な詳細をキャプチャ
      let errorMessage = 'アップロードに失敗しました'
      let errorDetails = 'Unknown error type'
      
      if (error instanceof Error) {
        errorMessage = error.message
        errorDetails = `${error.name}: ${error.message}`
        if (error.stack) {
          console.error('💥 Error stack:', error.stack)
        }
      } else if (typeof error === 'string') {
        errorMessage = error
        errorDetails = error
      } else if (error === null) {
        errorMessage = 'iOS Safari: ファイル読み込みエラーが発生しました。ファイルサイズが大きすぎるか、ファイルが破損している可能性があります。'
        errorDetails = 'null error'
      } else if (typeof error === 'object') {
        try {
          errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error))
          errorMessage = `オブジェクトエラー: ${errorDetails}`
        } catch (jsonError) {
          errorDetails = 'Non-serializable object error'
          errorMessage = 'オブジェクトエラー（詳細取得不可）'
        }
      } else {
        errorDetails = String(error)
        errorMessage = `未知のエラータイプ: ${errorDetails}`
      }
      
      console.error('📝 Final error message:', errorMessage)
      console.error('🔍 Error details:', errorDetails)
      
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
        <h2 className="text-lg font-medium text-gray-900">ファイルアップロード</h2>
        {files.some(f => f.status === 'pending') && (
          <button
            onClick={processAllFiles}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            すべて処理
          </button>
        )}
      </div>

      {/* メモリ使用量警告 */}
      {memoryInfo.jsHeapSizeLimit > 0 && (
        <div className={`p-4 rounded-lg border ${
          memoryInfo.isCritical ? 'bg-red-50 border-red-200' :
          memoryInfo.isNearLimit ? 'bg-yellow-50 border-yellow-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center space-x-2">
            {memoryInfo.isCritical && <AlertTriangle className="h-5 w-5 text-red-600" />}
            {memoryInfo.isNearLimit && !memoryInfo.isCritical && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  メモリ使用量: {memoryInfo.usagePercentage.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500">
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
                  memoryInfo.isCritical ? 'text-red-700' : 'text-yellow-700'
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
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isMobile ? 'touch-manipulation' : ''}`}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          {isMobile 
            ? 'ファイルを選択してアップロード' 
            : 'ファイルをドラッグ&ドロップ'
          }
        </p>
        {!isMobile && (
          <p className="text-gray-600 mb-4">
            または
          </p>
        )}
        <button
          onClick={(e) => {
            console.log('🔘 File select button clicked', { isIOS, isSafari, isMobile })
            e.preventDefault()
            if (fileInputRef.current) {
              console.log('📂 Triggering file input click')
              fileInputRef.current.click()
            } else {
              console.log('❌ File input ref is null')
            }
          }}
          onTouchStart={(e) => {
            // iOS Safari用の追加対策
            if (isIOS) {
              console.log('📱 Touch start on iOS - preparing file input')
              e.preventDefault()
            }
          }}
          onTouchEnd={(e) => {
            // モバイル端末でのタッチサポート
            if (isMobile) {
              console.log('👆 Touch end on mobile')
              e.preventDefault()
              setTimeout(() => {
                if (fileInputRef.current) {
                  console.log('📂 Delayed file input click for mobile')
                  fileInputRef.current.click()
                }
              }, 50)
            }
          }}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 active:bg-blue-800 touch-manipulation"
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
          onFocus={() => console.log('📂 File input focused')}
          onBlur={() => console.log('📂 File input blurred')}
        />
        <p className="text-sm text-gray-500 mt-4">
          対応形式: CSV, TSV, JSON, SQLite3
        </p>
        
      </div>

      {/* Debug Info for iOS Safari */}
      {(isIOS || isSafari) && (
        <div className="mt-4 p-3 bg-gray-100 border rounded-lg">
          <p className="text-xs font-mono text-gray-600">
            🐛 Debug: Files count = {files.length} | iOS = {isIOS ? 'Yes' : 'No'} | Safari = {isSafari ? 'Yes' : 'No'}
          </p>
          {files.length > 0 && (
            <div className="mt-1 text-xs text-gray-500">
              Files: {files.map(f => f.file.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-900">アップロードファイル</h3>
          <div className="space-y-3">
            {files.map((uploadedFile) => (
              <div key={uploadedFile.id} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900">{uploadedFile.file.name}</p>
                      </div>
                      <p className="text-sm text-gray-500">
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
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {uploadedFile.status === 'pending' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      テーブル名
                    </label>
                    <input
                      type="text"
                      value={uploadedFile.tableName}
                      onChange={(e) => updateTableName(uploadedFile.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                
                {uploadedFile.status === 'uploading' && (
                  <div className="mt-3">
                    <div className="bg-blue-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
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
                    <div className="text-sm text-green-600">
                        <p className="mb-2">
                          テーブル「{uploadedFile.tableName}」として正常にアップロードされました
                        </p>
                        {uploadedFile.jsonTables && uploadedFile.jsonTables.length > 0 && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-blue-700 font-medium text-sm mb-2">
                              🔍 JSONデータを検出
                            </p>
                            <p className="text-blue-600 text-sm mb-2">
                              JSONカラムから{uploadedFile.jsonTables.length}個の追加テーブルを作成しました:
                            </p>
                            <ul className="list-disc list-inside space-y-1">
                              {uploadedFile.jsonTables.map((jsonTableName, index) => (
                                <li key={index} className="font-mono text-xs text-blue-800">
                                  {jsonTableName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {isIOS && (
                          <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-3">
                            <p className="text-blue-700 font-medium text-xs mb-1">🍎 iOS Safari:</p>
                            <p className="text-blue-600 text-xs">
                              「分析・可視化」タブでテーブルが表示されない場合は、ページを再読み込みしてください。
                            </p>
                            <button
                              onClick={() => window.location.reload()}
                              className="mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                            >
                              ページを再読み込み
                            </button>
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
                        className="text-sm text-blue-600 hover:text-blue-800 mt-2"
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