import * as duckdb from '@duckdb/duckdb-wasm';
import { 
  createDuckDBHandler, 
  createSQLiteHandler 
} from '../lib/duckdb-v1.29';

/**
 * @duckdb/duckdb-wasm v1.29.0 实际使用示例
 * 这些示例展示了正确的API使用方法和最佳实践
 */

// ================================
// 示例1: 基本的DuckDB初始化和文件注册
// ================================

export async function example1_BasicInitialization(): Promise<void> {
  console.log('🚀 示例1: 基本的DuckDB初始化和文件注册');
  
  const db = createDuckDBHandler();
  
  try {
    // 1. 初始化DuckDB
    await db.initialize();
    console.log('✅ DuckDB初始化成功');
    
    // 2. 模拟文件上传（实际使用中这来自用户输入）
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.db,.sqlite,.sqlite3';
    
    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        // 3. 注册文件句柄
        await db.registerFileHandle(
          file.name,
          file,
          duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
          true
        );
        
        console.log(`✅ 文件注册成功: ${file.name}`);
        
        // 4. 安装SQLite扩展
        await db.installSQLiteExtension();
        
        // 5. 附加数据库
        await db.attachSQLiteDatabase(file.name, 'user_db');
        
        // 6. 获取表列表
        const tables = await db.getTableList('user_db');
        console.log('📋 发现的表:', tables);
        
      } catch (error) {
        console.error('❌ 文件处理失败:', error);
      }
    };
    
    // 触发文件选择
    fileInput.click();
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
  }
}

// ================================
// 示例2: SQLite文件的完整处理流程
// ================================

export async function example2_SQLiteFileProcessing(file: File): Promise<void> {
  console.log('🚀 示例2: SQLite文件的完整处理流程');
  
  const sqliteHandler = createSQLiteHandler();
  
  try {
    // 1. 加载SQLite文件
    const tables = await sqliteHandler.loadSQLiteFile(file);
    console.log(`✅ 成功加载 ${tables.length} 个表`);
    
    // 2. 对每个表进行基本分析
    for (const tableName of tables) {
      try {
        // 获取表结构
        const schema = await sqliteHandler.queryData(`DESCRIBE uploaded_sqlite.${tableName}`);
        console.log(`📋 表 ${tableName} 结构:`, schema);
        
        // 获取行数
        const countResult = await sqliteHandler.queryData(`SELECT COUNT(*) as count FROM uploaded_sqlite.${tableName}`);
        const rowCount = countResult[0].count;
        console.log(`📊 表 ${tableName} 有 ${rowCount} 行数据`);
        
        // 获取前5行数据
        const sampleData = await sqliteHandler.queryData(`SELECT * FROM uploaded_sqlite.${tableName} LIMIT 5`);
        console.log(`🔍 表 ${tableName} 样本数据:`, sampleData);
        
      } catch (error) {
        console.error(`❌ 分析表 ${tableName} 失败:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ SQLite文件处理失败:', error);
  }
}

// ================================
// 示例3: 高级数据分析和查询
// ================================

export async function example3_AdvancedDataAnalysis(file: File): Promise<void> {
  console.log('🚀 示例3: 高级数据分析和查询');
  
  const sqliteHandler = createSQLiteHandler();
  
  try {
    // 1. 加载文件
    const tables = await sqliteHandler.loadSQLiteFile(file);
    
    // 2. 假设我们有一个名为 'users' 的表
    const mainTable = tables[0]; // 使用第一个表作为示例
    
    // 3. 复杂的数据分析查询
    const analyses = [
      {
        name: '基本统计',
        query: `
          SELECT 
            COUNT(*) as total_rows,
            COUNT(DISTINCT *) as unique_rows
          FROM uploaded_sqlite.${mainTable}
        `
      },
      {
        name: '数据类型分析',
        query: `
          SELECT 
            column_name,
            column_type,
            CASE 
              WHEN "null" = 'YES' THEN 'Nullable'
              ELSE 'Not Null'
            END as nullable_status
          FROM (DESCRIBE uploaded_sqlite.${mainTable})
        `
      },
      {
        name: '空值检查',
        query: `
          SELECT 
            COUNT(*) as total_rows,
            COUNT(*) - COUNT(column_name) as null_count
          FROM uploaded_sqlite.${mainTable}
        `
      }
    ];
    
    // 4. 执行分析查询
    for (const analysis of analyses) {
      try {
        const result = await sqliteHandler.queryData(analysis.query);
        console.log(`📊 ${analysis.name}:`, result);
      } catch (error) {
        console.error(`❌ ${analysis.name} 分析失败:`, error);
      }
    }
    
    // 5. 高级聚合查询示例
    try {
      const aggregateQuery = `
        SELECT 
          column_name,
          COUNT(*) as frequency
        FROM uploaded_sqlite.${mainTable}
        GROUP BY column_name
        ORDER BY frequency DESC
        LIMIT 10
      `;
      
      const aggregateResult = await sqliteHandler.queryData(aggregateQuery);
      console.log('📈 聚合分析结果:', aggregateResult);
      
    } catch (error) {
      console.error('❌ 聚合查询失败:', error);
    }
    
  } catch (error) {
    console.error('❌ 高级数据分析失败:', error);
  }
}

// ================================
// 示例4: 错误处理和回退策略
// ================================

export async function example4_ErrorHandlingAndFallback(file: File): Promise<void> {
  console.log('🚀 示例4: 错误处理和回退策略');
  
  const db = createDuckDBHandler();
  
  try {
    // 1. 尝试DuckDB初始化
    await db.initialize();
    
    // 2. 尝试注册文件
    await db.registerFileHandle(
      file.name,
      file,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );
    
    // 3. 尝试SQLite扩展
    await db.installSQLiteExtension();
    
    // 4. 尝试附加数据库
    await db.attachSQLiteDatabase(file.name, 'test_db');
    
    console.log('✅ 所有操作成功完成');
    
  } catch (error) {
    console.warn('⚠️ DuckDB操作失败，尝试回退策略:', error);
    
    // 回退策略1: 使用sql.js直接处理SQLite文件
    try {
      await fallbackToSqlJs(file);
    } catch (fallbackError) {
      console.error('❌ 回退策略也失败:', fallbackError);
      
      // 回退策略2: 使用内存数据存储
      await fallbackToMemoryStore(file);
    }
  }
}

// ================================
// 示例5: 性能优化和最佳实践
// ================================

export async function example5_PerformanceOptimization(file: File): Promise<void> {
  console.log('🚀 示例5: 性能优化和最佳实践');
  
  const sqliteHandler = createSQLiteHandler();
  
  try {
    // 1. 使用计时器测量性能
    const startTime = performance.now();
    
    // 2. 加载文件
    const tables = await sqliteHandler.loadSQLiteFile(file);
    
    const loadTime = performance.now() - startTime;
    console.log(`⏱️ 文件加载时间: ${loadTime.toFixed(2)}ms`);
    
    // 3. 批量查询优化
    const batchQueries = tables.map(table => ({
      table,
      query: `SELECT COUNT(*) as count FROM uploaded_sqlite.${table}`
    }));
    
    const batchStartTime = performance.now();
    const batchResults = await Promise.all(
      batchQueries.map(async ({ table, query }) => {
        try {
          const result = await sqliteHandler.queryData(query);
          return { table, count: result[0].count };
        } catch (error) {
          return { table, error: (error as Error).message };
        }
      })
    );
    
    const batchTime = performance.now() - batchStartTime;
    console.log(`⏱️ 批量查询时间: ${batchTime.toFixed(2)}ms`);
    console.log('📊 批量查询结果:', batchResults);
    
    // 4. 内存使用优化
    const memInfo = (performance as any).memory;
    if (memInfo) {
      console.log('💾 内存使用情况:', {
        used: `${(memInfo.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memInfo.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memInfo.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
      });
    }
    
  } catch (error) {
    console.error('❌ 性能优化示例失败:', error);
  }
}

// ================================
// 辅助函数
// ================================

async function fallbackToSqlJs(file: File): Promise<void> {
  console.log('🔄 尝试使用sql.js回退策略');
  
  try {
    // 动态加载sql.js
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
    document.head.appendChild(script);
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
    
    // 使用sql.js处理文件
    const SQL = await (window as any).initSqlJs({
      locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    
    const arrayBuffer = await file.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(arrayBuffer));
    
    // 获取表列表
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('✅ sql.js回退策略成功, 表:', tables);
    
    db.close();
    
  } catch (error) {
    console.error('❌ sql.js回退策略失败:', error);
    throw error;
  }
}

async function fallbackToMemoryStore(file: File): Promise<void> {
  console.log('🔄 使用内存数据存储回退策略');
  
  try {
    // 这里可以实现简单的CSV解析回退
    const text = await file.text();
    console.log('✅ 文件内容已读取到内存');
    
    // 实际应用中这里会有更复杂的解析逻辑
    console.log('📝 内容预览:', text.substring(0, 200) + '...');
    
  } catch (error) {
    console.error('❌ 内存存储回退策略失败:', error);
    throw error;
  }
}

// ================================
// 导出所有示例
// ================================

export const examples = {
  example1_BasicInitialization,
  example2_SQLiteFileProcessing,
  example3_AdvancedDataAnalysis,
  example4_ErrorHandlingAndFallback,
  example5_PerformanceOptimization
};

export default examples;