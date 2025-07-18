# Data Analyzer

DuckDB Wasmを使用したブラウザベースのデータ分析アプリケーション

## 主な機能

### ファイルアップロード
- **ドラッグ&ドロップ**: ファイルを簡単にアップロード
- **多種類のファイル形式**: CSV、TSV、JSON、SQLite に対応
- **DBファイル直接読み込み**: .db、.sqlite ファイルから複数テーブルを一括取り込み
- **バッチ処理**: 複数ファイルの同時処理

### データ設定・プレビュー
- **データプレビュー**: テーブルデータの確認
- **フィルタ機能**: 条件に基づくデータの絞り込み
- **ページネーション**: 大量データの効率的な表示
- **エクスポート**: フィルタ結果をCSVでダウンロード

### 統計分析
- **基本統計量**: 平均、標準偏差、四分位数など
- **相関分析**: 変数間の相関係数を計算・可視化
- **変化点検出**: 時系列データの変化点を自動検出
- **因子分析**: 主成分分析による次元削減
- **ヒストグラム**: データ分布の可視化
- **時系列分析**: 時間経過による変化を分析

### 可視化機能
- **インタラクティブチャート**: Chart.js による動的グラフ
- **複数チャート形式**: 線グラフ、棒グラフ、散布図、円グラフ
- **リアルタイム更新**: データ変更に応じた自動更新

### リアルタイム更新機能(シミュレーター用)
- **データ監視**: テーブルの変更を定期的にチェック
- **変更通知**: ブラウザ通知とアプリ内通知
- **自動リフレッシュ**: データ変更時の画面自動更新
- **監視設定**: 監視間隔や対象テーブルの設定
- **データシミュレーター**: テスト用のダミーデータ生成

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **Database**: DuckDB Wasm
- **Charts**: Chart.js + React Chart.js 2
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## セットアップ

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

3. **ブラウザでアクセス**
   ```
   http://localhost:5173
   ```

## 使用方法

### 1. ファイルアップロード
1. 「ファイルアップロード」タブを選択
2. ファイルをドラッグ&ドロップまたは「ファイルを選択」
3. テーブル名を設定
4. 「すべて処理」をクリック

### 2. データ分析
1. 「分析・可視化」タブを選択
2. 分析したいテーブルを選択
3. 分析手法を選択
4. 対象列を選択
5. 「分析実行」をクリック

### 3. リアルタイム監視
1. 「リアルタイム」タブを選択
2. 「サンプル作成」でテストデータを作成（オプション）
3. 監視対象テーブルを追加
4. 監視設定を調整
5. 「開始」で監視を開始

## 対応ファイル形式

- **CSV**: カンマ区切りテキスト
- **TSV**: タブ区切りテキスト
- **JSON**: JSON形式のデータ
- **SQLite**: .db, .sqlite, .sqlite3 ファイル

## 分析機能詳細

### 基本統計量
- 件数、平均、標準偏差
- 最小値、最大値
- 四分位数（Q1, Q2, Q3）

### 相関分析
- ピアソン相関係数
- 相関行列の可視化
- 強い相関関係の特定

### 変化点検出
- 移動平均を用いた変化点検出
- 信頼度スコア
- 変化点の可視化

### 因子分析
- 主成分分析
- 寄与率の計算
- 因子負荷量の表示

## 開発

### ビルド
```bash
npm run build
```

### 型チェック
```bash
npm run lint
```

### プレビュー
```bash
npm run preview
```

## リアルタイム機能の詳細

### 監視機能
- **定期チェック**: 設定した間隔でテーブルの変更をチェック
- **行数監視**: レコード数の変化を検出
- **変更タイプ**: 挿入、更新、削除の検出

### 通知機能
- **ブラウザ通知**: デスクトップ通知でリアルタイム通知
- **アプリ内通知**: 変更履歴の表示と管理
- **自動リフレッシュ**: データプレビューの自動更新

### テスト機能
- **データシミュレーター**: リアルタイム機能のテスト用
- **サンプルデータ生成**: 定期的なダミーデータ挿入
- **監視確認**: 実際の変更検出をテスト

### サポート機能
- **自動フォーマット検出**: アップロードされたファイルの形式を自動識別
- **一括処理**: 複数ファイルの同時アップロード・処理
- **データ型保持**: 元のスキーマ情報を可能な限り保持
- **リアルタイム監視**: 読み込んだテーブルの自動監視
