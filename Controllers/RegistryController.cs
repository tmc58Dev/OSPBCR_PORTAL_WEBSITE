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
        return await ExecuteQueryAsync(
            registryDataService.GetHealthAsync,
            health => health.Connected
                ? Ok(health)
                : StatusCode(StatusCodes.Status503ServiceUnavailable, health),
            cancellationToken);
    }

    [HttpGet("district-status")]
    public async Task<IActionResult> DistrictStatus(CancellationToken cancellationToken)
    {
        return await ExecuteQueryAsync(
            registryDataService.GetDistrictStatusAsync,
            Ok,
            cancellationToken);
    }

    [HttpGet("district-statistics")]
    public async Task<IActionResult> DistrictStatistics(CancellationToken cancellationToken)
    {
        return await ExecuteQueryAsync(
            registryDataService.GetDistrictStatisticsAsync,
            Ok,
            cancellationToken);
    }

    [HttpGet("facilities")]
    public async Task<IActionResult> Facilities(CancellationToken cancellationToken)
    {
        return await ExecuteQueryAsync(
            registryDataService.GetFacilitiesAsync,
            Ok,
            cancellationToken);
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

        return await ExecuteQueryAsync(
            token => registryDataService.GetCancerSiteIncidenceAsync(year, sex, district, token),
            Ok,
            cancellationToken);
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

        return await ExecuteQueryAsync(
            token => registryDataService.GetCancerSiteMortalityAsync(year, sex, district, token),
            Ok,
            cancellationToken);
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

        return await ExecuteQueryAsync(
            token => registryDataService.GetCancerIncidenceAgeSitesAsync(year, sex, district, token),
            Ok,
            cancellationToken);
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

        return await ExecuteQueryAsync(
            token => registryDataService.GetCancerMortalityAgeSitesAsync(year, sex, district, token),
            Ok,
            cancellationToken);
    }

    private async Task<IActionResult> ExecuteQueryAsync<T>(
        Func<CancellationToken, Task<T>> query,
        Func<T, IActionResult> createResult,
        CancellationToken cancellationToken)
    {
        try
        {
            return createResult(await query(cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return new EmptyResult();
        }
    }
}
