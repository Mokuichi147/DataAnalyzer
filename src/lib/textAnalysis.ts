import { memoryDataStore } from './memoryDataStore'
// @ts-ignore
import TinySegmenter from 'tiny-segmenter'

export interface TextStatistics {
  columnName: string
  totalRecords: number
  totalCharacters: number
  totalWords: number
  totalSentences: number
  totalParagraphs: number
  averageCharactersPerRecord: number
  averageWordsPerRecord: number
  averageSentencesPerRecord: number
  averageWordsPerSentence: number
  medianCharactersPerRecord: number
  medianWordsPerRecord: number
  minCharacters: number
  maxCharacters: number
  minWords: number
  maxWords: number
  emptyRecords: number
  emptyPercentage: number
  uniqueRecords: number
  uniquePercentage: number
  readabilityScore: number
}

export interface WordFrequency {
  word: string
  count: number
  percentage: number
}

export interface CharacterFrequency {
  character: string
  count: number
  percentage: number
}

export interface TextPatternAnalysis {
  columnName: string
  patterns: Array<{
    pattern: string
    description: string
    count: number
    percentage: number
    examples: string[]
  }>
}

export interface LanguageDetection {
  columnName: string
  totalRecords: number
  averageLength: number
  detectedLanguages: Array<{
    language: string
    count: number
    percentage: number
    confidence: number
  }>
  languagePatterns: Array<{
    pattern: string
    count: number
    percentage: number
  }>
}

export interface SentenceAnalysis {
  columnName: string
  totalSentences: number
  averageSentenceLength: number
  sentenceLengthDistribution: Array<{
    range: string
    count: number
    percentage: number
  }>
  punctuationUsage: Array<{
    punctuation: string
    count: number
    percentage: number
  }>
}

export interface ReadabilityAnalysis {
  columnName: string
  averageWordsPerSentence: number
  averageCharactersPerWord: number
  readabilityScore: number
  complexityLevel: string
  recommendations: string[]
}

// 日本語の文字種類を判定
function getCharacterType(char: string): string {
  const code = char.charCodeAt(0)
  
  // ひらがな
  if (code >= 0x3040 && code <= 0x309F) return 'hiragana'
  // カタカナ
  if (code >= 0x30A0 && code <= 0x30FF) return 'katakana'
  // 漢字
  if (code >= 0x4E00 && code <= 0x9FAF) return 'kanji'
  // 英数字
  if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A) || (code >= 0x0030 && code <= 0x0039)) return 'alphanumeric'
  // 記号・句読点
  if (char.match(/[.,!?;:'"()[\]{}\-_/\\@#$%^&*+=<>|~`]/)) return 'punctuation'
  // 空白
  if (char.match(/\s/)) return 'whitespace'
  // その他
  return 'other'
}

// 文の分割（日本語・英語対応）
function splitIntoSentences(text: string): string[] {
  if (!text || typeof text !== 'string') return []
  
  // 日本語と英語の句読点で分割
  const sentences = text
    .split(/[.!?。！？]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
  
  return sentences
}

// 段落の分割
function splitIntoParagraphs(text: string): string[] {
  if (!text || typeof text !== 'string') return []
  
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

// TinySegmenterのインスタンスを作成
const segmenter = new TinySegmenter()

// 言語検出（簡易版） - tokenizeTextで使用するため前方宣言
function detectLanguageForTokenizer(text: string): { language: string; confidence: number } {
  if (!text || typeof text !== 'string') return { language: 'unknown', confidence: 0 }
  
  const cleanText = text.replace(/\s+/g, '').toLowerCase()
  let japaneseChars = 0
  let englishChars = 0
  let totalChars = 0
  
  for (const char of cleanText) {
    const type = getCharacterType(char)
    totalChars++
    
    if (type === 'hiragana' || type === 'katakana' || type === 'kanji') {
      japaneseChars++
    } else if (type === 'alphanumeric') {
      englishChars++
    }
  }
  
  if (totalChars === 0) return { language: 'unknown', confidence: 0 }
  
  const japaneseRatio = japaneseChars / totalChars
  const englishRatio = englishChars / totalChars
  
  if (japaneseRatio > 0.3) {
    return { language: 'japanese', confidence: Math.min(japaneseRatio * 2, 1) }
  } else if (englishRatio > 0.7) {
    return { language: 'english', confidence: englishRatio }
  } else if (japaneseRatio > 0.1 && englishRatio > 0.3) {
    return { language: 'mixed', confidence: 0.8 }
  } else {
    return { language: 'other', confidence: 0.5 }
  }
}

// 改良された単語分割（日本語形態素解析対応）
function tokenizeText(text: string): string[] {
  if (!text || typeof text !== 'string') return []
  
  // 言語を検出
  const languageDetection = detectLanguageForTokenizer(text)
  
  if (languageDetection.language === 'japanese' || languageDetection.language === 'mixed') {
    // 日本語または混在の場合はTinySegmenterを使用
    try {
      const segments = segmenter.segment(text)
      // 空文字列、空白のみ、記号のみの要素を除外
      return segments.filter((word: string) => 
        word.trim().length > 0 && 
        !/^[\s\p{P}\p{S}]+$/u.test(word)
      )
    } catch (error) {
      console.warn('TinySegmenter failed, falling back to simple tokenization:', error)
      // フォールバック: 簡単な日本語分割
      return text
        .replace(/[.,!?;:'"()[\]{}\-_/\\@#$%^&*+=<>|~`。、！？；：「」『』（）【】]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0)
    }
  } else {
    // 英語の場合は従来の空白ベース分割
    const words = text
      .replace(/[.,!?;:'"()[\]{}\-_/\\@#$%^&*+=<>|~`。、！？；：「」『』（）【】]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
    
    return words
  }
}

// 言語検出（簡易版）
function detectLanguage(text: string): { language: string; confidence: number } {
  if (!text || typeof text !== 'string') return { language: 'unknown', confidence: 0 }
  
  const cleanText = text.replace(/\s+/g, '').toLowerCase()
  let japaneseChars = 0
  let englishChars = 0
  let totalChars = 0
  
  for (const char of cleanText) {
    const type = getCharacterType(char)
    totalChars++
    
    if (type === 'hiragana' || type === 'katakana' || type === 'kanji') {
      japaneseChars++
    } else if (type === 'alphanumeric') {
      englishChars++
    }
  }
  
  if (totalChars === 0) return { language: 'unknown', confidence: 0 }
  
  const japaneseRatio = japaneseChars / totalChars
  const englishRatio = englishChars / totalChars
  
  if (japaneseRatio > 0.3) {
    return { language: 'japanese', confidence: Math.min(japaneseRatio * 2, 1) }
  } else if (englishRatio > 0.7) {
    return { language: 'english', confidence: englishRatio }
  } else if (japaneseRatio > 0.1 && englishRatio > 0.3) {
    return { language: 'mixed', confidence: 0.8 }
  } else {
    return { language: 'other', confidence: 0.5 }
  }
}

// 読みやすさスコア計算（Flesch Reading Ease改良版）
function calculateReadabilityScore(avgWordsPerSentence: number, avgCharsPerWord: number): number {
  // 日本語・英語混在対応の読みやすさ指標
  // 0-100スケール（100が最も読みやすい）
  
  const sentenceLengthPenalty = Math.min(avgWordsPerSentence / 20, 1) * 40
  const wordComplexityPenalty = Math.min((avgCharsPerWord - 3) / 5, 1) * 40
  
  const score = 100 - sentenceLengthPenalty - wordComplexityPenalty
  return Math.max(0, Math.min(100, score))
}

// テキスト統計分析
export async function getTextStatistics(
  tableName: string,
  columnName: string
): Promise<TextStatistics> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    const totalRecords = textData.length
    if (totalRecords === 0) {
      throw new Error(`No valid text data found in column ${columnName}`)
    }

    // 文字数・単語数・文数・段落数の計算
    const characterCounts = textData.map(text => text.length)
    const wordCounts = textData.map(text => tokenizeText(text).length)
    const sentenceCounts = textData.map(text => splitIntoSentences(text).length)
    const paragraphCounts = textData.map(text => splitIntoParagraphs(text).length)

    const totalCharacters = characterCounts.reduce((sum, count) => sum + count, 0)
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0)
    const totalSentences = sentenceCounts.reduce((sum, count) => sum + count, 0)
    const totalParagraphs = paragraphCounts.reduce((sum, count) => sum + count, 0)

    // 統計値の計算
    const sortedCharCounts = [...characterCounts].sort((a, b) => a - b)
    const sortedWordCounts = [...wordCounts].sort((a, b) => a - b)

    const medianCharacters = sortedCharCounts[Math.floor(sortedCharCounts.length / 2)]
    const medianWords = sortedWordCounts[Math.floor(sortedWordCounts.length / 2)]

    // 読みやすさスコア計算
    const avgWordsPerSentence = totalSentences > 0 ? totalWords / totalSentences : 0
    const avgCharsPerWord = totalWords > 0 ? totalCharacters / totalWords : 0
    const readabilityScore = calculateReadabilityScore(avgWordsPerSentence, avgCharsPerWord)

    // 空のレコード数
    const emptyRecords = textData.filter(text => text.trim().length === 0).length

    // ユニークレコード数
    const uniqueTexts = new Set(textData)
    const uniqueRecords = uniqueTexts.size

    return {
      columnName,
      totalRecords,
      totalCharacters,
      totalWords,
      totalSentences,
      totalParagraphs,
      averageCharactersPerRecord: totalCharacters / totalRecords,
      averageWordsPerRecord: totalWords / totalRecords,
      averageSentencesPerRecord: totalSentences / totalRecords,
      averageWordsPerSentence: avgWordsPerSentence,
      medianCharactersPerRecord: medianCharacters,
      medianWordsPerRecord: medianWords,
      minCharacters: Math.min(...characterCounts),
      maxCharacters: Math.max(...characterCounts),
      minWords: Math.min(...wordCounts),
      maxWords: Math.max(...wordCounts),
      emptyRecords,
      emptyPercentage: (emptyRecords / totalRecords) * 100,
      uniqueRecords,
      uniquePercentage: (uniqueRecords / totalRecords) * 100,
      readabilityScore
    }
  } catch (error) {
    console.error('Error calculating text statistics:', error)
    throw error
  }
}

// 単語頻度分析
export async function getWordFrequency(
  tableName: string,
  columnName: string,
  limit: number = 20
): Promise<WordFrequency[]> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    // 全ての単語を抽出
    const allWords: string[] = []
    for (const text of textData) {
      const words = tokenizeText(text.toLowerCase())
      allWords.push(...words)
    }

    // 単語頻度を計算
    const wordCounts = new Map<string, number>()
    for (const word of allWords) {
      if (word.length >= 2) { // 2文字以上の単語のみ
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
      }
    }

    const totalWords = allWords.length
    
    // 頻度順でソート
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({
        word,
        count,
        percentage: (count / totalWords) * 100
      }))
  } catch (error) {
    console.error('Error calculating word frequency:', error)
    throw error
  }
}

// 文字頻度分析
export async function getCharacterFrequency(
  tableName: string,
  columnName: string,
  limit: number = 20
): Promise<CharacterFrequency[]> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    // 全ての文字を抽出（空白と改行を除く）
    const allCharacters: string[] = []
    for (const text of textData) {
      for (const char of text) {
        if (!char.match(/\s/)) {
          allCharacters.push(char)
        }
      }
    }

    // 文字頻度を計算
    const charCounts = new Map<string, number>()
    for (const char of allCharacters) {
      charCounts.set(char, (charCounts.get(char) || 0) + 1)
    }

    const totalCharacters = allCharacters.length
    
    // 頻度順でソート
    return Array.from(charCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([character, count]) => ({
        character,
        count,
        percentage: (count / totalCharacters) * 100
      }))
  } catch (error) {
    console.error('Error calculating character frequency:', error)
    throw error
  }
}

// テキストパターン分析
export async function getTextPatternAnalysis(
  tableName: string,
  columnName: string
): Promise<TextPatternAnalysis> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    const totalRecords = textData.length
    const patterns = []

    // メールアドレスパターン
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    const emailMatches = textData.filter(text => emailPattern.test(text))
    if (emailMatches.length > 0) {
      patterns.push({
        pattern: 'email',
        description: 'メールアドレス',
        count: emailMatches.length,
        percentage: (emailMatches.length / totalRecords) * 100,
        examples: emailMatches.slice(0, 3)
      })
    }

    // URL パターン
    const urlPattern = /https?:\/\/[^\s]+/g
    const urlMatches = textData.filter(text => urlPattern.test(text))
    if (urlMatches.length > 0) {
      patterns.push({
        pattern: 'url',
        description: 'URL',
        count: urlMatches.length,
        percentage: (urlMatches.length / totalRecords) * 100,
        examples: urlMatches.slice(0, 3)
      })
    }

    // 電話番号パターン（日本）
    const phonePattern = /(\d{2,4}-\d{2,4}-\d{4}|\d{10,11})/g
    const phoneMatches = textData.filter(text => phonePattern.test(text))
    if (phoneMatches.length > 0) {
      patterns.push({
        pattern: 'phone',
        description: '電話番号',
        count: phoneMatches.length,
        percentage: (phoneMatches.length / totalRecords) * 100,
        examples: phoneMatches.slice(0, 3)
      })
    }

    // 数字のみ
    const numberOnlyPattern = /^\d+$/
    const numberOnlyMatches = textData.filter(text => numberOnlyPattern.test(text.trim()))
    if (numberOnlyMatches.length > 0) {
      patterns.push({
        pattern: 'number_only',
        description: '数字のみ',
        count: numberOnlyMatches.length,
        percentage: (numberOnlyMatches.length / totalRecords) * 100,
        examples: numberOnlyMatches.slice(0, 3)
      })
    }

    // 日本語のみ
    const japaneseOnlyPattern = /^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]+$/
    const japaneseOnlyMatches = textData.filter(text => japaneseOnlyPattern.test(text))
    if (japaneseOnlyMatches.length > 0) {
      patterns.push({
        pattern: 'japanese_only',
        description: '日本語のみ',
        count: japaneseOnlyMatches.length,
        percentage: (japaneseOnlyMatches.length / totalRecords) * 100,
        examples: japaneseOnlyMatches.slice(0, 3)
      })
    }

    // 英数字のみ
    const alphanumericOnlyPattern = /^[A-Za-z0-9\s]+$/
    const alphanumericOnlyMatches = textData.filter(text => alphanumericOnlyPattern.test(text))
    if (alphanumericOnlyMatches.length > 0) {
      patterns.push({
        pattern: 'alphanumeric_only',
        description: '英数字のみ',
        count: alphanumericOnlyMatches.length,
        percentage: (alphanumericOnlyMatches.length / totalRecords) * 100,
        examples: alphanumericOnlyMatches.slice(0, 3)
      })
    }

    return {
      columnName,
      patterns
    }
  } catch (error) {
    console.error('Error analyzing text patterns:', error)
    throw error
  }
}

// 言語検出分析
export async function getLanguageDetectionAnalysis(
  tableName: string,
  columnName: string
): Promise<LanguageDetection> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    const totalRecords = textData.length
    const totalLength = textData.reduce((sum, text) => sum + text.length, 0)
    const averageLength = totalLength / totalRecords

    // 言語検出
    const languageDetections = new Map<string, { count: number; totalConfidence: number }>()
    
    for (const text of textData) {
      const detection = detectLanguage(text)
      const current = languageDetections.get(detection.language) || { count: 0, totalConfidence: 0 }
      languageDetections.set(detection.language, {
        count: current.count + 1,
        totalConfidence: current.totalConfidence + detection.confidence
      })
    }

    const detectedLanguages = Array.from(languageDetections.entries())
      .map(([language, data]) => ({
        language: language === 'japanese' ? '日本語' :
                 language === 'english' ? '英語' :
                 language === 'mixed' ? '混在' :
                 language === 'other' ? 'その他' : '不明',
        count: data.count,
        percentage: (data.count / totalRecords) * 100,
        confidence: data.totalConfidence / data.count
      }))
      .sort((a, b) => b.count - a.count)

    // 文字種別の分析
    const characterTypes = new Map<string, number>()
    
    for (const text of textData) {
      for (const char of text) {
        const type = getCharacterType(char)
        characterTypes.set(type, (characterTypes.get(type) || 0) + 1)
      }
    }

    const totalCharacters = Array.from(characterTypes.values()).reduce((sum, count) => sum + count, 0)
    
    const languagePatterns = Array.from(characterTypes.entries())
      .map(([pattern, count]) => ({
        pattern: pattern === 'hiragana' ? 'ひらがな' :
                pattern === 'katakana' ? 'カタカナ' :
                pattern === 'kanji' ? '漢字' :
                pattern === 'alphanumeric' ? '英数字' :
                pattern === 'punctuation' ? '記号・句読点' :
                pattern === 'whitespace' ? '空白' : 'その他',
        count,
        percentage: (count / totalCharacters) * 100
      }))
      .sort((a, b) => b.count - a.count)

    return {
      columnName,
      totalRecords,
      averageLength,
      detectedLanguages,
      languagePatterns
    }
  } catch (error) {
    console.error('Error analyzing language detection:', error)
    throw error
  }
}

// 文分析
export async function getSentenceAnalysis(
  tableName: string,
  columnName: string
): Promise<SentenceAnalysis> {
  try {
    const table = memoryDataStore.getTableSchema(tableName)
    if (!table) {
      throw new Error(`Table ${tableName} not found`)
    }

    const textData = table.data
      .map(row => row[columnName])
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value))

    // 全ての文を抽出
    const allSentences: string[] = []
    for (const text of textData) {
      const sentences = splitIntoSentences(text)
      allSentences.push(...sentences)
    }

    const totalSentences = allSentences.length
    if (totalSentences === 0) {
      throw new Error(`No sentences found in column ${columnName}`)
    }

    // 文の長さ分析
    const sentenceLengths = allSentences.map(sentence => tokenizeText(sentence).length)
    const averageSentenceLength = sentenceLengths.reduce((sum, length) => sum + length, 0) / totalSentences

    // 文の長さ分布
    const lengthRanges = [
      { min: 0, max: 5, label: '1-5語' },
      { min: 6, max: 10, label: '6-10語' },
      { min: 11, max: 20, label: '11-20語' },
      { min: 21, max: 30, label: '21-30語' },
      { min: 31, max: Infinity, label: '31語以上' }
    ]

    const sentenceLengthDistribution = lengthRanges.map(range => {
      const count = sentenceLengths.filter(length => length >= range.min && length <= range.max).length
      return {
        range: range.label,
        count,
        percentage: (count / totalSentences) * 100
      }
    })

    // 句読点使用分析
    const punctuationCounts = new Map<string, number>()
    const punctuationList = ['。', '.', '！', '!', '？', '?', '、', ',', '：', ':', '；', ';']
    
    for (const text of textData) {
      for (const punct of punctuationList) {
        const count = (text.match(new RegExp(punct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        punctuationCounts.set(punct, (punctuationCounts.get(punct) || 0) + count)
      }
    }

    const totalPunctuation = Array.from(punctuationCounts.values()).reduce((sum, count) => sum + count, 0)
    const punctuationUsage = Array.from(punctuationCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([punctuation, count]) => ({
        punctuation,
        count,
        percentage: (count / totalPunctuation) * 100
      }))
      .sort((a, b) => b.count - a.count)

    return {
      columnName,
      totalSentences,
      averageSentenceLength,
      sentenceLengthDistribution,
      punctuationUsage
    }
  } catch (error) {
    console.error('Error analyzing sentences:', error)
    throw error
  }
}

// 読みやすさ分析
export async function getReadabilityAnalysis(
  tableName: string,
  columnName: string
): Promise<ReadabilityAnalysis> {
  try {
    const textStats = await getTextStatistics(tableName, columnName)
    
    const complexityLevel = 
      textStats.readabilityScore >= 80 ? '非常に読みやすい' :
      textStats.readabilityScore >= 60 ? '読みやすい' :
      textStats.readabilityScore >= 40 ? '普通' :
      textStats.readabilityScore >= 20 ? '読みにくい' : '非常に読みにくい'

    const recommendations: string[] = []
    
    if (textStats.averageWordsPerSentence > 20) {
      recommendations.push('文をより短くすることを検討してください')
    }
    
    if (textStats.averageWordsPerSentence < 5) {
      recommendations.push('文をもう少し詳しく説明することを検討してください')
    }
    
    const avgCharsPerWord = textStats.totalWords > 0 ? textStats.totalCharacters / textStats.totalWords : 0
    if (avgCharsPerWord > 8) {
      recommendations.push('より簡潔な語彙の使用を検討してください')
    }
    
    if (textStats.readabilityScore < 40) {
      recommendations.push('文章構造の簡素化を検討してください')
    }

    if (recommendations.length === 0) {
      recommendations.push('文章の読みやすさは適切なレベルです')
    }

    return {
      columnName,
      averageWordsPerSentence: textStats.averageWordsPerSentence,
      averageCharactersPerWord: avgCharsPerWord,
      readabilityScore: textStats.readabilityScore,
      complexityLevel,
      recommendations
    }
  } catch (error) {
    console.error('Error analyzing readability:', error)
    throw error
  }
}

// 言語・文字種分析（旧関数名保持のため）
export async function getLanguageAnalysis(
  tableName: string,
  columnName: string
): Promise<LanguageDetection> {
  return await getLanguageDetectionAnalysis(tableName, columnName)
}