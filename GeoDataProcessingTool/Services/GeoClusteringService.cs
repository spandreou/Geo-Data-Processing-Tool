using GeoDataProcessingTool.Models;
using NetTopologySuite;
using NetTopologySuite.Geometries;
using NetTopologySuite.Index.Strtree;

namespace GeoDataProcessingTool.Services;

public class GeoClusteringService
{
    private readonly GeometryFactory _wgs84Factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
    private readonly GeometryFactory _metricFactory = NtsGeometryServices.Instance.CreateGeometryFactory();

    public IReadOnlyList<GeoCluster> Cluster(IReadOnlyList<GeoPoint> points, double radiusMeters)
    {
        if (points.Count == 0)
        {
            return Array.Empty<GeoCluster>();
        }

        var referenceLatitude = points.Average(p => p.Latitude);
        const double metersPerDegreeLat = 111_320d;
        var metersPerDegreeLon = Math.Max(1d, metersPerDegreeLat * Math.Cos(referenceLatitude * Math.PI / 180d));

        var metricCoordinates = new Coordinate[points.Count];
        var metricPoints = new Point[points.Count];
        var wgs84Points = new Point[points.Count];
        var index = new STRtree<int>();

        for (var i = 0; i < points.Count; i++)
        {
            var point = points[i];

            var metricCoordinate = new Coordinate(
                point.Longitude * metersPerDegreeLon,
                point.Latitude * metersPerDegreeLat);

            metricCoordinates[i] = metricCoordinate;
            metricPoints[i] = _metricFactory.CreatePoint(metricCoordinate);
            wgs84Points[i] = _wgs84Factory.CreatePoint(new Coordinate(point.Longitude, point.Latitude));

            index.Insert(CreateSearchEnvelope(metricCoordinate, radiusMeters), i);
        }

        index.Build();

        var visited = new bool[points.Count];
        var clusters = new List<GeoCluster>();

        for (var i = 0; i < points.Count; i++)
        {
            if (visited[i])
            {
                continue;
            }

            var clusterIndexes = CollectCluster(i, radiusMeters, index, visited, metricCoordinates, metricPoints);
            clusters.Add(BuildCluster(clusterIndexes, points, wgs84Points));
        }

        return clusters;
    }

    private static List<int> CollectCluster(
        int startIndex,
        double radiusMeters,
        STRtree<int> index,
        bool[] visited,
        Coordinate[] metricCoordinates,
        Point[] metricPoints)
    {
        var queue = new Queue<int>();
        var clusterIndexes = new List<int>();
        queue.Enqueue(startIndex);

        while (queue.Count > 0)
        {
            var currentIndex = queue.Dequeue();
            if (visited[currentIndex])
            {
                continue;
            }

            visited[currentIndex] = true;
            clusterIndexes.Add(currentIndex);

            var searchEnvelope = CreateSearchEnvelope(metricCoordinates[currentIndex], radiusMeters);
            var candidateIndexes = index.Query(searchEnvelope);

            foreach (var candidateIndex in candidateIndexes)
            {
                if (visited[candidateIndex])
                {
                    continue;
                }

                if (metricPoints[currentIndex].Distance(metricPoints[candidateIndex]) <= radiusMeters)
                {
                    queue.Enqueue(candidateIndex);
                }
            }
        }

        return clusterIndexes;
    }

    private GeoCluster BuildCluster(IReadOnlyList<int> clusterIndexes, IReadOnlyList<GeoPoint> sourcePoints, Point[] wgs84Points)
    {
        var clusterPoints = clusterIndexes.Select(i => wgs84Points[i]).ToArray();
        var centroid = _wgs84Factory.CreateMultiPoint(clusterPoints).Centroid;
        var averageValue = clusterIndexes.Average(i => sourcePoints[i].Value);

        return new GeoCluster
        {
            CentroidLatitude = centroid.Y,
            CentroidLongitude = centroid.X,
            PointCount = clusterIndexes.Count,
            AverageValue = averageValue
        };
    }

    private static Envelope CreateSearchEnvelope(Coordinate coordinate, double radiusMeters)
    {
        return new Envelope(
            coordinate.X - radiusMeters,
            coordinate.X + radiusMeters,
            coordinate.Y - radiusMeters,
            coordinate.Y + radiusMeters);
    }
}
