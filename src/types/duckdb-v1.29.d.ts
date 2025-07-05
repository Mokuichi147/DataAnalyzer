/**
 * @duckdb/duckdb-wasm v1.29.0 型定义
 * 正确的API类型定义和接口
 */

declare module '@duckdb/duckdb-wasm' {
  // ================================
  // 核心枚举类型
  // ================================
  
  export enum DuckDBDataProtocol {
    BUFFER = 0,
    NODE_FS = 1,
    BROWSER_FILEREADER = 2,
    BROWSER_FSACCESS = 3,
    HTTP = 4,
    S3 = 5
  }

  export enum DuckDBLogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3
  }

  // ================================
  // 日志记录器接口
  // ================================
  
  export interface DuckDBLogger {
    log(level: DuckDBLogLevel, origin: string, message: string): void;
  }

  export class VoidLogger implements DuckDBLogger {
    log(level: DuckDBLogLevel, origin: string, message: string): void;
  }

  export class ConsoleLogger implements DuckDBLogger {
    log(level: DuckDBLogLevel, origin: string, message: string): void;
  }

  // ================================
  // Bundle和配置接口
  // ================================
  
  export interface DuckDBBundle {
    mainModule: string;
    mainWorker: string;
    pthreadWorker?: string;
  }

  export interface DuckDBBundles {
    [key: string]: DuckDBBundle;
  }

  export interface DuckDBConfig {
    query?: {
      castBigIntToDouble?: boolean;
      castTimestampToDate?: boolean;
    };
    logger?: DuckDBLogger;
  }

  // ================================
  // 结果集接口
  // ================================
  
  export interface DuckDBResultSet {
    numRows: number;
    numCols: number;
    schema: DuckDBSchema;
    toArray(): any[];
    getChild(columnIndex: number): any;
  }

  export interface DuckDBSchema {
    fields: DuckDBField[];
  }

  export interface DuckDBField {
    name: string;
    type: DuckDBType;
    nullable: boolean;
  }

  export interface DuckDBType {
    typeId: number;
    sqlType: string;
  }

  // ================================
  // 连接接口
  // ================================
  
  export interface AsyncDuckDBConnection {
    /**
     * 执行SQL查询
     */
    query(sql: string, params?: any[]): Promise<DuckDBResultSet>;
    
    /**
     * 准备SQL语句
     */
    prepare(sql: string): Promise<DuckDBPreparedStatement>;
    
    /**
     * 发送SQL语句（无返回结果）
     */
    send(sql: string): Promise<void>;
    
    /**
     * 关闭连接
     */
    close(): Promise<void>;
    
    /**
     * 获取表信息
     */
    getTableNames(schema?: string): Promise<string[]>;
    
    /**
     * 获取架构信息
     */
    getSchema(): Promise<DuckDBSchema>;
  }

  export interface DuckDBPreparedStatement {
    query(...params: any[]): Promise<DuckDBResultSet>;
    close(): Promise<void>;
  }

  // ================================
  // 主要的AsyncDuckDB类
  // ================================
  
  export class AsyncDuckDB {
    constructor(logger?: DuckDBLogger, worker?: Worker);
    
    /**
     * 实例化DuckDB
     */
    instantiate(
      mainModule: string | ArrayBuffer,
      pthreadWorker?: string
    ): Promise<void>;
    
    /**
     * 建立连接
     */
    connect(): Promise<AsyncDuckDBConnection>;
    
    /**
     * 注册文件句柄
     */
    registerFileHandle<T>(
      name: string,
      handle: T,
      protocol: DuckDBDataProtocol,
      directIO: boolean
    ): Promise<void>;
    
    /**
     * 注册文件缓冲区
     */
    registerFileBuffer(
      name: string,
      buffer: Uint8Array
    ): Promise<void>;
    
    /**
     * 注册文件URL
     */
    registerFileURL(
      name: string,
      url: string,
      protocol: DuckDBDataProtocol,
      directIO: boolean
    ): Promise<void>;
    
    /**
     * 复制文件到缓冲区
     */
    copyFileToBuffer(name: string): Promise<Uint8Array>;
    
    /**
     * 复制文件到路径
     */
    copyFileToPath(name: string, path: string): Promise<void>;
    
    /**
     * 删除文件
     */
    dropFile(name: string): Promise<void>;
    
    /**
     * 删除所有文件
     */
    dropFiles(): Promise<void>;
    
    /**
     * 获取文件信息
     */
    getFileInfo(name: string): Promise<any>;
    
    /**
     * 列出所有文件
     */
    listFiles(): Promise<string[]>;
    
    /**
     * 重置DuckDB实例
     */
    reset(): Promise<void>;
    
    /**
     * 终止DuckDB实例
     */
    terminate(): Promise<void>;
    
    /**
     * 获取版本信息
     */
    getVersion(): Promise<string>;
    
    /**
     * 获取特性标志
     */
    getFeatureFlags(): Promise<any>;
  }

  // ================================
  // Bundle选择和管理函数
  // ================================
  
  /**
   * 获取jsDelivr CDN的bundle配置
   */
  export function getJsDelivrBundles(): DuckDBBundles;
  
  /**
   * 获取unpkg CDN的bundle配置
   */
  export function getUnpkgBundles(): DuckDBBundles;
  
  /**
   * 选择最适合的bundle
   */
  export function selectBundle(bundles: DuckDBBundles): Promise<DuckDBBundle>;
  
  /**
   * 检测浏览器特性
   */
  export function detectBrowserFeatures(): Promise<any>;

  // ================================
  // 实用工具函数
  // ================================
  
  /**
   * 创建DuckDB实例
   */
  export function createDuckDB(
    config?: DuckDBConfig
  ): Promise<AsyncDuckDB>;
  
  /**
   * 从Worker创建DuckDB实例
   */
  export function createDuckDBFromWorker(
    worker: Worker,
    config?: DuckDBConfig
  ): Promise<AsyncDuckDB>;

  // ================================
  // 错误类型
  // ================================
  
  export class DuckDBError extends Error {
    constructor(message: string, cause?: Error);
  }

  export class DuckDBConnectionError extends DuckDBError {
    constructor(message: string, cause?: Error);
  }

  export class DuckDBQueryError extends DuckDBError {
    constructor(message: string, cause?: Error);
  }

  // ================================
  // 配置常量
  // ================================
  
  export const DUCKDB_WASM_VERSION: string;
  export const DUCKDB_VERSION: string;
  
  // ================================
  // 导出的默认配置
  // ================================
  
  export const DEFAULT_CONFIG: DuckDBConfig;
  export const DEFAULT_BUNDLES: DuckDBBundles;
}

// ================================
// 扩展的全局类型定义
// ================================

declare global {
  interface Window {
    /**
     * DuckDB全局实例（如果存在）
     */
    duckdb?: any;
    
    /**
     * sql.js全局实例（用于回退）
     */
    initSqlJs?: any;
  }
  
  interface Performance {
    /**
     * 内存使用情况（Chrome专用）
     */
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

// ================================
// 自定义的实用类型
// ================================

export type DuckDBQueryResult = any[];

export type DuckDBTableInfo = {
  name: string;
  schema: DuckDBSchema;
  rowCount: number;
};

export type DuckDBConnectionOptions = {
  timeout?: number;
  retries?: number;
  fallback?: boolean;
};

export type DuckDBFileRegistrationOptions = {
  protocol?: DuckDBDataProtocol;
  directIO?: boolean;
  alias?: string;
};

export type DuckDBSQLiteAttachOptions = {
  alias?: string;
  readonly?: boolean;
  type?: 'sqlite' | 'duckdb';
};

export type DuckDBAnalysisResult = {
  tableName: string;
  rowCount: number;
  columnCount: number;
  schema: DuckDBSchema;
  sampleData: any[];
  errors?: string[];
};

export type DuckDBPerformanceMetrics = {
  initTime: number;
  loadTime: number;
  queryTime: number;
  memoryUsage: {
    used: number;
    total: number;
    limit: number;
  };
};

export default AsyncDuckDB;