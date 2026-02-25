import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, LoaderCircle, Moon, Sun } from 'lucide-react'
import ClusterMap from './components/ClusterMap'

const OUTLIER_DISTANCE_METERS = 1500
const LIGHT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

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
  const [clusters, setClusters] = useState([])
  const [selectedClusterId, setSelectedClusterId] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('geo-theme') || 'light')

  const isDark = theme === 'dark'

  useEffect(() => {
    localStorage.setItem('geo-theme', theme)
  }, [theme])

  const selectedCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  )

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

  const handleUploadClick = () => {
    inputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setIsUploading(true)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/geo/upload', {
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
      const normalizedClusters = normalizeClusters(payload)
      setClusters(normalizedClusters)
      setSelectedClusterId(normalizedClusters[0]?.id ?? null)
    } catch (error) {
      setClusters([])
      setSelectedClusterId(null)
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected upload error.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={`h-full ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <div className="flex h-full flex-col lg:flex-row">
        <aside
          className={`z-20 w-full border-b p-5 shadow-sm lg:h-full lg:w-[320px] lg:border-b-0 lg:border-r ${
            isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-semibold">Geo Data Processing Tool</h1>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                isDark
                  ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {isDark ? 'Light' : 'Dark'}
            </button>
          </div>

          <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Upload a CSV file to run clustering and preview the results on the map.
          </p>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Accepted headers: latitude/longitude and value or price (case-insensitive). Price can include $, euro symbol, and commas.
          </p>

          <button
            type="button"
            onClick={handleUploadClick}
            disabled={isUploading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Upload CSV
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {errorMessage && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>
          )}
        </aside>

        <main className="relative min-h-[46vh] min-w-0 flex-1 lg:min-h-0">
          <ClusterMap
            clusters={clusters}
            outlierClusterIds={analytics.outlierClusterIds}
            selectedClusterId={selectedClusterId}
            focusedCluster={selectedCluster}
            mapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
            isDarkMode={isDark}
            mapOpacity={1}
          />
        </main>

        <section
          className={`relative h-[44vh] w-full overflow-hidden border-t lg:h-full lg:w-[360px] lg:border-l lg:border-t-0 xl:w-[400px] ${
            isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="relative z-10 h-full overflow-y-auto p-4">
            <h2 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Analytics & Data</h2>

            <div
              className={`mt-3 rounded-lg border p-3 ${
                isDark ? 'border-slate-300/20 bg-slate-900/75' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`rounded-md border p-2 ${
                    isDark ? 'border-slate-300/20 bg-slate-950/80' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Total Points</p>
                  <p className={`mt-1 text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.totalPoints}
                  </p>
                </div>
                <div
                  className={`rounded-md border p-2 ${
                    isDark ? 'border-slate-300/20 bg-slate-950/80' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Clusters</p>
                  <p className={`mt-1 text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.clusterCount}
                  </p>
                </div>
                <div
                  className={`col-span-2 rounded-md border p-2 ${
                    isDark ? 'border-slate-300/20 bg-slate-950/80' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Outlier Points</p>
                  <p className={`mt-1 text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {analytics.outlierPoints}
                  </p>
                </div>
              </div>

              <p
                className={`mt-3 rounded-md border p-2 text-xs ${
                  analytics.outlierPoints > 0
                    ? 'border-amber-300/40 bg-amber-500/10 text-amber-100'
                    : isDark
                      ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {analytics.outlierMessage}
              </p>
            </div>

            <div className="mt-3 space-y-2 pb-2">
              {clusters.length === 0 && (
                <p
                  className={`rounded-md border p-3 text-xs ${
                    isDark
                      ? 'border-slate-300/20 bg-slate-900/40 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  Upload a CSV to show cluster details here.
                </p>
              )}

              {clusters.map((cluster, index) => {
                const isSelected = cluster.id === selectedClusterId
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => setSelectedClusterId(cluster.id)}
                    className={`block w-full rounded-md border p-3 text-left text-sm transition ${
                      isSelected
                        ? 'border-blue-300/70 bg-blue-500/18 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]'
                        : isDark
                          ? 'border-slate-300/20 bg-slate-900/70 hover:border-slate-300/40 hover:bg-slate-800/85'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className={`font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Cluster {index + 1}</p>
                    <p className={`${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Points: {cluster.pointCount}</p>
                    <p className={`${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Avg Value: {Number(cluster.averageValue).toFixed(2)}
                    </p>
                    <p className={`${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Center: {cluster.centroidLatitude.toFixed(4)}, {cluster.centroidLongitude.toFixed(4)}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
