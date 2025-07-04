import React, { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle } from 'lucide-react'
import { isValidFileType, formatBytes } from '@/lib/utils'
import { createTableFromFile, getTableCount } from '@/lib/duckdb'
import { useDataStore } from '@/store/dataStore'
import { useRealtimeStore } from '@/store/realtimeStore'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  tableName: string
  error?: string
}

export function FileUpload() {
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

    const uploadedFiles: UploadedFile[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      tableName: file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_'),
    }))

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

      await createTableFromFile(uploadedFile.file, uploadedFile.tableName)

      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id ? { ...f, status: 'success' } : f
      ))

      // Add table to store
      addTable({
        name: uploadedFile.tableName,
        connectionId: 'file',
        columns: [], // Will be populated later
        isLoaded: true
      })

      // Add to realtime monitoring
      const rowCount = await getTableCount(uploadedFile.tableName)
      addSubscription({
        tableName: uploadedFile.tableName,
        connectionId: 'file',
        rowCount: rowCount,
      })

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
          accept=".csv,.tsv,.json,.xlsx,.xls,.sqlite,.sqlite3,.db,.parquet"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <p className="text-sm text-gray-500 mt-4">
          対応形式: CSV, TSV, JSON, Excel, SQLite, Parquet
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
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{uploadedFile.file.name}</p>
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
                    <p className="text-sm text-green-600">
                      テーブル「{uploadedFile.tableName}」として正常にアップロードされました
                    </p>
                  </div>
                )}
                
                {uploadedFile.status === 'error' && (
                  <div className="mt-3">
                    <p className="text-sm text-red-600">
                      エラー: {uploadedFile.error}
                    </p>
                    <button
                      onClick={() => processFile(uploadedFile)}
                      className="text-sm text-blue-600 hover:text-blue-800 mt-1"
                    >
                      再試行
                    </button>
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