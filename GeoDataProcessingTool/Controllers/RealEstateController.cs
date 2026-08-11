using GeoDataProcessingTool.Models;
using GeoDataProcessingTool.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;

namespace GeoDataProcessingTool.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RealEstateController : ControllerBase
{
    private readonly RealEstateService _realEstateService;

    public RealEstateController(RealEstateService realEstateService)
    {
        _realEstateService = realEstateService;
    }

    [HttpPost("upload")]
    public ActionResult<List<Property>> UploadRealEstateCsv(IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Please upload a valid CSV file." });
        }

        try
        {
            using var stream = file.OpenReadStream();
            var properties = _realEstateService.ParsePropertiesFromCsv(stream);
            return Ok(properties);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
