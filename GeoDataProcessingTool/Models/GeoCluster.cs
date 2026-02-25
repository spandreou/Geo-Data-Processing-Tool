namespace GeoDataProcessingTool.Models;

public class GeoCluster
{
    public double CentroidLatitude { get; set; }
    public double CentroidLongitude { get; set; }
    public int PointCount { get; set; }
    public double AverageValue { get; set; }
}
