using System;

namespace GeoDataProcessingTool.Models;

public class Property
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public double Price { get; set; }
    public double Sqm { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public bool IsOutlier { get; set; }
}
