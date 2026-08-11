using CsvHelper;
using CsvHelper.Configuration;
using GeoDataProcessingTool.Models;
using GeoDataProcessingTool.Services;
using Microsoft.AspNetCore.Mvc;
using System.Globalization;

namespace GeoDataProcessingTool.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GeoController : ControllerBase
{
    private readonly GeoClusteringService _clusteringService;

    public GeoController(GeoClusteringService clusteringService)
    {
        _clusteringService = clusteringService;
    }

    [HttpPost("upload")]
    public async Task<IActionResult> Upload([FromForm] IFormFile? file, [FromQuery] double radiusMeters = 500d)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "Please upload a non-empty CSV file." });
        }

        if (radiusMeters <= 0)
        {
            return BadRequest(new { message = "Radius must be a positive number." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            using var reader = new StreamReader(stream);

            var config = new CsvConfiguration(CultureInfo.InvariantCulture)
            {
                PrepareHeaderForMatch = args => args.Header?.Trim() ?? string.Empty,
                MissingFieldFound = null,
                HeaderValidated = null,
                BadDataFound = null,
            };

            using var csv = new CsvReader(reader, config);
            var points = await ReadPointsAsync(csv);
            var clusters = _clusteringService.Cluster(points, radiusMeters);

            return Ok(clusters);
        }
        catch (FormatException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new
            {
                message = "Invalid CSV format.",
                detail = ex.Message,
            });
        }
    }

    private static readonly string[] LatitudeKeys = new[]
    {
        "latitude", "lat", "y", "centroidlatitude", "centroidlat", "centroid_lat", "centroid_latitude"
    };

    private static readonly string[] LongitudeKeys = new[]
    {
        "longitude", "lon", "lng", "x", "centroidlongitude", "centroidlon", "centroidlng", "centroid_lon", "centroid_lng", "centroid_longitude"
    };

    private static readonly string[] ValueKeys = new[]
    {
        "value", "price", "amount", "cost", "val", "revenue", "points", "count"
    };

    private static bool TryFindIndex(Dictionary<string, int> headerIndexes, string[] keys, out int foundIndex)
    {
        foundIndex = -1;
        foreach (var key in keys)
        {
            if (headerIndexes.TryGetValue(key, out foundIndex))
            {
                return true;
            }
        }
        return false;
    }

    private static async Task<List<GeoPoint>> ReadPointsAsync(CsvReader csv)
    {
        if (!await csv.ReadAsync() || !csv.ReadHeader())
        {
            throw new FormatException("CSV file is empty or missing headers.");
        }

        var headerIndexes = BuildHeaderIndexes(csv.HeaderRecord ?? Array.Empty<string>());

        if (!TryFindIndex(headerIndexes, LatitudeKeys, out var latitudeIndex))
        {
            throw new FormatException($"CSV must include a latitude column (accepted: {string.Join(", ", LatitudeKeys)}).");
        }

        if (!TryFindIndex(headerIndexes, LongitudeKeys, out var longitudeIndex))
        {
            throw new FormatException($"CSV must include a longitude column (accepted: {string.Join(", ", LongitudeKeys)}).");
        }

        if (!TryFindIndex(headerIndexes, ValueKeys, out var valueIndex))
        {
            throw new FormatException($"CSV must include a value or price column (accepted: {string.Join(", ", ValueKeys)}).");
        }

        var points = new List<GeoPoint>();

        while (await csv.ReadAsync())
        {
            var latitudeRaw = csv.GetField(latitudeIndex);
            var longitudeRaw = csv.GetField(longitudeIndex);
            var valueRaw = csv.GetField(valueIndex);

            if (!TryParseCoordinate(latitudeRaw, out var latitude) ||
                !TryParseCoordinate(longitudeRaw, out var longitude) ||
                !TryParseValue(valueRaw, out var value))
            {
                continue;
            }

            points.Add(new GeoPoint
            {
                Latitude = latitude,
                Longitude = longitude,
                Value = value,
            });
        }

        if (points.Count == 0)
        {
            throw new FormatException("CSV contains no valid rows after parsing coordinates and value.");
        }

        return points;
    }

    private static Dictionary<string, int> BuildHeaderIndexes(string[] headers)
    {
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < headers.Length; index++)
        {
            var header = headers[index]?.Trim();
            if (string.IsNullOrWhiteSpace(header) || result.ContainsKey(header))
            {
                continue;
            }

            result[header] = index;
        }

        return result;
    }

    private static bool TryParseCoordinate(string? input, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var text = input.Trim();

        return double.TryParse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out value) ||
               double.TryParse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.GetCultureInfo("el-GR"), out value);
    }

    private static bool TryParseValue(string? input, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var cleaned = CleanPrice(input);
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return false;
        }

        return double.TryParse(cleaned, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static string CleanPrice(string rawValue)
    {
        var buffer = new char[rawValue.Length];
        var count = 0;

        foreach (var character in rawValue)
        {
            if (char.IsDigit(character) || character is '.' or '-')
            {
                buffer[count++] = character;
            }
        }

        return new string(buffer, 0, count);
    }
}
