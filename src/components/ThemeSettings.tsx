import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export function ThemeSettings() {
  const { theme, setTheme } = useTheme()

  const themeOptions = [
    {
      value: 'light' as const,
      label: 'ライト',
      description: '明るいテーマ',
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: 'ダーク',
      description: '暗いテーマ',
      icon: Moon,
    },
    {
      value: 'system' as const,
      label: 'システム',
      description: 'システム設定に従う',
      icon: Monitor,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">外観テーマ</h3>
        <div className="grid gap-3">
          {themeOptions.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`relative flex items-center p-4 rounded-lg border-2 transition-all ${
                  theme === option.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <Icon className={`h-5 w-5 mr-3 ${
                  theme === option.value 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-gray-500 dark:text-gray-400'
                }`} />
                <div className="flex-1 text-left">
                  <div className={`font-medium ${
                    theme === option.value
                      ? 'text-blue-900 dark:text-blue-100'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {option.label}
                  </div>
                  <div className={`text-sm ${
                    theme === option.value
                      ? 'text-blue-700 dark:text-blue-200'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {option.description}
                  </div>
                </div>
                {theme === option.value && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}