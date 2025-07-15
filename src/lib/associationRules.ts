import { memoryDataStore } from './memoryDataStore'

export interface AssociationRule {
  antecedent: string[]
  consequent: string[]
  support: number
  confidence: number
  lift: number
  conviction: number
}

export interface AssociationRulesResult {
  rules: AssociationRule[]
  totalTransactions: number
  itemFrequency: Map<string, number>
  performanceMetrics: {
    processingTime: number
    rulesGenerated: number
    itemsAnalyzed: number
  }
}

export interface AssociationRulesOptions {
  minSupport?: number
  minConfidence?: number
  maxItemsetSize?: number
}

interface FrequentItemset {
  items: string[]
  support: number
  count: number
}

export async function analyzeAssociationRules(
  columns: any[],
  _filters: any[] = [],
  options: AssociationRulesOptions = {}
): Promise<AssociationRulesResult> {
  const startTime = performance.now()
  
  try {
    // プライベートなtablesプロパティにアクセスするためのワークアラウンド
    const store = memoryDataStore as any
    const tableMap = store.tables
    if (!tableMap || tableMap.size === 0) {
      throw new Error('No tables available for analysis')
    }
    
    const tableName = Array.from(tableMap.keys())[0]
    const data = memoryDataStore.query(`SELECT * FROM "${tableName}"`)
    
    if (!data || data.length === 0) {
      throw new Error('No data available for analysis')
    }

    // フィルター機能は後で実装
    const filteredData = data
    
    if (filteredData.length === 0) {
      throw new Error('No data remaining after applying filters')
    }

    const {
      minSupport = 0.1,
      minConfidence = 0.5,
      maxItemsetSize = 3
    } = options

    const columnNames = columns.map(col => col.name)
    const transactions = preprocessData(filteredData, columnNames)
    const totalTransactions = transactions.length

    const frequentItemsets = findFrequentItemsets(
      transactions,
      minSupport,
      totalTransactions,
      maxItemsetSize
    )

    const rules = generateAssociationRules(
      frequentItemsets,
      minConfidence
    )

    const itemFrequency = calculateItemFrequency(transactions)

    const endTime = performance.now()

    return {
      rules,
      totalTransactions,
      itemFrequency,
      performanceMetrics: {
        processingTime: endTime - startTime,
        rulesGenerated: rules.length,
        itemsAnalyzed: itemFrequency.size
      }
    }
  } catch (error) {
    console.error('Association rules analysis failed:', error)
    throw error
  }
}

function preprocessData(data: Record<string, any>[], columnNames: string[]): string[][] {
  return data.map(row => {
    const transaction: string[] = []
    
    for (const columnName of columnNames) {
      const value = row[columnName]
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'boolean') {
          if (value) {
            transaction.push(`${columnName}=true`)
          }
        } else if (typeof value === 'number') {
          const binValue = binNumericValue(value)
          transaction.push(`${columnName}=${binValue}`)
        } else {
          transaction.push(`${columnName}=${String(value)}`)
        }
      }
    }
    
    return transaction
  }).filter(transaction => transaction.length > 0)
}

function binNumericValue(value: number): string {
  if (value < 0) return 'negative'
  if (value === 0) return 'zero'
  if (value <= 10) return 'low'
  if (value <= 100) return 'medium'
  if (value <= 1000) return 'high'
  return 'very_high'
}

function findFrequentItemsets(
  transactions: string[][],
  minSupport: number,
  totalTransactions: number,
  maxItemsetSize: number
): FrequentItemset[] {
  const frequentItemsets: FrequentItemset[] = []
  const minSupportCount = Math.ceil(minSupport * totalTransactions)

  let candidateItemsets = generateCandidateItemsets(transactions, 1)
  
  for (let k = 1; k <= maxItemsetSize && candidateItemsets.length > 0; k++) {
    const frequentKItemsets: FrequentItemset[] = []
    
    for (const itemset of candidateItemsets) {
      const count = countItemsetSupport(transactions, itemset)
      if (count >= minSupportCount) {
        frequentKItemsets.push({
          items: itemset,
          support: count / totalTransactions,
          count
        })
      }
    }
    
    frequentItemsets.push(...frequentKItemsets)
    
    if (k < maxItemsetSize) {
      candidateItemsets = generateCandidateItemsetsFromFrequent(frequentKItemsets, k + 1)
    } else {
      break
    }
  }

  return frequentItemsets
}

function generateCandidateItemsets(transactions: string[][], k: number): string[][] {
  if (k === 1) {
    const itemSet = new Set<string>()
    for (const transaction of transactions) {
      for (const item of transaction) {
        itemSet.add(item)
      }
    }
    return Array.from(itemSet).map(item => [item])
  }
  return []
}

function generateCandidateItemsetsFromFrequent(
  frequentItemsets: FrequentItemset[],
  k: number
): string[][] {
  const candidates: string[][] = []
  const items = frequentItemsets.map(fs => fs.items)
  
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const union = Array.from(new Set([...items[i], ...items[j]])).sort()
      if (union.length === k) {
        candidates.push(union)
      }
    }
  }
  
  return Array.from(new Set(candidates.map(c => JSON.stringify(c))))
    .map(c => JSON.parse(c))
}

function countItemsetSupport(transactions: string[][], itemset: string[]): number {
  return transactions.filter(transaction => 
    itemset.every(item => transaction.includes(item))
  ).length
}

function generateAssociationRules(
  frequentItemsets: FrequentItemset[],
  minConfidence: number
): AssociationRule[] {
  const rules: AssociationRule[] = []
  
  for (const itemset of frequentItemsets) {
    if (itemset.items.length < 2) continue
    
    const subsets = generateNonEmptySubsets(itemset.items)
    
    for (const antecedent of subsets) {
      const consequent = itemset.items.filter(item => !antecedent.includes(item))
      
      if (consequent.length === 0) continue
      
      const antecedentItemset = frequentItemsets.find(fs => 
        fs.items.length === antecedent.length && 
        antecedent.every(item => fs.items.includes(item))
      )
      
      if (!antecedentItemset) continue
      
      const confidence = itemset.support / antecedentItemset.support
      
      if (confidence >= minConfidence) {
        const consequentItemset = frequentItemsets.find(fs => 
          fs.items.length === consequent.length && 
          consequent.every(item => fs.items.includes(item))
        )
        
        const lift = consequentItemset 
          ? itemset.support / (antecedentItemset.support * consequentItemset.support)
          : 0
        
        const conviction = consequentItemset && consequentItemset.support < 1
          ? (1 - consequentItemset.support) / (1 - confidence)
          : Infinity
        
        rules.push({
          antecedent,
          consequent,
          support: itemset.support,
          confidence,
          lift,
          conviction: isFinite(conviction) ? conviction : 0
        })
      }
    }
  }
  
  return rules.sort((a, b) => b.confidence - a.confidence)
}

function generateNonEmptySubsets(items: string[]): string[][] {
  const subsets: string[][] = []
  const n = items.length
  
  for (let i = 1; i < (1 << n) - 1; i++) {
    const subset: string[] = []
    for (let j = 0; j < n; j++) {
      if (i & (1 << j)) {
        subset.push(items[j])
      }
    }
    subsets.push(subset)
  }
  
  return subsets
}

function calculateItemFrequency(transactions: string[][]): Map<string, number> {
  const frequency = new Map<string, number>()
  
  for (const transaction of transactions) {
    for (const item of transaction) {
      frequency.set(item, (frequency.get(item) || 0) + 1)
    }
  }
  
  return frequency
}