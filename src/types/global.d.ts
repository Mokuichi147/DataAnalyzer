interface Window {
  addEventListener(
    type: 'dataChanged',
    listener: (event: CustomEvent<{ tableName: string; changeType: string; count: number }>) => void
  ): void
  removeEventListener(
    type: 'dataChanged', 
    listener: (event: CustomEvent<{ tableName: string; changeType: string; count: number }>) => void
  ): void
}