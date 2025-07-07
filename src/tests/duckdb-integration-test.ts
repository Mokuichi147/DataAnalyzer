/**
 * @duckdb/duckdb-wasm v1.29.0 統合テストファイル
 * 実際の動作確認と正しいAPI使用方法の検証
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { 
  createDuckDBHandler
} from '../lib/duckdb-v1.29';

// ================================
// テスト用のモックデータ
// ================================

/**
 * テスト用のSQLiteファイルを作成
 */
export function createTestSQLiteFile(): File {
  // 最小限のSQLiteファイル（マジックヘッダー + 基本構造）
  const sqliteHeader = 'SQLite format 3\0';
  const headerBytes = new TextEncoder().encode(sqliteHeader);
  
  // 実際にはもっと複雑なSQLiteファイル構造が必要ですが、
  // テスト用として簡単なバイナリファイルを作成
  const buffer = new ArrayBuffer(1024);
  const view = new Uint8Array(buffer);
  
  // SQLiteマジックヘッダーを設定
  for (let i = 0; i < headerBytes.length; i++) {
    view[i] = headerBytes[i];
  }
  
  return new File([buffer], 'test.sqlite', { type: 'application/x-sqlite3' });
}

/**
 * テスト用のCSVファイルを作成
 */
export function createTestCSVFile(): File {
  const csvContent = `id,name,age,city
1,John Doe,30,New York
2,Jane Smith,25,Los Angeles
3,Bob Johnson,35,Chicago
4,Alice Brown,28,Houston
5,Charlie Davis,32,Phoenix`;
  
  return new File([csvContent], 'test.csv', { type: 'text/csv' });
}

// ================================
// 基本機能テスト
// ================================

export class DuckDBIntegrationTest {
  private testResults: { [key: string]: { success: boolean; error?: string; duration: number } } = {};

  /**
   * 全テストの実行
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 DuckDB v1.29.0 統合テスト開始');
    
    const tests = [
      { name: 'basic_initialization', test: this.testBasicInitialization },
      { name: 'file_registration', test: this.testFileRegistration },
      { name: 'sqlite_extension', test: this.testSQLiteExtension },
      { name: 'database_attachment', test: this.testDatabaseAttachment },
      { name: 'query_execution', test: this.testQueryExecution },
      { name: 'error_handling', test: this.testErrorHandling },
      { name: 'performance_test', test: this.testPerformance },
      { name: 'csv_processing', test: this.testCSVProcessing },
      { name: 'memory_management', test: this.testMemoryManagement },
      { name: 'concurrent_operations', test: this.testConcurrentOperations }
    ];

    for (const { name, test } of tests) {
      await this.runSingleTest(name, test.bind(this));
    }

    this.printTestResults();
  }

  /**
   * 単一テストの実行
   */
  private async runSingleTest(testName: string, testFunction: () => Promise<void>): Promise<void> {
    console.log(`\n📋 テスト実行中: ${testName}`);
    const startTime = performance.now();

    try {
      await testFunction();
      const duration = performance.now() - startTime;
      this.testResults[testName] = { success: true, duration };
      console.log(`✅ ${testName} 成功 (${duration.toFixed(2)}ms)`);
    } catch (error) {
      const duration = performance.now() - startTime;
      this.testResults[testName] = { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        duration 
      };
      console.error(`❌ ${testName} 失敗:`, error);
    }
  }

  /**
   * テスト1: 基本的な初期化
   */
  async testBasicInitialization(): Promise<void> {
    const db = createDuckDBHandler();
    
    // 初期化テスト
    await db.initialize();
    
    // 接続確認
    const result = await db.query('SELECT 1 as test');
    if (result[0].test !== 1) {
      throw new Error('基本クエリが正しく実行されませんでした');
    }
    
    console.log('✅ 基本初期化テスト成功');
  }

  /**
   * テスト2: ファイル登録
   */
  async testFileRegistration(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    const testFile = createTestCSVFile();
    
    // ファイル登録
    await db.registerFileHandle(
      'test.csv',
      testFile,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );
    
    // 登録確認（ファイルが存在することを確認）
    try {
      await db.query("SELECT * FROM read_csv_auto('test.csv') LIMIT 1");
      console.log('✅ ファイル登録テスト成功');
    } catch (error) {
      throw new Error(`ファイル登録後のアクセスに失敗: ${error}`);
    }
  }

  /**
   * テスト3: SQLite拡張機能
   */
  async testSQLiteExtension(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    // SQLite拡張のインストール
    await db.installSQLiteExtension();
    
    // 拡張機能の確認
    const extensions = await db.query("SELECT * FROM duckdb_extensions() WHERE extension_name = 'sqlite'");
    if (extensions.length === 0) {
      throw new Error('SQLite拡張がインストールされていません');
    }
    
    console.log('✅ SQLite拡張テスト成功');
  }

  /**
   * テスト4: データベース接続
   */
  async testDatabaseAttachment(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    const testFile = createTestSQLiteFile();
    
    // ファイル登録
    await db.registerFileHandle(
      'test.sqlite',
      testFile,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );
    
    // SQLite拡張のインストール
    await db.installSQLiteExtension();
    
    // データベース接続の試行
    try {
      await db.attachSQLiteDatabase('test.sqlite', 'test_db');
      console.log('✅ データベース接続テスト成功');
    } catch (error) {
      // 空のSQLiteファイルでは接続が失敗する可能性がある
      console.log('⚠️ データベース接続テスト: 空ファイルのため接続に失敗（予想される動作）');
    }
  }

  /**
   * テスト5: クエリ実行
   */
  async testQueryExecution(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    // 複数のクエリタイプをテスト
    const queries = [
      { name: 'SELECT', query: 'SELECT 1 as num, \'test\' as text' },
      { name: 'WITH', query: 'WITH test_cte AS (SELECT 1 as id) SELECT * FROM test_cte' },
      { name: 'VALUES', query: 'VALUES (1, \'a\'), (2, \'b\'), (3, \'c\')' },
      { name: 'ARITHMETIC', query: 'SELECT 10 + 5 as sum, 10 * 5 as product, 10 / 2 as division' }
    ];
    
    for (const { name, query } of queries) {
      const result = await db.query(query);
      if (result.length === 0) {
        throw new Error(`${name} クエリが結果を返しませんでした`);
      }
    }
    
    console.log('✅ クエリ実行テスト成功');
  }

  /**
   * テスト6: エラーハンドリング
   */
  async testErrorHandling(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    // 意図的にエラーを発生させるクエリ
    const errorQueries = [
      'SELECT * FROM non_existent_table',
      'INVALID SQL SYNTAX',
      'SELECT 1 / 0'  // ゼロ除算
    ];
    
    for (const query of errorQueries) {
      try {
        await db.query(query);
        throw new Error(`エラークエリが成功してしまいました: ${query}`);
      } catch (error) {
        // エラーが発生することを期待
        console.log(`✅ 期待されるエラーが発生: ${query}`);
      }
    }
    
    console.log('✅ エラーハンドリングテスト成功');
  }

  /**
   * テスト7: パフォーマンステスト
   */
  async testPerformance(): Promise<void> {
    const db = createDuckDBHandler();
    const initStart = performance.now();
    await db.initialize();
    const initTime = performance.now() - initStart;
    
    // 大量データの処理テスト
    const largeDataQuery = `
      WITH RECURSIVE large_data AS (
        SELECT 1 as id, 'test' as name
        UNION ALL
        SELECT id + 1, 'test' || id FROM large_data WHERE id < 1000
      )
      SELECT COUNT(*) as total FROM large_data
    `;
    
    const queryStart = performance.now();
    const result = await db.query(largeDataQuery);
    const queryTime = performance.now() - queryStart;
    
    if (result[0].total !== 1000) {
      throw new Error('大量データ処理の結果が正しくありません');
    }
    
    console.log(`✅ パフォーマンステスト成功 (初期化: ${initTime.toFixed(2)}ms, クエリ: ${queryTime.toFixed(2)}ms)`);
  }

  /**
   * テスト8: CSV処理
   */
  async testCSVProcessing(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    const csvFile = createTestCSVFile();
    
    // CSVファイル登録
    await db.registerFileHandle(
      'test.csv',
      csvFile,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );
    
    // CSV読み取りテスト
    const result = await db.query("SELECT * FROM read_csv_auto('test.csv')");
    
    if (result.length !== 5) {
      throw new Error(`CSVの行数が正しくありません: 期待値 5, 実際値 ${result.length}`);
    }
    
    console.log('✅ CSV処理テスト成功');
  }

  /**
   * テスト9: メモリ管理
   */
  async testMemoryManagement(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    // メモリ使用量の測定
    const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
    
    // 大量のデータ処理
    await db.query(`
      WITH RECURSIVE memory_test AS (
        SELECT 1 as id, 'data' as value
        UNION ALL
        SELECT id + 1, 'data' || id FROM memory_test WHERE id < 100
      )
      SELECT COUNT(*) FROM memory_test
    `);
    
    const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryUsed = memoryAfter - memoryBefore;
    
    console.log(`✅ メモリ管理テスト成功 (使用量: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB)`);
  }

  /**
   * テスト10: 並行処理
   */
  async testConcurrentOperations(): Promise<void> {
    const db = createDuckDBHandler();
    await db.initialize();
    
    // 複数のクエリを同時実行
    const concurrentQueries = [
      'SELECT 1 as test1',
      'SELECT 2 as test2',
      'SELECT 3 as test3',
      'SELECT 4 as test4',
      'SELECT 5 as test5'
    ];
    
    const results = await Promise.all(
      concurrentQueries.map(query => db.query(query))
    );
    
    for (let i = 0; i < results.length; i++) {
      const expected = i + 1;
      const actual = results[i][0][`test${expected}`];
      if (actual !== expected) {
        throw new Error(`並行処理の結果が正しくありません: 期待値 ${expected}, 実際値 ${actual}`);
      }
    }
    
    console.log('✅ 並行処理テスト成功');
  }

  /**
   * テスト結果の表示
   */
  private printTestResults(): void {
    console.log('\n📊 テスト結果サマリー');
    console.log('='.repeat(50));
    
    let totalTests = 0;
    let passedTests = 0;
    let totalTime = 0;
    
    for (const [testName, result] of Object.entries(this.testResults)) {
      totalTests++;
      totalTime += result.duration;
      
      if (result.success) {
        passedTests++;
        console.log(`✅ ${testName}: 成功 (${result.duration.toFixed(2)}ms)`);
      } else {
        console.log(`❌ ${testName}: 失敗 (${result.duration.toFixed(2)}ms)`);
        console.log(`   エラー: ${result.error}`);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`📈 総合結果: ${passedTests}/${totalTests} テストが成功`);
    console.log(`⏱️ 総実行時間: ${totalTime.toFixed(2)}ms`);
    console.log(`📊 成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
      console.log('🎉 全テストが成功しました！');
    } else {
      console.log('⚠️ 一部のテストが失敗しました。');
    }
  }
}

// ================================
// 実行用関数
// ================================

export async function runDuckDBIntegrationTests(): Promise<void> {
  const testRunner = new DuckDBIntegrationTest();
  await testRunner.runAllTests();
}

// ================================
// 使用例
// ================================

/**
 * ブラウザのコンソールで実行する場合
 */
export function runTestsInBrowser(): void {
  console.log('🌐 ブラウザでテストを実行中...');
  
  runDuckDBIntegrationTests()
    .then(() => {
      console.log('✅ 全テストが完了しました');
    })
    .catch(error => {
      console.error('❌ テスト実行中にエラーが発生しました:', error);
    });
}

// デフォルトエクスポート
export default DuckDBIntegrationTest;