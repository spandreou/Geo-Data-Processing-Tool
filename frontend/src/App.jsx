import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, LoaderCircle, Moon, Sun, SlidersHorizontal, Home, Search, BarChart3 } from 'lucide-react'
import GlobeMapExperience from './components/GlobeMapExperience'
import { PriceTrendChart } from './components/PriceTrendChart'

const OUTLIER_DISTANCE_METERS = 1500

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusMeters = 6371000

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusMeters * c
}

function normalizeClusters(payload) {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((cluster, index) => {
      const centroidLatitude = Number(cluster?.centroidLatitude)
      const centroidLongitude = Number(cluster?.centroidLongitude)
      const pointCount = Number(cluster?.pointCount)
      const averageValue = Number(cluster?.averageValue)

      return {
        id: `cluster-${index}`,
        centroidLatitude,
        centroidLongitude,
        pointCount,
        averageValue,
      }
    })
    .filter(
      (cluster) =>
        Number.isFinite(cluster.centroidLatitude) &&
        Number.isFinite(cluster.centroidLongitude) &&
        Number.isFinite(cluster.pointCount) &&
        Number.isFinite(cluster.averageValue),
    )
}

function App() {
  const inputRef = useRef(null)
  const currentFileRef = useRef(null)
  const toolbarRef = useRef(null)
  const [clusters, setClusters] = useState([])
  const [selectedClusterId, setSelectedClusterId] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('geo-theme') || 'dark')
  const [radiusMeters, setRadiusMeters] = useState(500)
  const [currentFile, setCurrentFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState(null) // 'setup' | 'analytics' | null
  const [isToolbarNearby, setIsToolbarNearby] = useState(false)

  // Real Estate Market integration state
  const [activeTab, setActiveTab] = useState('sandbox') // 'sandbox' | 'market'
  const [properties, setProperties] = useState([])
  const [selectedPropertyId, setSelectedPropertyId] = useState(null)

  const isRentalMode = useMemo(() => {
    if (properties.length === 0) return false
    const smallSizeCount = properties.filter((p) => p.sqm <= 15).length
    return smallSizeCount > properties.length / 2
  }, [properties])

  const areas = useMemo(() => {
    const unique = new Set(properties.map(p => p.area))
    return Array.from(unique).sort()
  }, [properties])

  const [marketFilters, setMarketFilters] = useState({
    area: 'All Areas',
    minPrice: '',
    maxPrice: '',
    minSqm: '',
    maxSqm: '',
  })
  const [isMarketLoading, setIsMarketLoading] = useState(false)
  const [marketSearchTerm, setMarketSearchTerm] = useState('')
  const marketInputRef = useRef(null)
  const [marketFile, setMarketFile] = useState(null)
  const [isMarketDragging, setIsMarketDragging] = useState(false)
  const [marketErrorMessage, setMarketErrorMessage] = useState('')

  const uploadAndParseMarket = async (file) => {
    setIsMarketLoading(true)
    setMarketErrorMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/realestate/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let message = 'Upload failed.'
        try {
          const payload = await response.json()
          message = payload?.message ?? message
        } catch {
          // Keep the generic upload message when the server response is not JSON.
        }
        throw new Error(message)
      }

      const data = await response.json()
      setProperties(data)
      if (data.length > 0) {
        setSelectedPropertyId(data[0].id)
      } else {
        setSelectedPropertyId(null)
      }
    } catch (error) {
      setProperties([])
      setSelectedPropertyId(null)
      setMarketErrorMessage(error instanceof Error ? error.message : 'Unexpected upload error.')
    } finally {
      setIsMarketLoading(false)
    }
  }

  const visibleProperties = useMemo(() => {
    if (activeTab !== 'market') return []
    return properties.filter((p) => {
      // Search term
      const term = marketSearchTerm.trim().toLowerCase()
      if (term) {
        const matches =
          p.title.toLowerCase().includes(term) ||
          p.address.toLowerCase().includes(term) ||
          p.area.toLowerCase().includes(term)
        if (!matches) return false
      }

      // Region/Area filter
      if (marketFilters.area && marketFilters.area !== 'All Areas') {
        if (p.area !== marketFilters.area) return false
      }

      // Price ranges
      if (marketFilters.minPrice) {
        const minVal = parseFloat(marketFilters.minPrice)
        if (Number.isFinite(minVal) && p.price < minVal) return false
      }
      if (marketFilters.maxPrice) {
        const maxVal = parseFloat(marketFilters.maxPrice)
        if (Number.isFinite(maxVal) && p.price > maxVal) return false
      }

      // Sqm ranges
      if (marketFilters.minSqm) {
        const minSqm = parseFloat(marketFilters.minSqm)
        if (Number.isFinite(minSqm) && p.sqm < minSqm) return false
      }
      if (marketFilters.maxSqm) {
        const maxSqm = parseFloat(marketFilters.maxSqm)
        if (Number.isFinite(maxSqm) && p.sqm > maxSqm) return false
      }

      return true
    })
  }, [properties, marketSearchTerm, marketFilters, activeTab])

  const marketMetrics = useMemo(() => {
    if (visibleProperties.length === 0) {
      return {
        avgPrice: 0,
        avgPricePerSqm: 0,
        listingsCount: 0,
        outliersCount: 0,
      }
    }

    const totalPrice = visibleProperties.reduce((sum, p) => sum + p.price, 0)
    const totalPricePerSqm = visibleProperties.reduce((sum, p) => sum + (p.price / p.sqm), 0)
    const outliersCount = visibleProperties.filter((p) => p.isOutlier).length

    return {
      avgPrice: Math.round(totalPrice / visibleProperties.length),
      avgPricePerSqm: Math.round(totalPricePerSqm / visibleProperties.length),
      listingsCount: visibleProperties.length,
      outliersCount,
    }
  }, [visibleProperties])

  const isDark = theme === 'dark'
  const isToolbarEngaged = isToolbarNearby || Boolean(activeDropdown)

  useEffect(() => {
    localStorage.setItem('geo-theme', theme)
  }, [theme])

  useEffect(() => {
    const proximityPixels = 72

    const handleMouseMove = (event) => {
      const toolbar = toolbarRef.current
      if (!toolbar) return

      const bounds = toolbar.getBoundingClientRect()
      const isNearby =
        event.clientX >= bounds.left - proximityPixels &&
        event.clientX <= bounds.right + proximityPixels &&
        event.clientY >= bounds.top - proximityPixels &&
        event.clientY <= bounds.bottom + proximityPixels

      setIsToolbarNearby((current) => (current === isNearby ? current : isNearby))
    }

    const handleWindowBlur = () => setIsToolbarNearby(false)

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  useEffect(() => {
    currentFileRef.current = currentFile
  }, [currentFile])

  // Debounced auto-clustering when radius changes
  useEffect(() => {
    const file = currentFileRef.current
    if (!file) return

    const delayDebounceFn = setTimeout(() => {
      uploadAndCluster(file, radiusMeters)
    }, 450)

    return () => clearTimeout(delayDebounceFn)
  }, [radiusMeters])

  const analytics = useMemo(() => {
    const totalPoints = clusters.reduce((sum, cluster) => sum + cluster.pointCount, 0)
    const clusterCount = clusters.length

    if (clusterCount < 2) {
      return {
        totalPoints,
        clusterCount,
        outlierPoints: 0,
        outlierClusterIds: [],
        outlierMessage:
          clusterCount === 0
            ? 'Upload a CSV file to view analytics.'
            : 'Not enough clusters to evaluate outliers.',
      }
    }

    const outlierClusterIds = []

    for (const cluster of clusters) {
      if (cluster.pointCount !== 1) {
        continue
      }

      let nearestDistance = Number.POSITIVE_INFINITY

      for (const otherCluster of clusters) {
        if (cluster.id === otherCluster.id) {
          continue
        }

        const distance = haversineDistanceMeters(
          cluster.centroidLatitude,
          cluster.centroidLongitude,
          otherCluster.centroidLatitude,
          otherCluster.centroidLongitude,
        )

        if (distance < nearestDistance) {
          nearestDistance = distance
        }
      }

      if (nearestDistance > OUTLIER_DISTANCE_METERS) {
        outlierClusterIds.push(cluster.id)
      }
    }

    const outlierPoints = clusters
      .filter((cluster) => outlierClusterIds.includes(cluster.id))
      .reduce((sum, cluster) => sum + cluster.pointCount, 0)

    const outlierMessage =
      outlierPoints > 0
        ? `Detected ${outlierPoints} possible outlier point(s) farther than ${OUTLIER_DISTANCE_METERS}m from the nearest cluster.`
        : 'No outliers detected.'

    return {
      totalPoints,
      clusterCount,
      outlierPoints,
      outlierClusterIds,
      outlierMessage,
    }
  }, [clusters])

  const uploadAndCluster = async (file, radius) => {
    setIsUploading(true)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/geo/upload?radiusMeters=${radius}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let message = 'Upload failed.'
        try {
          const payload = await response.json()
          message = payload?.message ?? message
        } catch {
          // Keep generic message when server response is not JSON.
        }
        throw new Error(message)
      }

      const payload = await response.json()
      const normalized = normalizeClusters(payload)
      setClusters(normalized)
      setSelectedClusterId(normalized[0]?.id ?? null)
    } catch (error) {
      setClusters([])
      setSelectedClusterId(null)
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected upload error.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleUploadClick = () => {
    inputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setCurrentFile(file)
    await uploadAndCluster(file, radiusMeters)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        setCurrentFile(file)
        await uploadAndCluster(file, radiusMeters)
      } else {
        setErrorMessage('Please drop a valid CSV file.')
      }
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      className={`app-shell h-screen w-screen overflow-hidden relative ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* Background Click Overlay to close dropdowns */}
      {activeDropdown && (
        <div
          className="fixed inset-0 z-10"
          onMouseDown={() => setActiveDropdown(null)}
        />
      )}

      {/* Top Navbar */}
      <header
        ref={toolbarRef}
        data-testid="app-toolbar"
        data-theme={theme}
        className={`app-toolbar ${isToolbarEngaged ? 'app-toolbar--engaged' : 'app-toolbar--idle'} absolute top-4 left-4 right-4 h-16 rounded-2xl border shadow-lg z-20 flex items-center justify-between px-6 backdrop-blur-md transition-all duration-300 ${
        isDark
          ? 'border-slate-800 bg-slate-900/90 text-white shadow-slate-950/20'
          : 'border-slate-200 bg-white/90 text-slate-900 shadow-slate-200/20'
      }`}
      >
        <div className="app-toolbar__identity flex min-w-0 items-center gap-3">
          <h1 className="app-toolbar__title text-base font-bold tracking-tight bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
            Geo Processing
          </h1>

          {/* Tab switcher */}
          <div className="app-mode-switcher flex items-center gap-1 bg-slate-800/10 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/10 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('sandbox')
                setActiveDropdown(null)
              }}
              className={`px-2.5 py-1 rounded-md font-bold transition duration-200 ${
                activeTab === 'sandbox'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Sandbox
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('market')
                setActiveDropdown(null)
              }}
              className={`px-2.5 py-1 rounded-md font-bold transition duration-200 ${
                activeTab === 'market'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Real Estate
            </button>
          </div>

          {activeTab === 'sandbox' && currentFile && (
            <span className="hidden md:inline-block px-2 py-0.5 bg-blue-500/10 rounded text-[10px] font-semibold text-blue-500 truncate max-w-[150px]" title={currentFile.name}>
              {currentFile.name}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="app-toolbar__actions flex items-center gap-2">
          {/* Light/Dark Toggle */}
          <button
            type="button"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            className={`app-toolbar__icon-button inline-flex items-center justify-center p-2 rounded-xl border transition ${
              isDark
                ? 'border-slate-800 bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Setup / Filters Trigger */}
          <button
            type="button"
            aria-label={activeTab === 'market' ? 'Market Filters' : 'Upload & Setup'}
            title={activeTab === 'market' ? 'Market Filters' : 'Upload & Setup'}
            onClick={() => setActiveDropdown((curr) => (curr === 'setup' ? null : 'setup'))}
            className={`app-toolbar__action inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              activeDropdown === 'setup'
                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                : isDark
                  ? 'border-slate-800 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {activeTab === 'market' ? (
              <>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="app-toolbar__action-label">Market Filters</span>
              </>
            ) : (
              <>
                <FileUp className="h-3.5 w-3.5" />
                <span className="app-toolbar__action-label">Upload & Setup</span>
              </>
            )}
          </button>

          {/* Analytics / Listings Trigger */}
          <button
            type="button"
            aria-label={activeTab === 'market' ? 'Listings & KPIs' : 'Analytics & Clusters'}
            title={activeTab === 'market' ? 'Listings & KPIs' : 'Analytics & Clusters'}
            onClick={() => setActiveDropdown((curr) => (curr === 'analytics' ? null : 'analytics'))}
            className={`app-toolbar__action relative inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              activeDropdown === 'analytics'
                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                : isDark
                  ? 'border-slate-800 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="app-toolbar__status-indicator relative flex h-2 w-2 mr-0.5">
              {((activeTab === 'sandbox' && clusters.length > 0) || (activeTab === 'market' && properties.length > 0)) && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                ((activeTab === 'sandbox' && clusters.length > 0) || (activeTab === 'market' && properties.length > 0)) ? 'bg-blue-500' : 'bg-slate-400'
              }`}></span>
            </span>
            {activeTab === 'market' ? (
              <span className="app-toolbar__action-label">Listings & KPIs</span>
            ) : (
              <span className="app-toolbar__action-label">Analytics & Clusters</span>
            )}
          </button>
        </div>
      </header>

      {/* Map Viewport - Full Screen Background */}
      <main className="absolute inset-0 w-full h-full z-0">
        <GlobeMapExperience
          theme={theme}
          viewMode={activeTab}
          clusters={clusters}
          outlierClusterIds={analytics.outlierClusterIds}
          selectedClusterId={selectedClusterId}
          onSelectCluster={setSelectedClusterId}
          properties={visibleProperties}
          selectedPropertyId={selectedPropertyId}
          onSelectProperty={setSelectedPropertyId}
          controlsObscured={Boolean(activeDropdown)}
        />
      </main>

      {/* Floating Dropdown 1: Setup & Upload OR Real Estate Filters */}
      {activeDropdown === 'setup' && (
        <div
          className={`app-floating-panel app-floating-panel--setup absolute top-24 right-4 md:right-48 w-[320px] rounded-2xl border shadow-2xl p-5 z-20 transition-all duration-200 flex flex-col ${
            isDark
              ? 'border-slate-800 bg-slate-900/95 text-slate-100 shadow-slate-950/80'
              : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-200/80'
          }`}
        >
          {activeTab === 'market' ? (
            <>
              <h3 className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">Real Estate Setup</h3>
              <p className={`mt-2 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Upload a CSV file of property listings to analyze values and map outliers.
              </p>

              {/* Drag and drop real estate upload zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsMarketDragging(true)
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsMarketDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsMarketDragging(false)
                }}
                onDrop={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsMarketDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) {
                    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
                      setMarketFile(file)
                      await uploadAndParseMarket(file)
                    } else {
                      setMarketErrorMessage('Please drop a valid CSV file.')
                    }
                  }
                }}
                onClick={() => marketInputRef.current?.click()}
                className={`mt-4 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isMarketDragging
                    ? 'border-blue-500 bg-blue-500/10 scale-[0.98]'
                    : isDark
                      ? 'border-slate-700 hover:border-slate-500 bg-slate-800/30 hover:bg-slate-800/50'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {isMarketLoading ? (
                  <LoaderCircle className="h-8 w-8 text-blue-500 animate-spin" />
                ) : (
                  <FileUp className={`h-8 w-8 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                )}
                <span className="mt-2 text-sm font-semibold">
                  {isMarketLoading ? 'Uploading listings...' : 'Drag & Drop CSV'}
                </span>
                <span className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  or click to upload
                </span>
                {marketFile && (
                  <div className="mt-3 px-2 py-1 bg-blue-500/10 rounded text-xs font-semibold text-blue-500 truncate max-w-full">
                    {marketFile.name}
                  </div>
                )}
              </div>

              <input
                ref={marketInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) {
                    setMarketFile(file)
                    await uploadAndParseMarket(file)
                  }
                }}
              />

              {marketErrorMessage && (
                <p className="mt-3 rounded-lg border border-red-200/50 bg-red-500/10 p-3 text-xs text-red-500 font-medium">
                  {marketErrorMessage}
                </p>
              )}

              {properties.length > 0 && (
                <div className="mt-4 space-y-3 pt-4 border-t border-slate-200/30 dark:border-slate-800/30">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Filters</h4>

                  {/* Area Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Area / Region</label>
                    <select
                      value={marketFilters.area}
                      onChange={(e) => setMarketFilters((prev) => ({ ...prev, area: e.target.value }))}
                      className={`text-xs rounded-xl border p-2.5 outline-none font-medium transition ${
                        isDark
                          ? 'border-slate-800 bg-slate-800/80 hover:bg-slate-800 text-white focus:border-blue-500'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 focus:border-blue-500'
                      }`}
                    >
                      <option value="All Areas">All Areas</option>
                      {areas.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>

                  {/* Price range inputs */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Min Price</label>
                      <input
                        type="number"
                        placeholder="Min"
                        value={marketFilters.minPrice}
                        onChange={(e) => setMarketFilters((prev) => ({ ...prev, minPrice: e.target.value }))}
                        className={`text-xs rounded-xl border p-2.5 outline-none font-medium transition ${
                          isDark
                            ? 'border-slate-800 bg-slate-800/80 text-white focus:border-blue-500'
                            : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Price</label>
                      <input
                        type="number"
                        placeholder="Max"
                        value={marketFilters.maxPrice}
                        onChange={(e) => setMarketFilters((prev) => ({ ...prev, maxPrice: e.target.value }))}
                        className={`text-xs rounded-xl border p-2.5 outline-none font-medium transition ${
                          isDark
                            ? 'border-slate-800 bg-slate-800/80 text-white focus:border-blue-500'
                            : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Sqm range inputs */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Min Size ({isRentalMode ? 'units' : 'sqm'})</label>
                      <input
                        type="number"
                        placeholder="Min"
                        value={marketFilters.minSqm}
                        onChange={(e) => setMarketFilters((prev) => ({ ...prev, minSqm: e.target.value }))}
                        className={`text-xs rounded-xl border p-2.5 outline-none font-medium transition ${
                          isDark
                            ? 'border-slate-800 bg-slate-800/80 text-white focus:border-blue-500'
                            : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Max Size ({isRentalMode ? 'units' : 'sqm'})</label>
                      <input
                        type="number"
                        placeholder="Max"
                        value={marketFilters.maxSqm}
                        onChange={(e) => setMarketFilters((prev) => ({ ...prev, maxSqm: e.target.value }))}
                        className={`text-xs rounded-xl border p-2.5 outline-none font-medium transition ${
                          isDark
                            ? 'border-slate-800 bg-slate-800/80 text-white focus:border-blue-500'
                            : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Reset Filters Button */}
                  <button
                    type="button"
                    onClick={() => setMarketFilters({ area: 'All Areas', minPrice: '', maxPrice: '', minSqm: '', maxSqm: '' })}
                    className={`mt-2 w-full py-2.5 rounded-xl border text-xs font-semibold transition duration-200 ${
                      isDark
                        ? 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-300'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    Reset All Filters
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">CSV Data Upload</h3>
              <p className={`mt-2 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Upload geospatial CSV files, run clustering and visualize analytics instantly.
              </p>

              {/* Drag and drop upload zone */}
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleUploadClick}
                className={`mt-4 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10 scale-[0.98]'
                    : isDark
                      ? 'border-slate-700 hover:border-slate-500 bg-slate-800/30 hover:bg-slate-800/50'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {isUploading ? (
                  <LoaderCircle className="h-8 w-8 text-blue-500 animate-spin" />
                ) : (
                  <FileUp className={`h-8 w-8 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                )}
                <span className="mt-2 text-sm font-semibold">
                  {isUploading ? 'Clustering points...' : 'Drag & Drop CSV'}
                </span>
                <span className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  or click to upload
                </span>
                {currentFile && (
                  <div className="mt-3 px-2 py-1 bg-blue-500/10 rounded text-xs font-semibold text-blue-500 truncate max-w-full">
                    {currentFile.name}
                  </div>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Dynamic Radius Slider */}
              <div className="mt-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-4">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Cluster Radius</span>
                  <span className="text-blue-500 font-bold">{radiusMeters}m</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="3000"
                  step="50"
                  value={radiusMeters}
                  onChange={(e) => setRadiusMeters(Number(e.target.value))}
                  disabled={isUploading}
                  className="mt-2.5 w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>100m</span>
                  <span>1.5km</span>
                  <span>3km</span>
                </div>
              </div>

              {errorMessage && (
                <p className="mt-4 rounded-lg border border-red-200/50 bg-red-500/10 p-3 text-xs text-red-500 font-medium">
                  {errorMessage}
                </p>
              )}

              <div className="mt-4 pt-4 text-[10px] text-slate-500 border-t border-slate-200/50 dark:border-slate-800/50">
                CSV Columns accepted: <code className="bg-slate-800/10 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">lat/latitude/y</code>, <code className="bg-slate-800/10 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">lon/longitude/x</code>, <code className="bg-slate-800/10 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">value/price/amount/cost</code>, and optional <code className="bg-slate-800/10 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">size/sqm/bedrooms/beds/accommodates</code>.
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Dropdown 2: Analytics & Clusters / Listings & KPIs */}
      {activeDropdown === 'analytics' && (
        <div
          className={`app-floating-panel app-floating-panel--analytics absolute top-24 right-4 w-[380px] max-h-[calc(100vh-110px)] rounded-2xl border shadow-2xl p-5 z-20 transition-all duration-200 flex flex-col ${
            isDark
              ? 'border-slate-800 bg-slate-900/95 text-slate-100 shadow-slate-950/80'
              : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-200/80'
          }`}
        >
          {activeTab === 'market' ? (
            <div className="flex flex-col h-full overflow-hidden">
              <h3 className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
                <Home className="h-4 w-4 text-blue-500" />
                Listings & KPIs
              </h3>

              {properties.length === 0 ? (
                <div className={`mt-4 rounded-xl border border-dashed p-8 text-center text-xs ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
                  Please upload a Real Estate CSV file under the "Real Estate Setup" menu to view listings and metrics.
                </div>
              ) : (
                <>
                  {/* Real Estate KPIs */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                      <p className="text-[10px] text-slate-500 font-medium">Total Listings</p>
                      <p className={`mt-0.5 text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {marketMetrics.listingsCount}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                      <p className="text-[10px] text-slate-500 font-medium">Outliers</p>
                      <p className={`mt-0.5 text-sm font-bold ${marketMetrics.outliersCount > 0 ? 'text-red-500' : isDark ? 'text-white' : 'text-slate-900'}`}>
                        {marketMetrics.outliersCount}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                      <p className="text-[10px] text-slate-500 font-medium">Avg Price</p>
                      <p className={`mt-0.5 text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        €{marketMetrics.avgPrice.toLocaleString()}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                      <p className="text-[10px] text-slate-500 font-medium">Avg Price / {isRentalMode ? 'unit' : 'sqm'}</p>
                      <p className={`mt-0.5 text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        €{marketMetrics.avgPricePerSqm.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Property Search */}
                  <div className="mt-3 relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search properties by title..."
                      value={marketSearchTerm}
                      onChange={(e) => setMarketSearchTerm(e.target.value)}
                      className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border outline-none font-medium transition ${
                        isDark
                          ? 'border-slate-800 bg-slate-800/80 text-white focus:border-blue-500'
                          : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  {/* Property listings list */}
                  <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 max-h-[300px]">
                    {visibleProperties.length === 0 ? (
                      <div className={`rounded-xl border border-dashed p-8 text-center text-xs ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
                        {isMarketLoading ? 'Loading listings...' : 'No properties found matching your filters.'}
                      </div>
                    ) : (
                      visibleProperties.map((p) => {
                        const isSelected = p.id === selectedPropertyId
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPropertyId(p.id)}
                            className={`block w-full rounded-xl border p-3 text-left text-xs transition duration-200 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
                                : isDark
                                  ? 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className={`font-bold line-clamp-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {p.title}
                              </span>
                              {p.isOutlier && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-500">
                                  Outlier
                                </span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'} line-clamp-1`}>
                              {p.address}, {p.area}
                            </p>
                            <div className="flex justify-between items-center mt-2.5">
                              <span className="font-bold text-blue-500">
                                €{p.price.toLocaleString()}
                              </span>
                              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {p.sqm <= 15 ? (
                                  `${p.sqm} ${p.sqm === 1 ? 'unit' : 'units'} • €${Math.round(p.price / p.sqm).toLocaleString()}/unit`
                                ) : (
                                  `${p.sqm} sqm • €${Math.round(p.price / p.sqm).toLocaleString()}/sqm`
                                )}
                              </span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <h3 className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                Analytics & Clusters
              </h3>

              {/* Metrics cards */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-150 bg-slate-55'}`}>
                  <p className="text-[10px] text-slate-500 font-medium">Total Points</p>
                  <p className={`mt-0.5 text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.totalPoints}
                  </p>
                </div>
                <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-150 bg-slate-55'}`}>
                  <p className="text-[10px] text-slate-500 font-medium">Clusters</p>
                  <p className={`mt-0.5 text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.clusterCount}
                  </p>
                </div>
                <div className={`rounded-xl border p-2.5 transition ${isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-150 bg-slate-55'}`}>
                  <p className="text-[10px] text-slate-500 font-medium">Outliers</p>
                  <p className={`mt-0.5 text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.outlierPoints}
                  </p>
                </div>
              </div>

              <p
                className={`mt-3 rounded-lg border p-2.5 text-[11px] font-medium leading-relaxed ${
                  analytics.outlierPoints > 0
                    ? isDark
                      ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                    : isDark
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      : 'border-emerald-250 bg-emerald-50 text-emerald-800'
                }`}
              >
                {analytics.outlierMessage}
              </p>

              {/* List of clusters */}
              <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 max-h-[300px]">
                {clusters.length === 0 ? (
                  <div className={`rounded-xl border border-dashed p-8 text-center text-xs ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
                    Upload a CSV file to inspect computed cluster groupings.
                  </div>
                ) : (
                  clusters.map((cluster, index) => {
                    const isSelected = cluster.id === selectedClusterId
                    const isOutlier = analytics.outlierClusterIds.includes(cluster.id)
                    return (
                      <button
                        key={cluster.id}
                        type="button"
                        onClick={() => setSelectedClusterId(cluster.id)}
                        className={`block w-full rounded-xl border p-3 text-left text-xs transition duration-200 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
                            : isDark
                              ? 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            Cluster {index + 1}
                          </span>
                          {isOutlier && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500">
                              Outlier
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-2 text-slate-500 dark:text-slate-400">
                          <div>Points: <strong className="text-slate-800 dark:text-slate-200">{cluster.pointCount}</strong></div>
                          <div>Avg Value: <strong className="text-slate-800 dark:text-slate-200">{Number(cluster.averageValue).toFixed(2)}</strong></div>
                          <div className="col-span-2 mt-0.5">Center: <span className="font-mono text-[10px]">{cluster.centroidLatitude.toFixed(5)}, {cluster.centroidLongitude.toFixed(5)}</span></div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'market' && properties.length > 0 && (
        <div className={`absolute bottom-6 left-6 w-[360px] rounded-2xl border shadow-2xl p-5 z-20 transition-all duration-200 ${
          isDark
            ? 'border-slate-800 bg-slate-900/95 text-slate-100 shadow-slate-950/80'
            : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-200/80'
        }`}>
          <h3 className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Market Trends (Last 12 Months)
          </h3>
          <PriceTrendChart properties={visibleProperties} />
        </div>
      )}

    </div>
  )
}

export default App
