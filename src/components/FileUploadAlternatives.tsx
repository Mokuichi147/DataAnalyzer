import React from 'react'
import { AlertCircle, FileText, Download, Code } from 'lucide-react'

interface FileUploadAlternativesProps {
  errorMessage: string
  fileName: string
  fileExtension: string
}

export function FileUploadAlternatives({ errorMessage, fileName, fileExtension }: FileUploadAlternativesProps) {
  const alternatives = [
    {
      title: 'CSVファイルの場合',
      description: 'DuckDBでCSVファイルを作成',
      code: `-- DuckDBでCSVファイルを作成
COPY your_table TO 'output.csv' (FORMAT CSV, HEADER);`,
      applicableFor: ['csv']
    },
    {
      title: 'Parquet形式（推奨）',
      description: '高性能・高圧縮率のParquet形式に変換',
      code: `-- Parquet形式でエクスポート
COPY your_table TO 'output.parquet' (FORMAT PARQUET);`,
      applicableFor: ['parquet', 'csv', 'json']
    },
    {
      title: 'JSONファイルの場合',
      description: 'DuckDBでJSONファイルを作成',
      code: `-- JSONファイルをエクスポート
COPY your_table TO 'output.json' (FORMAT JSON);`,
      applicableFor: ['json']
    },
    {
      title: 'SQLiteファイルの場合',
      description: 'SQLiteからCSVまたはParquetにエクスポート',
      code: `-- SQLiteからCSVにエクスポート
.mode csv
.output output.csv
SELECT * FROM your_table;

-- または、DuckDBを使用
CREATE TABLE temp_table AS SELECT * FROM 'your_file.sqlite';
COPY temp_table TO 'output.parquet' (FORMAT PARQUET);`,
      applicableFor: ['sqlite', 'sqlite3', 'db']
    }
  ]

  const applicableAlternatives = alternatives.filter(alt => 
    alt.applicableFor.includes(fileExtension) || fileExtension === 'unknown'
  )

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-4">
      <div className="flex items-start space-x-3">
        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
        <div>
          <h3 className="font-medium text-red-800">ファイル読み込みエラー</h3>
          <p className="text-sm text-red-700 mt-1">
            {fileName} の読み込みに失敗しました
          </p>
          <details className="mt-2 text-xs text-red-600">
            <summary className="cursor-pointer">エラー詳細</summary>
            <pre className="mt-1 whitespace-pre-wrap">{errorMessage}</pre>
          </details>
        </div>
      </div>

      <div className="border-t border-red-200 pt-4">
        <h4 className="font-medium text-red-800 mb-3 flex items-center">
          <FileText className="h-4 w-4 mr-2" />
          代替解決策
        </h4>
        
        <div className="space-y-3">
          {applicableAlternatives.map((alt, index) => (
            <div key={index} className="bg-white border border-red-200 rounded p-3">
              <h5 className="font-medium text-gray-900 mb-1">{alt.title}</h5>
              <p className="text-sm text-gray-600 mb-2">{alt.description}</p>
              
              <div className="bg-gray-50 rounded p-2 text-sm font-mono text-gray-800">
                <pre className="whitespace-pre-wrap">{alt.code}</pre>
              </div>
              
              <button
                onClick={() => navigator.clipboard.writeText(alt.code)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center"
              >
                <Code className="h-3 w-3 mr-1" />
                コードをコピー
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <h4 className="font-medium text-blue-800 mb-2">手順</h4>
        <ol className="text-sm text-blue-700 space-y-1">
          <li>1. 上記のコードを使用してファイルを変換</li>
          <li>2. 変換されたファイルを本アプリに再アップロード</li>
          <li>3. 正常に読み込まれることを確認</li>
        </ol>
      </div>
    </div>
  )
}