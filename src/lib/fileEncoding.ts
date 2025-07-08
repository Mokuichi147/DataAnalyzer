import * as jschardet from 'jschardet'

// jschardetの型定義
declare module 'jschardet' {
  interface DetectionResult {
    encoding: string | null
    confidence: number
  }
  
  export function detect(buffer: Buffer | Uint8Array): DetectionResult
  export function detectAll(buffer: Buffer | Uint8Array): DetectionResult[]
}

export interface EncodingDetectionResult {
  encoding: string
  confidence: number
  text: string
}

export interface FileEncodingOptions {
  fallbackEncoding?: string
  minConfidence?: number
  supportedEncodings?: string[]
}

/**
 * ブラウザがサポートするエンコーディングを取得
 */
function getBrowserSupportedEncodings(): string[] {
  const testEncodings = [
    'utf-8',
    'shift_jis', 
    'euc-jp',
    'iso-2022-jp',
    'windows-1252',
    'iso-8859-1'
  ]
  
  const supported: string[] = []
  
  for (const encoding of testEncodings) {
    try {
      new TextDecoder(encoding)
      supported.push(encoding)
    } catch (e) {
      // サポートされていないエンコーディングは無視
    }
  }
  
  return supported
}

/**
 * フォールバック用の独自エンコーディング検出
 */
async function fallbackEncodingDetection(uint8Array: Uint8Array): Promise<{ encoding: string | null; confidence: number }> {
  // バイトパターンによる詳細な検出
  
  // UTF-8 BOMチェック
  if (uint8Array.length >= 3 && 
      uint8Array[0] === 0xEF && 
      uint8Array[1] === 0xBB && 
      uint8Array[2] === 0xBF) {
    return { encoding: 'utf-8', confidence: 1.0 }
  }
  
  // 各エンコーディングのスコアを計算
  let shiftJisScore = 0
  let eucJpScore = 0
  let utf8Score = 0
  let asciiCount = 0
  
  const sampleSize = Math.min(uint8Array.length, 2000) // サンプルサイズを増加
  
  for (let i = 0; i < sampleSize - 1; i++) {
    const byte1 = uint8Array[i]
    const byte2 = uint8Array[i + 1]
    
    // ASCII文字
    if (byte1 < 0x80) {
      asciiCount++
      utf8Score++
      continue
    }
    
    // Shift_JISの詳細検出
    if ((byte1 >= 0x81 && byte1 <= 0x9F) || (byte1 >= 0xE0 && byte1 <= 0xFC)) {
      if (byte2 >= 0x40 && byte2 <= 0xFC && byte2 !== 0x7F) {
        shiftJisScore += 2 // より高いスコア
        
        // 日本語の典型的な文字範囲ボーナス
        if (byte1 >= 0x88 && byte1 <= 0x9F) shiftJisScore += 1 // ひらがな
        if (byte1 >= 0x83 && byte1 <= 0x86) shiftJisScore += 1 // カタカナ
        if (byte1 >= 0xE0 && byte1 <= 0xEA) shiftJisScore += 1 // 漢字
      }
    }
    
    // EUC-JPの検出
    if (byte1 >= 0xA1 && byte1 <= 0xFE && byte2 >= 0xA1 && byte2 <= 0xFE) {
      eucJpScore += 2
    }
    
    // UTF-8の厳密な検証
    if ((byte1 & 0xE0) === 0xC0 && (byte2 & 0xC0) === 0x80) {
      utf8Score += 2 // 2バイト文字
    } else if (i < sampleSize - 2) {
      const byte3 = uint8Array[i + 2]
      if ((byte1 & 0xF0) === 0xE0 && (byte2 & 0xC0) === 0x80 && (byte3 & 0xC0) === 0x80) {
        utf8Score += 3 // 3バイト文字
        i++ // 次のバイトをスキップ
      }
    }
  }
  
  // スコアの正規化
  const totalBytes = sampleSize
  shiftJisScore = shiftJisScore / totalBytes
  eucJpScore = eucJpScore / totalBytes
  utf8Score = utf8Score / totalBytes
  
  console.log('🔍 検出スコア:', {
    shiftJis: shiftJisScore.toFixed(3),
    eucJp: eucJpScore.toFixed(3),
    utf8: utf8Score.toFixed(3),
    ascii: (asciiCount / totalBytes).toFixed(3)
  })
  
  // 閾値による判定
  if (shiftJisScore > 0.1 && shiftJisScore > eucJpScore && shiftJisScore > utf8Score * 0.8) {
    return { encoding: 'shift_jis', confidence: Math.min(shiftJisScore * 2, 0.95) }
  } else if (eucJpScore > 0.1 && eucJpScore > shiftJisScore && eucJpScore > utf8Score * 0.8) {
    return { encoding: 'euc-jp', confidence: Math.min(eucJpScore * 2, 0.95) }
  } else if (utf8Score > 0.3 || asciiCount / totalBytes > 0.8) {
    return { encoding: 'utf-8', confidence: Math.min(utf8Score + (asciiCount / totalBytes) * 0.5, 0.95) }
  }
  
  return { encoding: null, confidence: 0 }
}

/**
 * ファイルのエンコーディングを検出してテキストを読み取る
 */
export async function detectFileEncoding(
  file: File, 
  options: FileEncodingOptions = {}
): Promise<EncodingDetectionResult> {
  const {
    fallbackEncoding = 'utf-8',
    minConfidence = 0.3,
    supportedEncodings = getBrowserSupportedEncodings()
  } = options

  try {
    // ファイルをArrayBufferとして読み込み
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // エンコーディングを検出 (独自検出を優先)
    let detection: { encoding: string | null; confidence: number }
    
    // まず独自検出を試行
    detection = await fallbackEncodingDetection(uint8Array)
    console.log('🔍 独自検出結果:', detection)
    
    // 独自検出で判定できない場合のみjschardetを使用
    if (!detection.encoding || detection.confidence < 0.3) {
      try {
        const jschardetResult = jschardet.detect(uint8Array)
        if (jschardetResult.encoding && jschardetResult.confidence > detection.confidence) {
          detection = jschardetResult
          console.log('🔍 jschardet検出結果:', {
            detected: detection.encoding,
            confidence: detection.confidence,
            fileSize: file.size,
            fileName: file.name
          })
        }
      } catch (jschardetError) {
        console.warn('⚠️ jschardet検出エラー:', jschardetError)
        // 独自検出の結果を使用
      }
    }
    
    let selectedEncoding = fallbackEncoding
    let confidence = 0
    
    if (detection.encoding && detection.confidence >= minConfidence) {
      // 検出されたエンコーディングを正規化
      const normalizedEncoding = normalizeEncoding(detection.encoding)
      
      // サポートされているエンコーディングかチェック
      if (supportedEncodings.includes(normalizedEncoding)) {
        selectedEncoding = normalizedEncoding
        confidence = detection.confidence
      } else {
        console.warn(`⚠️ 検出されたエンコーディング "${normalizedEncoding}" はサポートされていません。${fallbackEncoding}を使用します。`)
      }
    } else {
      console.warn(`⚠️ エンコーディング検出の信頼度が低い (${detection.confidence}). ${fallbackEncoding}を使用します。`)
    }
    
    // テキストを変換（ブラウザ互換性を重視）
    let text: string
    
    try {
      // ブラウザのTextDecoderを使用（対応している場合）
      const decoder = new TextDecoder(normalizeEncodingForTextDecoder(selectedEncoding))
      text = decoder.decode(uint8Array)
    } catch (decoderError) {
      console.warn(`⚠️ TextDecoderでエンコーディング "${selectedEncoding}" がサポートされていません。UTF-8を使用します。`)
      // フォールバック: UTF-8として処理
      text = new TextDecoder('utf-8').decode(uint8Array)
      selectedEncoding = 'utf-8'
      confidence = 0
    }
    
    // 変換結果を検証
    if (text.length === 0) {
      throw new Error('ファイルが空か、エンコーディング変換に失敗しました')
    }
    
    // 文字化けの可能性をチェック
    const corruptionScore = checkTextCorruption(text)
    if (corruptionScore > 0.3) {
      console.warn(`⚠️ 文字化けの可能性があります (スコア: ${corruptionScore.toFixed(2)})`)
      
      // 別のエンコーディングを試行
      const alternativeResult = await tryAlternativeEncodings(uint8Array, supportedEncodings, selectedEncoding)
      if (alternativeResult) {
        return alternativeResult
      }
    }
    
    // 最終的にShift_JISの特別チェック
    if (selectedEncoding === 'utf-8' && containsJapaneseCharacters(text)) {
      console.log('🔍 日本語文字を検出。Shift_JISかどうか再確認中...')
      const shiftJisResult = await trySpecificEncoding(uint8Array, 'shift_jis')
      if (shiftJisResult && checkTextCorruption(shiftJisResult.text) < corruptionScore) {
        console.log('✅ Shift_JISで読み込み直しました')
        return shiftJisResult
      }
    }
    
    return {
      encoding: selectedEncoding,
      confidence,
      text
    }
    
  } catch (error) {
    console.error('エンコーディング検出エラー:', error)
    
    // フォールバック: 標準のFile.text()を使用
    try {
      const text = await file.text()
      return {
        encoding: 'utf-8',
        confidence: 0,
        text
      }
    } catch (fallbackError) {
      throw new Error(`ファイル読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * エンコーディング名を正規化
 */
function normalizeEncoding(encoding: string): string {
  const normalized = encoding.toLowerCase().replace(/[_-]/g, '')
  
  const encodingMap: Record<string, string> = {
    'shiftjis': 'shift_jis',
    'sjis': 'shift_jis',
    'eucjp': 'euc-jp',
    'iso2022jp': 'iso-2022-jp',
    'jis': 'iso-2022-jp',
    'utf8': 'utf-8',
    'cp932': 'shift_jis',
    'windows31j': 'shift_jis',
    'windows1252': 'windows-1252'
  }
  
  return encodingMap[normalized] || encoding
}

/**
 * TextDecoder用にエンコーディング名を正規化
 */
function normalizeEncodingForTextDecoder(encoding: string): string {
  const textDecoderMap: Record<string, string> = {
    'shift_jis': 'shift_jis',
    'euc-jp': 'euc-jp',
    'iso-2022-jp': 'iso-2022-jp',
    'windows-1252': 'windows-1252',
    'utf-8': 'utf-8'
  }
  
  return textDecoderMap[encoding] || 'utf-8'
}

/**
 * テキストの文字化けをチェック
 */
function checkTextCorruption(text: string): number {
  if (text.length === 0) return 1
  
  let corruptionScore = 0
  const sampleSize = Math.min(1000, text.length)
  const sample = text.substring(0, sampleSize)
  
  // 文字化けの兆候をチェック
  const replacementCharCount = (sample.match(/�/g) || []).length
  const controlCharCount = (sample.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g) || []).length
  const suspiciousCharCount = (sample.match(/[¿¡]/g) || []).length
  
  corruptionScore += replacementCharCount / sampleSize
  corruptionScore += controlCharCount / sampleSize * 0.5
  corruptionScore += suspiciousCharCount / sampleSize * 0.3
  
  return corruptionScore
}

/**
 * 代替エンコーディングを試行
 */
async function tryAlternativeEncodings(
  uint8Array: Uint8Array, 
  supportedEncodings: string[], 
  currentEncoding: string
): Promise<EncodingDetectionResult | null> {
  const alternatives = supportedEncodings.filter(enc => enc !== currentEncoding)
  
  for (const encoding of alternatives) {
    try {
      let text: string
      
      try {
        const decoder = new TextDecoder(normalizeEncodingForTextDecoder(encoding))
        text = decoder.decode(uint8Array)
      } catch (decoderError) {
        // TextDecoderが対応していない場合はスキップ
        continue
      }
      
      const corruptionScore = checkTextCorruption(text)
      if (corruptionScore < 0.1) {
        console.log(`✅ 代替エンコーディング "${encoding}" で良好な結果`)
        return {
          encoding,
          confidence: 0.8,
          text
        }
      }
    } catch (error) {
      console.warn(`代替エンコーディング "${encoding}" でエラー:`, error)
    }
  }
  
  return null
}

/**
 * 日本語文字が含まれているかチェック
 */
function containsJapaneseCharacters(text: string): boolean {
  // ひらがな、カタカナ、漢字の範囲をチェック
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/
  return japaneseRegex.test(text)
}

/**
 * 特定のエンコーディングでテキストを試行
 */
async function trySpecificEncoding(uint8Array: Uint8Array, encoding: string): Promise<EncodingDetectionResult | null> {
  try {
    const decoder = new TextDecoder(normalizeEncodingForTextDecoder(encoding))
    const text = decoder.decode(uint8Array)
    
    return {
      encoding,
      confidence: 0.8,
      text
    }
  } catch (error) {
    console.warn(`特定エンコーディング "${encoding}" でエラー:`, error)
    return null
  }
}

/**
 * サポートされているエンコーディングの一覧を取得
 */
export function getSupportedEncodings(): string[] {
  return [
    'utf-8',
    'shift_jis',
    'euc-jp', 
    'iso-2022-jp',
    'windows-1252',
    'iso-8859-1'
  ]
}

/**
 * エンコーディングの説明を取得
 */
export function getEncodingDescription(encoding: string): string {
  const descriptions: Record<string, string> = {
    'utf-8': 'UTF-8 (Unicode)',
    'shift_jis': 'Shift_JIS (日本語)',
    'euc-jp': 'EUC-JP (日本語)',
    'iso-2022-jp': 'ISO-2022-JP (日本語)',
    'windows-1252': 'Windows-1252 (西欧)',
    'iso-8859-1': 'ISO-8859-1 (Latin-1)'
  }
  
  return descriptions[encoding] || encoding
}