import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// iOS Safari対応のUUID生成関数
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // iOS Safari用のフォールバック
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export interface DataConnection {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'sqlite' | 'file'
  config: {
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    ssl?: boolean
    filePath?: string
  }
  isConnected: boolean
  lastConnected?: Date
}

export interface DataTable {
  id: string
  name: string
  connectionId: string
  schema?: string
  columns: Array<{
    name: string
    type: string
    nullable: boolean
  }>
  rowCount?: number
  isLoaded: boolean
}

export interface DataFilter {
  column: string
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between' | 'in'
  value: any
  isActive: boolean
}

export interface DataStoreState {
  connections: DataConnection[]
  tables: DataTable[]
  currentTable: DataTable | null
  filters: DataFilter[]
  isLoading: boolean
  error: string | null
  
  // Actions
  addConnection: (connection: Omit<DataConnection, 'id' | 'isConnected'>) => void
  removeConnection: (id: string) => void
  updateConnection: (id: string, updates: Partial<DataConnection>) => void
  setConnectionStatus: (id: string, isConnected: boolean) => void
  
  addTable: (table: Omit<DataTable, 'id'>) => void
  removeTable: (id: string) => void
  removeTableByNameAndConnection: (name: string, connectionId: string) => void
  setCurrentTable: (table: DataTable | null) => void
  
  addFilter: (filter: Omit<DataFilter, 'isActive'>) => void
  removeFilter: (index: number) => void
  toggleFilter: (index: number) => void
  clearFilters: () => void
  
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
}

export const useDataStore = create<DataStoreState>()(
  persist(
    (set) => ({
      connections: [],
      tables: [],
      currentTable: null,
      filters: [],
      isLoading: false,
      error: null,
      
      addConnection: (connection) => {
        const newConnection: DataConnection = {
          ...connection,
          id: generateUUID(),
          isConnected: false,
        }
        set(state => ({
          connections: [...state.connections, newConnection]
        }))
      },
      
      removeConnection: (id) => {
        set(state => ({
          connections: state.connections.filter(conn => conn.id !== id),
          tables: state.tables.filter(table => table.connectionId !== id)
        }))
      },
      
      updateConnection: (id, updates) => {
        set(state => ({
          connections: state.connections.map(conn =>
            conn.id === id ? { ...conn, ...updates } : conn
          )
        }))
      },
      
      setConnectionStatus: (id, isConnected) => {
        set(state => ({
          connections: state.connections.map(conn =>
            conn.id === id 
              ? { ...conn, isConnected, lastConnected: isConnected ? new Date() : conn.lastConnected }
              : conn
          )
        }))
      },
      
      addTable: (table) => {
        const newTable: DataTable = {
          ...table,
          id: generateUUID(),
        }
        set(state => {
          // 同じ名前とconnectionIdの組み合わせのテーブルが既に存在するかチェック
          const existingTableIndex = state.tables.findIndex(
            t => t.name === table.name && t.connectionId === table.connectionId
          )
          
          if (existingTableIndex !== -1) {
            // 既存のテーブルを更新（上書き）
            const updatedTables = [...state.tables]
            updatedTables[existingTableIndex] = newTable
            return { tables: updatedTables }
          } else {
            // 新しいテーブルとして追加
            return { tables: [...state.tables, newTable] }
          }
        })
      },
      
      removeTable: (id) => {
        set(state => ({
          tables: state.tables.filter(table => table.id !== id),
          currentTable: state.currentTable?.id === id ? null : state.currentTable
        }))
      },
      
      removeTableByNameAndConnection: (name, connectionId) => {
        set(state => {
          const tableToRemove = state.tables.find(
            t => t.name === name && t.connectionId === connectionId
          )
          return {
            tables: state.tables.filter(
              table => !(table.name === name && table.connectionId === connectionId)
            ),
            currentTable: state.currentTable?.name === name && state.currentTable?.connectionId === connectionId 
              ? null 
              : state.currentTable
          }
        })
      },
      
      setCurrentTable: (table) => {
        set({ currentTable: table })
      },
      
      addFilter: (filter) => {
        set(state => ({
          filters: [...state.filters, { ...filter, isActive: true }]
        }))
      },
      
      removeFilter: (index) => {
        set(state => ({
          filters: state.filters.filter((_, i) => i !== index)
        }))
      },
      
      toggleFilter: (index) => {
        set(state => ({
          filters: state.filters.map((filter, i) =>
            i === index ? { ...filter, isActive: !filter.isActive } : filter
          )
        }))
      },
      
      clearFilters: () => {
        set({ filters: [] })
      },
      
      setLoading: (isLoading) => {
        set({ isLoading })
      },
      
      setError: (error) => {
        set({ error })
      },
    }),
    {
      name: 'data-analyzer-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        connections: state.connections,
        tables: state.tables,
        filters: state.filters,
      }),
    }
  )
)