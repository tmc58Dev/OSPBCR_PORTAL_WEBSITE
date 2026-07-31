using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OSPBCR_PORTAL.Services;

namespace OSPBCR_PORTAL.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/registry")]
public sealed class RegistryController(IRegistryDataService registryDataService) : ControllerBase
{
    [HttpGet("health")]
    public async Task<IActionResult> Health(CancellationToken cancellationToken)
    {
        var health = await registryDataService.GetHealthAsync(cancellationToken);
        return health.Connected ? Ok(health) : StatusCode(StatusCodes.Status503ServiceUnavailable, health);
    }

    [HttpGet("district-status")]
    public async Task<IActionResult> DistrictStatus(CancellationToken cancellationToken)
    {
        var values = await registryDataService.GetDistrictStatusAsync(cancellationToken);
        return Ok(values);
    }

    [HttpGet("district-statistics")]
    public async Task<IActionResult> DistrictStatistics(CancellationToken cancellationToken)
    {
        var values = await registryDataService.GetDistrictStatisticsAsync(cancellationToken);
        return Ok(values);
    }

    [HttpGet("facilities")]
    public async Task<IActionResult> Facilities(CancellationToken cancellationToken)
    {
        var values = await registryDataService.GetFacilitiesAsync(cancellationToken);
        return Ok(values);
    }

    [HttpGet("cancer-site-incidence")]
    public async Task<IActionResult> CancerSiteIncidence(
        [FromQuery] int year = 2025,
        [FromQuery] int? sex = null,
        [FromQuery] string? district = null,
        CancellationToken cancellationToken = default)
    {
        if (year is < 1900 or > 2100)
        {
            return BadRequest("Year must be between 1900 and 2100.");
        }

        if (sex is not null and not 1 and not 2)
        {
            return BadRequest("Sex must be 1 for Male or 2 for Female.");
        }

        district = string.IsNullOrWhiteSpace(district) ? null : district.Trim();

        if (district?.Length > 100)
        {
            return BadRequest("District must be 100 characters or fewer.");
        }

        var values = await registryDataService.GetCancerSiteIncidenceAsync(year, sex, district, cancellationToken);
        return Ok(values);
    }

    [HttpGet("cancer-site-mortality")]
    public async Task<IActionResult> CancerSiteMortality(
        [FromQuery] int year = 2025,
        [FromQuery] int? sex = null,
        [FromQuery] string? district = null,
        CancellationToken cancellationToken = default)
    {
        if (year is < 1900 or > 2100)
        {
            return BadRequest("Year must be between 1900 and 2100.");
        }

        if (sex is not null and not 1 and not 2)
        {
            return BadRequest("Sex must be 1 for Male or 2 for Female.");
        }

        district = string.IsNullOrWhiteSpace(district) ? null : district.Trim();

        if (district?.Length > 100)
        {
            return BadRequest("District must be 100 characters or fewer.");
        }

        var values = await registryDataService.GetCancerSiteMortalityAsync(year, sex, district, cancellationToken);
        return Ok(values);
    }

    [HttpGet("cancer-age-incidence")]
    public async Task<IActionResult> CancerAgeIncidence(
        [FromQuery] int year = 2025,
        [FromQuery] int? sex = null,
        [FromQuery] string? district = null,
        CancellationToken cancellationToken = default)
    {
        if (year is < 1900 or > 2100)
        {
            return BadRequest("Year must be between 1900 and 2100.");
        }

        if (sex is not null and not 1 and not 2)
        {
            return BadRequest("Sex must be 1 for Male or 2 for Female.");
        }

        district = string.IsNullOrWhiteSpace(district) ? null : district.Trim();

        if (district?.Length > 100)
        {
            return BadRequest("District must be 100 characters or fewer.");
        }

        var values = await registryDataService.GetCancerIncidenceAgeSitesAsync(
            year,
            sex,
            district,
            cancellationToken);

        return Ok(values);
    }

    [HttpGet("cancer-age-mortality")]
    public async Task<IActionResult> CancerAgeMortality(
        [FromQuery] int year = 2025,
        [FromQuery] int? sex = null,
        [FromQuery] string? district = null,
        CancellationToken cancellationToken = default)
    {
        if (year is < 1900 or > 2100)
        {
            return BadRequest("Year must be between 1900 and 2100.");
        }

        if (sex is not null and not 1 and not 2)
        {
            return BadRequest("Sex must be 1 for Male or 2 for Female.");
        }

        district = string.IsNullOrWhiteSpace(district) ? null : district.Trim();

        if (district?.Length > 100)
        {
            return BadRequest("District must be 100 characters or fewer.");
        }

        var values = await registryDataService.GetCancerMortalityAgeSitesAsync(
            year,
            sex,
            district,
            cancellationToken);

        return Ok(values);
    }
}
