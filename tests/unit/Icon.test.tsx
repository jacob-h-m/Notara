/**
 * tests/unit/Icon.test.tsx
 * Component tests for the Icon component using React Testing Library.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Icon from '../../src/components/Icon'

describe('Icon', () => {
  it('renders an svg element', () => {
    const { container } = render(<Icon name="save" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('applies aria-hidden by default', () => {
    const { container } = render(<Icon name="undo" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies aria-label when provided', () => {
    const { container } = render(<Icon name="save" aria-label="Save note" aria-hidden={false} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-label', 'Save note')
  })

  it('applies a custom size via width/height attributes', () => {
    const { container } = render(<Icon name="bold" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('passes className to the svg element', () => {
    const { container } = render(<Icon name="graph" className="text-blue-500" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('text-blue-500')
  })

  it('renders different icons without throwing', () => {
    const icons = ['save', 'undo', 'redo', 'bold', 'italic', 'link', 'graph'] as const
    for (const name of icons) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
})
