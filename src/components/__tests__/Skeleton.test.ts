import { describe, it, expect } from 'vitest'
import { Skeleton } from '../Skeleton'

describe('Skeleton', () => {
  it('should export a component', () => {
    expect(Skeleton).toBeDefined()
    expect(typeof Skeleton).toBe('function')
  })
})
