import * as duckdb from '@duckdb/duckdb-wasm';
import { memoryDataStore, type Column } from './memoryDataStore';

export interface DuckDBInstance {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
}

// Removed unused variables

/**
 * DuckDB v1.29.0 对应的正确API实现
 */
export class DuckDBV129 {
  private static instance: DuckDBV129;
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;

  private constructor() {}

  static getInstance(): DuckDBV129 {
    if (!DuckDBV129.instance) {
      DuckDBV129.instance = new DuckDBV129();
    }
    return DuckDBV129.instance;
  }

  /**
   * 初始化DuckDB实例
   */
  async initialize(): Promise<void> {
    if (this.db && this.conn) {
      return; // 已经初始化
    }

    try {
      // 1. 设置日志记录器
      const logger = new duckdb.VoidLogger();

      // 2. 获取最新的bundle
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // 3. 创建Worker
      const worker = new Worker(bundle.mainWorker!);

      // 4. 创建AsyncDuckDB实例
      this.db = new duckdb.AsyncDuckDB(logger, worker);

      // 5. 实例化DuckDB
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker || undefined);

      // 6. 建立连接
      this.conn = await this.db.connect();

      console.log('✅ DuckDB v1.29.0 初始化成功');
    } catch (error) {
      console.error('❌ DuckDB初始化失败:', error);
      throw error;
    }
  }

  /**
   * 正确的文件注册方法
   */
  async registerFileHandle(
    filename: string,
    file: File,
    protocol: duckdb.DuckDBDataProtocol = duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    directIO: boolean = true
  ): Promise<void> {
    if (!this.db) {
      throw new Error('DuckDB未初始化');
    }

    try {
      await this.db.registerFileHandle(filename, file, protocol, directIO);
      console.log(`✅ 文件注册成功: ${filename}`);
    } catch (error) {
      console.error(`❌ 文件注册失败: ${filename}`, error);
      throw error;
    }
  }

  /**
   * 安装和加载SQLite扩展
   */
  async installSQLiteExtension(): Promise<void> {
    if (!this.conn) {
      throw new Error('DuckDB连接未建立');
    }

    try {
      // 方法1: 自动安装和加载（推荐）
      await this.conn.query(`
        INSTALL sqlite;
        LOAD sqlite;
      `);
      
      console.log('✅ SQLite扩展安装成功');
    } catch (error) {
      console.error('❌ SQLite扩展安装失败:', error);
      
      // 方法2: 从指定源安装
      try {
        await this.conn.query(`
          INSTALL sqlite FROM 'https://extensions.duckdb.org';
          LOAD sqlite;
        `);
        console.log('✅ SQLite扩展从扩展库安装成功');
      } catch (fallbackError) {
        console.error('❌ SQLite扩展安装彻底失败:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * 附加SQLite数据库
   */
  async attachSQLiteDatabase(filename: string, alias: string = 'sqlite_db'): Promise<void> {
    if (!this.conn) {
      throw new Error('DuckDB连接未建立');
    }

    try {
      // 确保SQLite扩展已安装
      await this.installSQLiteExtension();

      // 附加数据库
      await this.conn.query(`ATTACH '${filename}' AS ${alias} (TYPE sqlite);`);
      console.log(`✅ SQLite数据库附加成功: ${filename} as ${alias}`);
    } catch (error) {
      console.error(`❌ SQLite数据库附加失败: ${filename}`, error);
      throw error;
    }
  }

  /**
   * 获取数据库中的表列表
   */
  async getTableList(database: string = 'main'): Promise<string[]> {
    if (!this.conn) {
      throw new Error('DuckDB连接未建立');
    }

    try {
      const result = await this.conn.query(
        database === 'main' 
          ? `SHOW TABLES;`
          : `SHOW TABLES FROM ${database};`
      );
      
      const tables = result.toArray();
      return tables.map(row => row.name || row.table_name);
    } catch (error) {
      console.error('❌ 获取表列表失败:', error);
      throw error;
    }
  }

  /**
   * 执行SQL查询
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    if (!this.conn) {
      throw new Error('DuckDB连接未建立');
    }

    try {
      const result = await this.conn.query(sql, params);
      return result.toArray();
    } catch (error) {
      console.error('❌ 查询执行失败:', error);
      throw error;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    try {
      if (this.conn) {
        await this.conn.close();
        this.conn = null;
      }
      
      if (this.db) {
        await this.db.terminate();
        this.db = null;
      }
      
      console.log('✅ DuckDB连接已关闭');
    } catch (error) {
      console.error('❌ 关闭连接失败:', error);
    }
  }
}

/**
 * SQLite文件处理的完整工作流程
 */
export class SQLiteFileHandler {
  private duckdb: DuckDBV129;

  constructor() {
    this.duckdb = DuckDBV129.getInstance();
  }

  /**
   * 加载SQLite文件的完整流程
   */
  async loadSQLiteFile(file: File): Promise<string[]> {
    try {
      // 1. 初始化DuckDB
      await this.duckdb.initialize();

      // 2. 注册文件
      const filename = file.name;
      await this.duckdb.registerFileHandle(
        filename,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );

      // 3. 附加SQLite数据库
      const dbAlias = 'uploaded_sqlite';
      await this.duckdb.attachSQLiteDatabase(filename, dbAlias);

      // 4. 获取表列表
      const tables = await this.duckdb.getTableList(dbAlias);
      console.log(`✅ 发现 ${tables.length} 个表:`, tables);

      // 5. 将表数据复制到内存中（可选）
      await this.copyTablesToMemory(tables, dbAlias);

      return tables;
    } catch (error) {
      console.error('❌ SQLite文件加载失败:', error);
      throw error;
    }
  }

  /**
   * 将SQLite表数据复制到内存存储
   */
  private async copyTablesToMemory(tables: string[], dbAlias: string): Promise<void> {
    for (const tableName of tables) {
      try {
        // 获取表结构
        const schema = await this.duckdb.query(`DESCRIBE ${dbAlias}.${tableName}`);
        const columns: Column[] = schema.map(row => ({
          name: row.column_name,
          type: row.column_type,
          nullable: row.null === 'YES'
        }));

        // 获取表数据
        const data = await this.duckdb.query(`SELECT * FROM ${dbAlias}.${tableName}`);

        // 在内存存储中创建表
        try {
          memoryDataStore.dropTable(tableName);
        } catch (e) {
          // 忽略表不存在的错误
        }
        
        memoryDataStore.createTable(tableName, columns);
        if (data.length > 0) {
          memoryDataStore.insertRows(tableName, data);
        }

        console.log(`✅ 表 ${tableName} 已复制到内存: ${data.length} 行`);
      } catch (error) {
        console.error(`❌ 复制表 ${tableName} 失败:`, error);
      }
    }
  }

  /**
   * 查询数据
   */
  async queryData(sql: string): Promise<any[]> {
    return await this.duckdb.query(sql);
  }
}

/**
 * 完整的使用示例
 */
export class DuckDBUsageExample {
  private sqliteHandler: SQLiteFileHandler;

  constructor() {
    this.sqliteHandler = new SQLiteFileHandler();
  }

  /**
   * 示例1: 加载SQLite文件
   */
  async example1LoadSQLiteFile(file: File): Promise<void> {
    try {
      console.log('🚀 开始加载SQLite文件...');
      
      const tables = await this.sqliteHandler.loadSQLiteFile(file);
      
      console.log(`✅ 成功加载 ${tables.length} 个表:`, tables);
      
      // 查询示例
      for (const table of tables) {
        const count = await this.sqliteHandler.queryData(`SELECT COUNT(*) as count FROM uploaded_sqlite.${table}`);
        console.log(`表 ${table} 有 ${count[0].count} 行数据`);
      }
    } catch (error) {
      console.error('❌ 示例1失败:', error);
    }
  }

  /**
   * 示例2: 直接文件操作
   */
  async example2DirectFileOperation(file: File): Promise<void> {
    const duckdb = DuckDBV129.getInstance();
    
    try {
      // 初始化
      await duckdb.initialize();
      
      // 注册文件
      await duckdb.registerFileHandle(
        file.name,
        file,
        (duckdb as any).DuckDBDataProtocol?.BROWSER_FILEREADER || 'browser_filereader',
        true
      );
      
      // 安装SQLite扩展
      await duckdb.installSQLiteExtension();
      
      // 使用sqlite_scan函数直接查询
      const result = await duckdb.query(`
        SELECT * FROM sqlite_scan('${file.name}', 'sqlite_master')
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `);
      
      console.log('✅ 直接查询结果:', result);
      
    } catch (error) {
      console.error('❌ 示例2失败:', error);
    }
  }

  /**
   * 示例3: 数据分析查询
   */
  async example3DataAnalysis(file: File): Promise<void> {
    try {
      await this.sqliteHandler.loadSQLiteFile(file);
      
      // 复杂查询示例
      const analysisResults = await this.sqliteHandler.queryData(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT *) as unique_records
        FROM uploaded_sqlite.your_table_name
      `);
      
      console.log('📊 数据分析结果:', analysisResults);
      
    } catch (error) {
      console.error('❌ 示例3失败:', error);
    }
  }
}

// 导出便于使用的工厂函数
export function createDuckDBHandler(): DuckDBV129 {
  return DuckDBV129.getInstance();
}

export function createSQLiteHandler(): SQLiteFileHandler {
  return new SQLiteFileHandler();
}

export function createUsageExample(): DuckDBUsageExample {
  return new DuckDBUsageExample();
}

// 默认导出
export default {
  DuckDBV129,
  SQLiteFileHandler,
  DuckDBUsageExample,
  createDuckDBHandler,
  createSQLiteHandler,
  createUsageExample
};