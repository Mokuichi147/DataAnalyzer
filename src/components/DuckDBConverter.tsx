import React, { useState } from 'react'
import { Download, FileText, AlertCircle, Copy, CheckCircle } from 'lucide-react'

export function DuckDBConverter() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const exportCommands = [
    {
      title: 'Parquet形式（推奨）',
      description: '最高のパフォーマンスとデータ型保持',
      command: 'COPY table_name TO \'output.parquet\' (FORMAT PARQUET);',
      benefits: ['圧縮効率が高い', 'データ型完全保持', '高速読み込み']
    },
    {
      title: 'CSV形式',
      description: '汎用性が高く、どこでも使用可能',
      command: 'COPY table_name TO \'output.csv\' (FORMAT CSV, HEADER);',
      benefits: ['汎用性が高い', 'テキストエディタで確認可能', 'Excel等で開ける']
    },
    {
      title: 'JSON形式',
      description: '構造化データに最適',
      command: 'COPY table_name TO \'output.json\' (FORMAT JSON);',
      benefits: ['階層データ対応', 'ウェブ標準', 'プログラム処理しやすい']
    },
    {
      title: 'SQLite形式',
      description: 'データベース構造を保持',
      command: '.output output.sqlite\n.dump',
      benefits: ['リレーション保持', '他のツールで使用可能', 'インデックス情報保持']
    }
  ]

  const batchExportCommand = `-- 全テーブルを一括エクスポート
SHOW TABLES;

-- 各テーブルをParquet形式でエクスポート
COPY table1 TO 'table1.parquet' (FORMAT PARQUET);
COPY table2 TO 'table2.parquet' (FORMAT PARQUET);
-- 必要に応じて他のテーブルも追加

-- または、1つのファイルに結合
CREATE VIEW combined_data AS 
SELECT 'table1' as source, * FROM table1
UNION ALL
SELECT 'table2' as source, * FROM table2;

COPY combined_data TO 'combined_data.parquet' (FORMAT PARQUET);`

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">DuckDBファイル読み込み制限</h3>
            <p className="text-sm text-yellow-700 mt-1">
              ブラウザのセキュリティ制限により、DuckDBファイルの直接読み込みはサポートされていません。
              以下の方法でデータをエクスポートしてから本アプリにアップロードしてください。
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {exportCommands.map((cmd, index) => (
          <div key={index} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-medium text-gray-900">{cmd.title}</h4>
                <p className="text-sm text-gray-600">{cmd.description}</p>
              </div>
              <button
                onClick={() => copyToClipboard(cmd.command, cmd.title)}
                className="flex items-center space-x-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-800"
              >
                {copied === cmd.title ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>{copied === cmd.title ? 'コピー済み' : 'コピー'}</span>
              </button>
            </div>
            
            <div className="bg-gray-50 rounded p-3 mb-3">
              <code className="text-sm text-gray-800 whitespace-pre-wrap">
                {cmd.command}
              </code>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-700">利点:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {cmd.benefits.map((benefit, i) => (
                  <li key={i} className="flex items-center space-x-1">
                    <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-3 flex items-center">
          <FileText className="h-4 w-4 mr-2" />
          一括エクスポートスクリプト
        </h4>
        <div className="bg-white rounded p-3 mb-3">
          <code className="text-sm text-gray-800 whitespace-pre-wrap">
            {batchExportCommand}
          </code>
        </div>
        <button
          onClick={() => copyToClipboard(batchExportCommand, 'batch')}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          {copied === 'batch' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          <span>{copied === 'batch' ? 'コピー済み' : 'スクリプトをコピー'}</span>
        </button>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-medium text-green-900 mb-2">エクスポート後の手順</h4>
        <ol className="text-sm text-green-800 space-y-2">
          <li className="flex items-start space-x-2">
            <span className="bg-green-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">1</span>
            <span>上記のコマンドでDuckDBからデータをエクスポート</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="bg-green-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">2</span>
            <span>エクスポートされたファイルを本アプリの「ファイルアップロード」タブにドラッグ&ドロップ</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="bg-green-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">3</span>
            <span>自動的にテーブルが作成され、分析・可視化が可能になります</span>
          </li>
        </ol>
      </div>

      <div className="text-xs text-gray-500">
        <p>
          <strong>注意:</strong> table_name は実際のテーブル名に置き換えてください。
          DuckDBでテーブル一覧を確認するには <code>SHOW TABLES;</code> を実行してください。
        </p>
      </div>
    </div>
  )
}