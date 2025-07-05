import React, { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, Database } from 'lucide-react'
import { isValidFileType, formatBytes } from '@/lib/utils'
import { createTableFromFile, getTableCount, loadDuckDBFile, getTableInfo } from '@/lib/duckdb'
import { useDataStore } from '@/store/dataStore'
import { useRealtimeStore } from '@/store/realtimeStore'
import { FileUploadAlternatives } from './FileUploadAlternatives'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  tableName: string
  error?: string
  isDuckDBFile?: boolean
  extractedTables?: string[]
}

interface FileUploadProps {
  onNavigateToSettings?: () => void
}

export function FileUpload({ onNavigateToSettings }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addTable, setLoading, setError } = useDataStore()
  const { addSubscription } = useRealtimeStore()

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles = Array.from(selectedFiles).filter(file => {
      if (!isValidFileType(file)) {
        setError(`サポートされていないファイル形式です: ${file.name}`)
        return false
      }
      return true
    })

    const uploadedFiles: UploadedFile[] = validFiles.map(file => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      const isDuckDBFile = fileExtension === 'duckdb'
      // .dbの場合は後でヘッダーを確認して判断
      
      return {
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        tableName: file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_'),
        isDuckDBFile,
      }
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
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id ? { ...f, status: 'uploading' } : f
      ))

      if (uploadedFile.isDuckDBFile) {
        // DuckDBファイルの処理
        const extractedTables = await loadDuckDBFile(uploadedFile.file)
        
        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { 
            ...f, 
            status: 'success',
            extractedTables
          } : f
        ))

        // 各テーブルをストアに追加
        for (const tableName of extractedTables) {
          const tableInfo = await getTableInfo(tableName)
          const columns = tableInfo.map(col => ({
            name: col.column_name,
            type: col.column_type,
            nullable: col.null === 'YES'
          }))

          addTable({
            name: tableName,
            connectionId: 'file',
            columns,
            isLoaded: true
          })

          // リアルタイム監視に追加
          const rowCount = await getTableCount(tableName)
          addSubscription({
            tableName,
            connectionId: 'file',
            rowCount,
          })
        }
      } else {
        // 通常のファイル処理
        await createTableFromFile(uploadedFile.file, uploadedFile.tableName)

        setFiles(prev => prev.map(f => 
          f.id === uploadedFile.id ? { ...f, status: 'success' } : f
        ))

        // テーブル情報を取得
        const tableInfo = await getTableInfo(uploadedFile.tableName)
        const columns = tableInfo.map(col => ({
          name: col.column_name,
          type: col.column_type,
          nullable: col.null === 'YES'
        }))

        // Add to realtime monitoring
        const rowCount = await getTableCount(uploadedFile.tableName)
        
        // Add table to store
        addTable({
          name: uploadedFile.tableName,
          connectionId: 'file',
          columns,
          rowCount,
          isLoaded: true
        })
        addSubscription({
          tableName: uploadedFile.tableName,
          connectionId: 'file',
          rowCount: rowCount,
        })
      }

    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'アップロードに失敗しました'
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

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          ファイルをドラッグ&ドロップ
        </p>
        <p className="text-gray-600 mb-4">
          または
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
        >
          ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.json"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <p className="text-sm text-gray-500 mt-4">
          対応形式: CSV, TSV, JSON
        </p>
        <p className="text-xs text-gray-400 mt-1">
          注意: SQLite、DuckDB、Parquet、ExcelファイルはCSV形式にエクスポートしてからアップロードしてください
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-900">アップロードファイル</h3>
          <div className="space-y-3">
            {files.map((uploadedFile) => (
              <div key={uploadedFile.id} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {uploadedFile.isDuckDBFile ? (
                      <Database className="h-8 w-8 text-blue-600" />
                    ) : (
                      <FileText className="h-8 w-8 text-gray-400" />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900">{uploadedFile.file.name}</p>
                        {uploadedFile.isDuckDBFile && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            DuckDB
                          </span>
                        )}
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
                    <p className="text-sm text-gray-600 mt-1">処理中...</p>
                  </div>
                )}
                
                {uploadedFile.status === 'success' && (
                  <div className="mt-3">
                    {uploadedFile.isDuckDBFile && uploadedFile.extractedTables ? (
                      <div className="text-sm text-green-600">
                        <p>DuckDBファイルから{uploadedFile.extractedTables.length}個のテーブルを読み込みました:</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          {uploadedFile.extractedTables.map((tableName, index) => (
                            <li key={index} className="font-mono">{tableName}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-green-600">
                        テーブル「{uploadedFile.tableName}」として正常にアップロードされました
                      </p>
                    )}
                  </div>
                )}
                
                {uploadedFile.status === 'error' && (
                  <div className="mt-3">
                    {uploadedFile.isDuckDBFile ? (
                      <div className="bg-amber-50 border border-amber-200 rounded p-3">
                        <div className="flex items-start space-x-2">
                          <div className="text-amber-600 font-medium text-sm">🔒 DuckDBファイル検出</div>
                        </div>
                        <div className="text-sm text-amber-700 mt-2 whitespace-pre-line">
                          {uploadedFile.error}
                        </div>
                        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-sm text-blue-700 font-medium">💡 クイックソリューション:</p>
                          <div className="text-xs text-blue-600 mt-1 space-y-1">
                            <div>1. DuckDBで: <code className="bg-white px-1 rounded">SHOW TABLES;</code></div>
                            <div>2. エクスポート: <code className="bg-white px-1 rounded">COPY table TO 'file.parquet' (FORMAT PARQUET);</code></div>
                            <div>3. 本アプリに .parquet ファイルをアップロード</div>
                          </div>
                          <button
                            onClick={onNavigateToSettings}
                            className="text-xs text-blue-600 hover:text-blue-800 underline mt-2"
                          >
                            詳細ガイドを見る →
                          </button>
                        </div>
                      </div>
                    ) : (
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
                    )}
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