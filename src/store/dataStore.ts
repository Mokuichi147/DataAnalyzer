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
  id: string
  columnName: string
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_null' | 'is_not_null' | 'in' | 'not_in'
  value: string | number | boolean | null
  values?: (string | number)[] // for 'in' and 'not_in' operators
  isActive: boolean
  columnType: string
}

export interface DataStoreState {
  tables: DataTable[]
  currentTable: DataTable | null
  isLoading: boolean
  error: string | null
  filters: DataFilter[]
  
  // Actions
  addTable: (table: Omit<DataTable, 'id'>) => void
  removeTable: (id: string) => void
  removeTableByNameAndConnection: (name: string, connectionId: string) => void
  setCurrentTable: (table: DataTable | null) => void
  
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  
  // Filter actions
  addFilter: (filter: Omit<DataFilter, 'id'>) => void
  removeFilter: (id: string) => void
  updateFilter: (id: string, updates: Partial<DataFilter>) => void
  toggleFilter: (id: string) => void
  clearFilters: () => void
}

export const useDataStore = create<DataStoreState>()(
  persist(
    (set) => ({
      tables: [],
      currentTable: null,
      isLoading: false,
      error: null,
      filters: [],
      
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
        set(state => ({
          tables: state.tables.filter(
            table => !(table.name === name && table.connectionId === connectionId)
          ),
          currentTable: state.currentTable?.name === name && state.currentTable?.connectionId === connectionId 
            ? null 
            : state.currentTable
        }))
      },
      
      setCurrentTable: (table) => {
        set({ currentTable: table })
      },
      
      
      setLoading: (isLoading) => {
        set({ isLoading })
      },
      
      setError: (error) => {
        set({ error })
      },
      
      addFilter: (filter) => {
        const newFilter: DataFilter = {
          ...filter,
          id: generateUUID(),
        }
        set(state => ({
          filters: [...state.filters, newFilter]
        }))
      },
      
      removeFilter: (id) => {
        set(state => ({
          filters: state.filters.filter(filter => filter.id !== id)
        }))
      },
      
      updateFilter: (id, updates) => {
        set(state => ({
          filters: state.filters.map(filter =>
            filter.id === id ? { ...filter, ...updates } : filter
          )
        }))
      },
      
      toggleFilter: (id) => {
        set(state => ({
          filters: state.filters.map(filter =>
            filter.id === id ? { ...filter, isActive: !filter.isActive } : filter
          )
        }))
      },
      
      clearFilters: () => {
        set({ filters: [] })
      },
    }),
    {
      name: 'data-analyzer-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tables: state.tables,
        filters: state.filters,
      }),
    }
  )
)