// ═══════════════════════════════════════════════════════════════════════════
// Component smoke tests — Card
//
// Tests that the Card component renders children and applies variants/states.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders children text', () => {
    render(<Card>Hello, Card!</Card>)
    expect(screen.getByText('Hello, Card!')).toBeInTheDocument()
  })

  it('renders children elements', () => {
    render(
      <Card>
        <span data-testid="child">Nested</span>
      </Card>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toHaveTextContent('Nested')
  })

  it('applies padding variants', () => {
    const { container: smContainer } = render(<Card padding="sm">Small</Card>)
    expect(smContainer.firstChild).toHaveClass('p-4')

    const { container: mdContainer } = render(<Card padding="md">Medium</Card>)
    expect(mdContainer.firstChild).toHaveClass('p-5')

    const { container: lgContainer } = render(<Card padding="lg">Large</Card>)
    expect(lgContainer.firstChild).toHaveClass('p-6')
  })

  it('applies hoverable class when specified', () => {
    const { container } = render(<Card hoverable>Hover</Card>)
    expect(container.firstChild).toHaveClass('hover:shadow-sm')
  })

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Custom</Card>)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders without children (empty)', () => {
    const { container } = render(<Card>{null}</Card>)
    expect(container.firstChild).toBeInTheDocument()
  })
})
