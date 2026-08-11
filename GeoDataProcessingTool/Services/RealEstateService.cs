using GeoDataProcessingTool.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace GeoDataProcessingTool.Services;

public class RealEstateService
{
    public List<Property> ParsePropertiesFromCsv(Stream fileStream)
    {
        var properties = new List<Property>();
        using var reader = new StreamReader(fileStream);

        string? headerLine = reader.ReadLine();
        if (string.IsNullOrWhiteSpace(headerLine)) return properties;

        var headers = SplitCsvLine(headerLine).Select(h => h.ToLowerInvariant()).ToList();

        int latIndex = -1, lngIndex = -1, priceIndex = -1, sqmIndex = -1;
        int areaIndex = -1, titleIndex = -1, addressIndex = -1;

        var latSynonyms = new[] { "latitude", "lat", "y", "centroidlatitude", "centroidlat", "centroid_lat", "centroid_latitude" };
        var lngSynonyms = new[] { "longitude", "lon", "lng", "x", "centroidlongitude", "centroidlon", "centroidlng", "centroid_lon", "centroid_lng", "centroid_longitude" };
        var priceSynonyms = new[] { "price", "value", "cost", "amount", "val", "revenue" };
        var sqmSynonyms = new[] { "sqm", "size", "sq_meters", "square_meters", "area_sqm", "area_size", "sqmeters", "bedrooms", "bedroom", "beds", "bed", "accommodates", "guests", "capacity" };
        var areaSynonyms = new[] { "area", "region", "location", "city", "neighbourhood", "neighborhood", "district", "borough" };
        var titleSynonyms = new[] { "title", "name", "description" };
        var addressSynonyms = new[] { "address", "street", "addr" };

        for (int i = 0; i < headers.Count; i++)
        {
            string h = headers[i];
            if (latIndex == -1 && latSynonyms.Contains(h)) latIndex = i;
            else if (lngIndex == -1 && lngSynonyms.Contains(h)) lngIndex = i;
            else if (priceIndex == -1 && priceSynonyms.Contains(h)) priceIndex = i;
            else if (sqmIndex == -1 && sqmSynonyms.Contains(h)) sqmIndex = i;
            else if (areaIndex == -1 && areaSynonyms.Contains(h)) areaIndex = i;
            else if (titleIndex == -1 && titleSynonyms.Contains(h)) titleIndex = i;
            else if (addressIndex == -1 && addressSynonyms.Contains(h)) addressIndex = i;
        }

        // Validate that coordinates and price are present at least (size is optional, defaults to 1)
        if (latIndex == -1 || lngIndex == -1 || priceIndex == -1)
        {
            throw new Exception("CSV must contain columns for coordinates (latitude, longitude) and price (price/value).");
        }

        int idCounter = 1;
        // Generate dates over the last 12 months dynamically to construct a realistic trend line chart
        var rand = new Random();
        var now = DateTime.UtcNow;

        while (!reader.EndOfStream)
        {
            string? line = reader.ReadLine();
            if (string.IsNullOrWhiteSpace(line)) continue;

            var columns = SplitCsvLine(line);
            int maxRequiredIndex = Math.Max(latIndex, Math.Max(lngIndex, priceIndex));
            if (columns.Count <= maxRequiredIndex) continue;

            try
            {
                if (!double.TryParse(columns[latIndex], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lat))
                    continue;
                if (!double.TryParse(columns[lngIndex], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lng))
                    continue;

                double price = ParseCurrency(columns[priceIndex], true);

                double sqm = 1;
                if (sqmIndex != -1 && sqmIndex < columns.Count)
                {
                    double parsedSqm = ParseCurrency(columns[sqmIndex], false);
                    if (parsedSqm > 0)
                    {
                        sqm = parsedSqm;
                    }
                }

                if (lat == 0 || lng == 0 || price <= 0 || sqm <= 0) continue; // invalid row

                string title = titleIndex != -1 && titleIndex < columns.Count && !string.IsNullOrWhiteSpace(columns[titleIndex])
                    ? columns[titleIndex]
                    : $"Listing #{idCounter}";

                string area = areaIndex != -1 && areaIndex < columns.Count && !string.IsNullOrWhiteSpace(columns[areaIndex])
                    ? columns[areaIndex]
                    : "Default Area";

                string address = addressIndex != -1 && addressIndex < columns.Count && !string.IsNullOrWhiteSpace(columns[addressIndex])
                    ? columns[addressIndex]
                    : "N/A";

                // Distribute creation date across the last 12 months to support the trend chart
                var listingDate = now.AddMonths(-rand.Next(0, 12)).AddDays(-rand.Next(0, 28));

                properties.Add(new Property
                {
                    Id = idCounter++,
                    Title = title,
                    Area = area,
                    Address = address,
                    Price = price,
                    Sqm = sqm,
                    Lat = lat,
                    Lng = lng,
                    CreatedAt = listingDate.ToString("yyyy-MM-dd")
                });
            }
            catch
            {
                // Skip malformed rows
            }
        }

        CalculateOutliersForList(properties);
        return properties;
    }

    private void CalculateOutliersForList(List<Property> properties)
    {
        // Detect outliers by area using Z-score of price-per-sqm
        var grouped = properties.GroupBy(p => p.Area);
        foreach (var group in grouped)
        {
            var list = group.ToList();
            if (list.Count < 2) continue;

            var pricePerSqms = list.Select(p => p.Price / p.Sqm).ToList();
            var mean = pricePerSqms.Average();
            var sumOfSquares = pricePerSqms.Select(val => (val - mean) * (val - mean)).Sum();
            var stdDev = Math.Sqrt(sumOfSquares / pricePerSqms.Count);

            foreach (var p in list)
            {
                var pricePerSqm = p.Price / p.Sqm;
                if (stdDev > 0)
                {
                    var zScore = Math.Abs(pricePerSqm - mean) / stdDev;
                    // Highlight properties more than 1.5 standard deviations from the mean
                    p.IsOutlier = zScore > 1.5;
                }
            }
        }
    }

    private static List<string> SplitCsvLine(string line)
    {
        var result = new List<string>();
        var inQuotes = false;
        var current = new System.Text.StringBuilder();

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString().Trim());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        result.Add(current.ToString().Trim());
        return result;
    }

    private static double ParseCurrency(string value, bool isPrice)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;

        var val = value.Trim().Replace(" ", "");

        // Remove currency symbols
        val = val.Replace("€", "").Replace("$", "").Replace("£", "");

        // If both dot and comma are present:
        int lastComma = val.LastIndexOf(',');
        int lastDot = val.LastIndexOf('.');
        if (lastComma != -1 && lastDot != -1)
        {
            if (lastComma > lastDot)
            {
                // European: e.g. "1.234,56" -> remove dots, replace comma with dot
                val = val.Replace(".", "").Replace(",", ".");
            }
            else
            {
                // US: e.g. "1,234.56" -> remove commas
                val = val.Replace(",", "");
            }
        }
        else if (lastComma != -1)
        {
            // Only comma is present: e.g. "238,000" or "980,50"
            int digitsAfter = val.Length - 1 - lastComma;
            if (digitsAfter == 3 && isPrice)
            {
                val = val.Replace(",", "");
            }
            else
            {
                val = val.Replace(",", ".");
            }
        }
        else if (lastDot != -1)
        {
            // Only dot is present: e.g. "238.000" or "120.5" or "2.800.000"
            if (val.Count(c => c == '.') > 1)
            {
                val = val.Replace(".", "");
            }
            else
            {
                int digitsAfter = val.Length - 1 - lastDot;
                if (digitsAfter == 3 && isPrice)
                {
                    val = val.Replace(".", "");
                }
            }
        }

        var cleaned = new System.Text.StringBuilder();
        bool hasDot = false;
        foreach (char c in val)
        {
            if (char.IsDigit(c) || c == '-')
            {
                cleaned.Append(c);
            }
            else if (c == '.' && !hasDot)
            {
                cleaned.Append(c);
                hasDot = true;
            }
        }

        if (double.TryParse(cleaned.ToString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double parsed))
        {
            return parsed;
        }
        return 0;
    }
}
