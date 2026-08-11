import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/GlobeMapExperience', () => ({
  default: ({ theme, viewMode, clusters = [], properties = [] }) => (
    <div data-testid="primary-map" data-theme={theme} data-view-mode={viewMode}>
      <output data-testid="map-clusters">{JSON.stringify(clusters)}</output>
      <output data-testid="map-properties">{JSON.stringify(properties)}</output>
    </div>
  ),
}))

describe('App primary Mapbox shell', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens directly on the operational Mapbox map without a Globe mode', async () => {
    render(<App />)

    expect(await screen.findByTestId('primary-map')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sandbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Real Estate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /globe/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('primary-map')).toHaveAttribute('data-view-mode', 'sandbox')
    expect(screen.getByTestId('primary-map')).toHaveAttribute('data-theme', 'dark')
  })

  it('reveals the toolbar as the cursor approaches and keeps it visible while a panel is open', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toolbar = await screen.findByTestId('app-toolbar')
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({
      bottom: 80,
      height: 64,
      left: 16,
      right: 1000,
      top: 16,
      width: 984,
      x: 16,
      y: 16,
      toJSON: () => ({}),
    })

    expect(toolbar).toHaveClass('app-toolbar--idle')
    fireEvent.mouseMove(window, { clientX: 500, clientY: 145 })
    expect(toolbar).toHaveClass('app-toolbar--engaged')

    fireEvent.mouseMove(window, { clientX: 500, clientY: 300 })
    expect(toolbar).toHaveClass('app-toolbar--idle')

    await user.click(screen.getByRole('button', { name: /Upload & Setup/i }))
    expect(toolbar).toHaveClass('app-toolbar--engaged')
  })

  it('passes uploaded and normalized Sandbox clusters to the same primary map', async () => {
    const user = userEvent.setup()
    const responsePayload = [
      {
        centroidLatitude: 37.98,
        centroidLongitude: 23.72,
        pointCount: 8,
        averageValue: 120,
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(Response.json(responsePayload))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: /Upload & Setup/i }))
    const input = container.querySelector('input[type="file"][accept*="csv"]')
    expect(input).not.toBeNull()
    await user.upload(input, new File(['latitude,longitude,value\n37.98,23.72,120'], 'points.csv', { type: 'text/csv' }))

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('map-clusters').textContent)).toEqual([
        {
          id: 'cluster-0',
          centroidLatitude: 37.98,
          centroidLongitude: 23.72,
          pointCount: 8,
          averageValue: 120,
        },
      ])
    })
    expect(screen.getByTestId('primary-map')).toHaveAttribute('data-view-mode', 'sandbox')
    expect(fetchMock).toHaveBeenCalledWith('/api/geo/upload?radiusMeters=500', expect.objectContaining({ method: 'POST' }))
  })
})
