# @duckdb/duckdb-wasm v1.29.0 使用ガイド

この資料は、@duckdb/duckdb-wasm v1.29.0での正しいAPI使用方法について説明します。

## 📋 目次

1. [概要](#概要)
2. [正しいAPI使用方法](#正しいapi使用方法)
3. [実装例](#実装例)
4. [よくある問題と解決方法](#よくある問題と解決方法)
5. [パフォーマンス最適化](#パフォーマンス最適化)
6. [トラブルシューティング](#トラブルシューティング)

---

## 概要

@duckdb/duckdb-wasm v1.29.0は、WebAssemblyベースの高性能分析データベースです。以下の主要機能を提供します：

- **高速SQLクエリ処理**
- **多様なファイル形式サポート** (CSV, JSON, Parquet, SQLite)
- **ブラウザ内でのデータ分析**
- **SQLite拡張機能**

---

## 正しいAPI使用方法

### 1. registerFileHandleの正しい使用方法

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

// ✅ 正しい使用方法
await db.registerFileHandle(
  'filename.db',                                    // ファイル名
  fileHandle,                                       // Fileオブジェクト
  duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,    // プロトコル
  true                                             // directIO
);

// ❌ 間違った使用方法
await db.registerFileHandle(file.name, file); // パラメータが不足
```

### 2. DuckDBDataProtocolの正しいインポートと使用

```typescript
// ✅ 正しいインポート
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';

// 使用可能なプロトコル値
enum DuckDBDataProtocol {
  BUFFER = 0,              // メモリ内バッファ
  NODE_FS = 1,             // Node.jsファイルシステム
  BROWSER_FILEREADER = 2,  // ブラウザFileReader API
  BROWSER_FSACCESS = 3,    // ブラウザFile System Access API
  HTTP = 4,                // HTTP経由でのデータ取得
  S3 = 5                   // Amazon S3ストレージ
}
```

### 3. ファイル登録とATTACHの正しい手順

```typescript
// ステップ1: DuckDBの初期化
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

// ステップ2: ファイル登録
await db.registerFileHandle(
  'data.sqlite',
  fileObject,
  duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
  true
);

// ステップ3: SQLite拡張のインストール
await conn.query('INSTALL sqlite; LOAD sqlite;');

// ステップ4: データベースの接続
await conn.query("ATTACH 'data.sqlite' AS db1 (TYPE sqlite);");
```

### 4. SQLite拡張機能のインストールと読み込み

```typescript
// 方法1: 自動インストール（推奨）
await conn.query(`
  INSTALL sqlite;
  LOAD sqlite;
`);

// 方法2: 特定のリポジトリから
await conn.query(`
  INSTALL sqlite FROM 'https://extensions.duckdb.org';
  LOAD sqlite;
`);

// 方法3: sqlite_scan関数の使用
const result = await conn.query(`
  SELECT * FROM sqlite_scan('database.db', 'table_name')
`);
```

---

## 実装例

### 基本的なSQLiteファイル処理

```typescript
import { DuckDBV129 } from '../lib/duckdb-v1.29';

class SQLiteProcessor {
  private db: DuckDBV129;

  constructor() {
    this.db = DuckDBV129.getInstance();
  }

  async processFile(file: File): Promise<void> {
    try {
      // 1. 初期化
      await this.db.initialize();
      
      // 2. ファイル登録
      await this.db.registerFileHandle(
        file.name,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );
      
      // 3. SQLite拡張のインストール
      await this.db.installSQLiteExtension();
      
      // 4. データベースの接続
      await this.db.attachSQLiteDatabase(file.name, 'user_db');
      
      // 5. テーブル一覧の取得
      const tables = await this.db.getTableList('user_db');
      console.log('発見されたテーブル:', tables);
      
      // 6. データの分析
      for (const table of tables) {
        const result = await this.db.query(`
          SELECT COUNT(*) as count FROM user_db.${table}
        `);
        console.log(`${table}: ${result[0].count}行`);
      }
      
    } catch (error) {
      console.error('処理エラー:', error);
      throw error;
    }
  }
}
```

### エラーハンドリングと回復戦略

```typescript
class RobustSQLiteProcessor {
  async processWithFallback(file: File): Promise<void> {
    try {
      // DuckDBでの処理を試行
      await this.procesWithDuckDB(file);
    } catch (duckdbError) {
      console.warn('DuckDBでの処理失敗:', duckdbError);
      
      try {
        // sql.jsでの回復処理
        await this.processWithSqlJs(file);
      } catch (sqlJsError) {
        console.warn('sql.jsでの処理失敗:', sqlJsError);
        
        // 最終的なメモリ内処理
        await this.processWithMemoryStore(file);
      }
    }
  }
  
  private async procesWithDuckDB(file: File): Promise<void> {
    // DuckDBを使用した処理
  }
  
  private async processWithSqlJs(file: File): Promise<void> {
    // sql.jsを使用した回復処理
  }
  
  private async processWithMemoryStore(file: File): Promise<void> {
    // メモリ内データストアを使用した処理
  }
}
```

---

## よくある問題と解決方法

### 問題1: SecurityError が発生する

**症状**: `SecurityError: Failed to construct 'Worker'`

**原因**: HTTPS環境でない、またはCORS設定の問題

**解決方法**:
```typescript
// 環境チェック関数
function isEnvironmentSecure(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    (window.location.protocol === 'https:' || 
     window.location.hostname === 'localhost')
  );
}

// 安全でない環境での回復処理
if (!isEnvironmentSecure()) {
  console.log('DuckDBが使用できません。代替処理を実行します。');
  await fallbackProcessing();
}
```

### 問題2: SQLite拡張が読み込めない

**症状**: `Extension "sqlite" not found`

**原因**: 拡張機能のインストールに失敗

**解決方法**:
```typescript
async function installSQLiteExtensionWithRetry(): Promise<void> {
  const attempts = [
    () => conn.query('INSTALL sqlite; LOAD sqlite;'),
    () => conn.query('INSTALL sqlite FROM "https://extensions.duckdb.org"; LOAD sqlite;'),
    () => conn.query('INSTALL sqlite_scanner; LOAD sqlite_scanner;')
  ];
  
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (error) {
      console.warn('SQLite拡張インストール試行失敗:', error);
    }
  }
  
  throw new Error('SQLite拡張のインストールに失敗しました');
}
```

### 問題3: ファイル読み込みに失敗する

**症状**: `File not found` や `Invalid file format`

**原因**: ファイル登録の問題、または不正なファイル形式

**解決方法**:
```typescript
async function registerFileWithValidation(
  db: duckdb.AsyncDuckDB, 
  file: File
): Promise<void> {
  // ファイル形式の検証
  const validExtensions = ['.db', '.sqlite', '.sqlite3'];
  const fileExtension = file.name.toLowerCase().split('.').pop();
  
  if (!validExtensions.includes(`.${fileExtension}`)) {
    throw new Error(`未サポートのファイル形式: ${fileExtension}`);
  }
  
  // ファイルサイズの検証
  if (file.size > 100 * 1024 * 1024) { // 100MB制限
    throw new Error('ファイルサイズが大きすぎます');
  }
  
  // SQLiteマジックヘッダーの検証
  const header = await file.slice(0, 16).text();
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('有効なSQLiteファイルではありません');
  }
  
  // 登録実行
  await db.registerFileHandle(
    file.name,
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    true
  );
}
```

---

## パフォーマンス最適化

### 1. バッチ処理によるクエリ最適化

```typescript
// ❌ 非効率的な方法
for (const table of tables) {
  const result = await db.query(`SELECT COUNT(*) FROM ${table}`);
  console.log(`${table}: ${result[0].count}`);
}

// ✅ 効率的な方法
const batchQuery = tables.map(table => `
  SELECT '${table}' as table_name, COUNT(*) as count FROM ${table}
`).join(' UNION ALL ');

const results = await db.query(batchQuery);
results.forEach(row => {
  console.log(`${row.table_name}: ${row.count}`);
});
```

### 2. メモリ使用量の最適化

```typescript
class MemoryOptimizedProcessor {
  private maxMemoryUsage = 500 * 1024 * 1024; // 500MB制限
  
  async processLargeFile(file: File): Promise<void> {
    // チャンク単位での処理
    const chunkSize = 10000; // 10,000行ずつ処理
    
    let offset = 0;
    while (true) {
      const chunk = await this.db.query(`
        SELECT * FROM data_table 
        LIMIT ${chunkSize} OFFSET ${offset}
      `);
      
      if (chunk.length === 0) break;
      
      // チャンクを処理
      await this.processChunk(chunk);
      
      offset += chunkSize;
      
      // メモリ使用量チェック
      this.checkMemoryUsage();
    }
  }
  
  private checkMemoryUsage(): void {
    const memInfo = (performance as any).memory;
    if (memInfo && memInfo.usedJSHeapSize > this.maxMemoryUsage) {
      console.warn('メモリ使用量が制限を超過しました');
      // ガベージコレクションの強制実行
      if (window.gc) {
        window.gc();
      }
    }
  }
}
```

### 3. 並行処理による高速化

```typescript
class ConcurrentProcessor {
  private maxConcurrency = 3;
  
  async processMultipleTables(tables: string[]): Promise<void> {
    // テーブルをバッチに分割
    const batches = this.chunkArray(tables, this.maxConcurrency);
    
    for (const batch of batches) {
      // バッチ内のテーブルを並行処理
      await Promise.all(
        batch.map(table => this.processTable(table))
      );
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private async processTable(tableName: string): Promise<void> {
    // 個別テーブルの処理
  }
}
```

---

## トラブルシューティング

### デバッグ用のログ出力

```typescript
class DebugLogger {
  private debugLevel = 'info'; // 'debug', 'info', 'warn', 'error'
  
  log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    if (data) {
      console.log('データ:', data);
    }
    
    // ブラウザの開発者ツールに詳細情報を出力
    if (level === 'error') {
      console.trace();
    }
  }
}

// 使用例
const logger = new DebugLogger();
logger.log('info', 'DuckDB初期化開始');
logger.log('error', 'ファイル読み込み失敗', { filename: file.name, error });
```

### パフォーマンス監視

```typescript
class PerformanceMonitor {
  private metrics: { [key: string]: number } = {};
  
  startTimer(operation: string): void {
    this.metrics[`${operation}_start`] = performance.now();
  }
  
  endTimer(operation: string): number {
    const startTime = this.metrics[`${operation}_start`];
    if (!startTime) {
      throw new Error(`タイマーが開始されていません: ${operation}`);
    }
    
    const duration = performance.now() - startTime;
    this.metrics[`${operation}_duration`] = duration;
    
    console.log(`⏱️ ${operation}: ${duration.toFixed(2)}ms`);
    return duration;
  }
  
  getMetrics(): { [key: string]: number } {
    return { ...this.metrics };
  }
}

// 使用例
const monitor = new PerformanceMonitor();
monitor.startTimer('file_processing');
await processFile(file);
monitor.endTimer('file_processing');
```

---

## まとめ

@duckdb/duckdb-wasm v1.29.0を使用する際の重要なポイント:

1. **正しいAPI使用**: `registerFileHandle`の全パラメータを指定
2. **適切なエラーハンドリング**: 複数の回復戦略を実装
3. **パフォーマンス最適化**: バッチ処理と並行処理を活用
4. **メモリ管理**: 大きなファイルは分割処理
5. **デバッグ**: 詳細なログ出力で問題を特定

これらのベストプラクティスに従うことで、安定した高性能なWebベースのデータ分析アプリケーションを構築できます。